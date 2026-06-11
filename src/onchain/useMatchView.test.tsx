import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, type Mock } from 'vitest'
import type { BattleshipReadClient, MatchEventRef } from './client/battleshipClient'
import type { ChainMatchView } from './client/mapping'
import { useMatchView } from './useMatchView'

const CREATOR = '0xaaaa000000000000000000000000000000000001' as const

function view(over: Partial<ChainMatchView> = {}): ChainMatchView {
  return {
    deploymentId: 'arb-sepolia-v1',
    matchId: '7',
    matchIdBig: 7n,
    status: 'WaitingForOpponent',
    matchType: 'Friend',
    creator: CREATOR,
    opponent: null,
    invitedOpponent: '0xbbbb000000000000000000000000000000000002',
    currentTurn: null,
    winner: null,
    createdAt: 1,
    joinedAt: 0,
    startedAt: 0,
    finishedAt: 0,
    lastActionAt: 1,
    moveCount: 0,
    pendingMoveId: 0,
    deadlines: { joinDeadline: 100, placementDeadline: 0, turnDeadline: 0, resolvingDeadline: 0 },
    ...over,
  }
}

interface FakeReadClient extends BattleshipReadClient {
  getMatch: Mock<(matchId: bigint) => Promise<ChainMatchView | null>>
  emit: (events: MatchEventRef[]) => void
  unwatch: ReturnType<typeof vi.fn>
}

function fakeReadClient(initial: ChainMatchView | null = view()): FakeReadClient {
  let listener: ((events: MatchEventRef[]) => void) | null = null
  const unwatch = vi.fn()
  const client: FakeReadClient = {
    getMatch: vi.fn<(matchId: bigint) => Promise<ChainMatchView | null>>(async () => initial),
    watchMatch: (_matchId: bigint, onEvents: (events: MatchEventRef[]) => void) => {
      listener = onEvents
      return unwatch
    },
    emit: (events) => listener?.(events),
    unwatch,
  }
  return client
}

const eventRef = (logIndex: number, blockHash = '0xb1'): MatchEventRef => ({
  eventName: 'MatchJoined',
  blockHash,
  logIndex,
  transactionHash: '0xt1',
})

describe('useMatchView (GAME-509/510)', () => {
  it('loads the match and reports ready', async () => {
    const client = fakeReadClient()
    const { result } = renderHook(() =>
      useMatchView({ readClient: client, matchId: 7n, accountEpoch: 0, chainId: 421614 }),
    )
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.match!.matchId).toBe('7')
  })

  it('reports not-found when the contract has no such match', async () => {
    const client = fakeReadClient(null)
    const { result } = renderHook(() =>
      useMatchView({ readClient: client, matchId: 9n, accountEpoch: 0, chainId: 421614 }),
    )
    await waitFor(() => expect(result.current.status).toBe('not-found'))
  })

  it('maps read failures to a recoverable error with retry', async () => {
    const client = fakeReadClient()
    client.getMatch.mockRejectedValueOnce(new Error('rpc down'))
    const { result } = renderHook(() =>
      useMatchView({ readClient: client, matchId: 7n, accountEpoch: 0, chainId: 421614 }),
    )
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('match-load-failed')

    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('is idle without a read client or match id', () => {
    const { result } = renderHook(() =>
      useMatchView({ readClient: null, matchId: null, accountEpoch: 0, chainId: null }),
    )
    expect(result.current.status).toBe('idle')
  })

  it('refetches on fresh match events and dedupes repeated logs (GAME-509)', async () => {
    const client = fakeReadClient()
    const { result } = renderHook(() =>
      useMatchView({ readClient: client, matchId: 7n, accountEpoch: 0, chainId: 421614 }),
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const callsAfterLoad = client.getMatch.mock.calls.length

    act(() => client.emit([eventRef(0)]))
    await waitFor(() => expect(client.getMatch.mock.calls.length).toBe(callsAfterLoad + 1))

    // The same log delivered again must not trigger another read.
    act(() => client.emit([eventRef(0)]))
    await new Promise((r) => setTimeout(r, 10))
    expect(client.getMatch.mock.calls.length).toBe(callsAfterLoad + 1)

    // A new log does.
    act(() => client.emit([eventRef(1)]))
    await waitFor(() => expect(client.getMatch.mock.calls.length).toBe(callsAfterLoad + 2))
  })

  it('refetches when the window regains focus or comes back online (GAME-510)', async () => {
    const client = fakeReadClient()
    const { result } = renderHook(() =>
      useMatchView({ readClient: client, matchId: 7n, accountEpoch: 0, chainId: 421614 }),
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const callsAfterLoad = client.getMatch.mock.calls.length

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => expect(client.getMatch.mock.calls.length).toBe(callsAfterLoad + 1))

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(client.getMatch.mock.calls.length).toBe(callsAfterLoad + 2))
  })

  it('re-reads on account epoch and chain changes (GAME-510)', async () => {
    const client = fakeReadClient()
    const { result, rerender } = renderHook(
      ({ epoch, chainId }: { epoch: number; chainId: number }) =>
        useMatchView({ readClient: client, matchId: 7n, accountEpoch: epoch, chainId }),
      { initialProps: { epoch: 0, chainId: 421614 } },
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const callsAfterLoad = client.getMatch.mock.calls.length

    rerender({ epoch: 1, chainId: 421614 })
    await waitFor(() => expect(client.getMatch.mock.calls.length).toBe(callsAfterLoad + 1))

    rerender({ epoch: 1, chainId: 1 })
    await waitFor(() => expect(client.getMatch.mock.calls.length).toBe(callsAfterLoad + 2))
  })

  it('stops watching on unmount', async () => {
    const client = fakeReadClient()
    const { result, unmount } = renderHook(() =>
      useMatchView({ readClient: client, matchId: 7n, accountEpoch: 0, chainId: 421614 }),
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    unmount()
    expect(client.unwatch).toHaveBeenCalled()
  })
})
