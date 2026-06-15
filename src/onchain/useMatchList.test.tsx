import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, type Mock } from 'vitest'
import type { BattleshipReadClient } from './client/battleshipClient'
import type { ChainMatchView } from './client/mapping'
import type { HexAddress, MatchStatus } from './phaseResolver'
import {
  matchListBucket,
  toMatchListEntry,
  useMatchList,
} from './useMatchList'

const VIEWER = '0xaaaa000000000000000000000000000000000001' as HexAddress
const OTHER = '0xbbbb000000000000000000000000000000000002' as HexAddress

function view(over: Partial<ChainMatchView> = {}): ChainMatchView {
  const id = over.matchIdBig ?? 7n
  return {
    deploymentId: 'arb-sepolia-v1',
    matchId: id.toString(),
    matchIdBig: id,
    status: 'WaitingForOpponent',
    matchType: 'Friend',
    creator: VIEWER,
    opponent: null,
    invitedOpponent: OTHER,
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

interface FakeListClient extends BattleshipReadClient {
  getMatch: Mock<(matchId: bigint) => Promise<ChainMatchView | null>>
  getPlayerMatchCount: Mock<(player: HexAddress) => Promise<number>>
  getPlayerMatches: Mock<(player: HexAddress, offset: number, limit: number) => Promise<bigint[]>>
}

/** Read client backed by an oldest-first id index and per-id match views. */
function fakeListClient(matches: ChainMatchView[]): FakeListClient {
  const byId = new Map(matches.map((m) => [m.matchIdBig, m]))
  const ids = matches.map((m) => m.matchIdBig)
  return {
    getMatch: vi.fn(async (matchId: bigint) => byId.get(matchId) ?? null),
    getPlayerMatchCount: vi.fn(async () => ids.length),
    getPlayerMatches: vi.fn(async (_player, offset, limit) => {
      if (limit === 0 || limit > 50) throw new Error('InvalidPaginationLimit')
      return ids.slice(offset, offset + limit)
    }),
    watchMatch: () => () => {},
  }
}

function renderList(
  client: BattleshipReadClient | null,
  over: Partial<Parameters<typeof useMatchList>[0]> = {},
) {
  return renderHook(
    (props: { address: HexAddress | null; accountEpoch: number }) =>
      useMatchList({
        readClient: client,
        address: props.address,
        accountEpoch: props.accountEpoch,
        chainId: 421614,
        ...over,
      }),
    { initialProps: { address: VIEWER as HexAddress | null, accountEpoch: 0 } },
  )
}

describe('matchListBucket', () => {
  it('maps every contract status into the three sections', () => {
    const expected: Record<MatchStatus, ReturnType<typeof matchListBucket>> = {
      WaitingForOpponent: 'waiting',
      WaitingForPlacement: 'active',
      ValidatingPlacement: 'active',
      ReadyToStart: 'active',
      InProgress: 'active',
      ResolvingShot: 'active',
      Finished: 'finished',
      Cancelled: 'finished',
      Forfeited: 'finished',
    }
    for (const [status, bucket] of Object.entries(expected)) {
      expect(matchListBucket(status as MatchStatus)).toBe(bucket)
    }
  })
})

describe('toMatchListEntry', () => {
  it('derives the creator role and the invited opponent before the join', () => {
    const entry = toMatchListEntry(view(), VIEWER)
    expect(entry.isCreator).toBe(true)
    expect(entry.opponent).toBe(OTHER)
    expect(entry.won).toBeNull()
  })

  it('derives the joiner role with the creator as opponent', () => {
    const entry = toMatchListEntry(
      view({ creator: OTHER, opponent: VIEWER, invitedOpponent: VIEWER, status: 'InProgress' }),
      VIEWER,
    )
    expect(entry.isCreator).toBe(false)
    expect(entry.opponent).toBe(OTHER)
    expect(entry.bucket).toBe('active')
  })

  it('scores win/loss from the viewer perspective, not the creator slot', () => {
    const finished = view({
      creator: OTHER,
      opponent: VIEWER,
      status: 'Finished',
      winner: VIEWER,
    })
    expect(toMatchListEntry(finished, VIEWER).won).toBe(true)
    expect(toMatchListEntry(finished, OTHER).won).toBe(false)
  })

  it('leaves won null for a cancelled match without a winner', () => {
    const entry = toMatchListEntry(view({ status: 'Cancelled' }), VIEWER)
    expect(entry.bucket).toBe('finished')
    expect(entry.won).toBeNull()
  })
})

describe('useMatchList', () => {
  it('is idle without a read client', () => {
    const { result } = renderList(null)
    expect(result.current.status).toBe('idle')
  })

  it('is idle without an address', () => {
    const client = fakeListClient([view()])
    const { result } = renderHook(() =>
      useMatchList({ readClient: client, address: null, accountEpoch: 0, chainId: 421614 }),
    )
    expect(result.current.status).toBe('idle')
    expect(client.getPlayerMatchCount).not.toHaveBeenCalled()
  })

  it('is idle when the client cannot enumerate player matches', () => {
    const bare: BattleshipReadClient = {
      getMatch: vi.fn(async () => null),
      watchMatch: () => () => {},
    }
    const { result } = renderList(bare)
    expect(result.current.status).toBe('idle')
  })

  it('loads the newest page and orders entries newest first', async () => {
    const client = fakeListClient([
      view({ matchIdBig: 1n }),
      view({ matchIdBig: 2n }),
      view({ matchIdBig: 3n }),
    ])
    const { result } = renderList(client)
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.entries.map((e) => e.match.matchId)).toEqual(['3', '2', '1'])
    expect(result.current.totalCount).toBe(3)
    expect(result.current.hasMore).toBe(false)
  })

  it('skips the id read entirely for a wallet with zero matches', async () => {
    const client = fakeListClient([])
    const { result } = renderList(client)
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.entries).toEqual([])
    expect(client.getPlayerMatches).not.toHaveBeenCalled()
  })

  it('drops ids whose getMatch returns null', async () => {
    const client = fakeListClient([view({ matchIdBig: 1n }), view({ matchIdBig: 2n })])
    client.getMatch.mockImplementation(async (id) => (id === 2n ? null : view({ matchIdBig: id })))
    const { result } = renderList(client)
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.entries.map((e) => e.match.matchId)).toEqual(['1'])
    expect(result.current.partial).toBe(false)
  })

  it('keeps successes and flags partial when one hydration read rejects', async () => {
    const client = fakeListClient([view({ matchIdBig: 1n }), view({ matchIdBig: 2n })])
    client.getMatch.mockImplementation(async (id) => {
      if (id === 2n) throw new Error('rpc down')
      return view({ matchIdBig: id })
    })
    const { result } = renderList(client)
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.entries.map((e) => e.match.matchId)).toEqual(['1'])
    expect(result.current.partial).toBe(true)
  })

  it('reports an error when the count read fails and recovers on refetch', async () => {
    const client = fakeListClient([view()])
    client.getPlayerMatchCount.mockRejectedValueOnce(new Error('rpc down'))
    const { result } = renderList(client)
    await waitFor(() => expect(result.current.status).toBe('error'))
    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.entries).toHaveLength(1)
  })

  it('pages older matches via loadMore and dedupes across the window', async () => {
    const client = fakeListClient(
      [1n, 2n, 3n, 4n, 5n].map((id) => view({ matchIdBig: id })),
    )
    const { result } = renderList(client, { pageSize: 2 })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.entries.map((e) => e.match.matchId)).toEqual(['5', '4'])
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())
    await waitFor(() =>
      expect(result.current.entries.map((e) => e.match.matchId)).toEqual(['5', '4', '3', '2']),
    )
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())
    await waitFor(() =>
      expect(result.current.entries.map((e) => e.match.matchId)).toEqual([
        '5', '4', '3', '2', '1',
      ]),
    )
    expect(result.current.hasMore).toBe(false)
  })

  it('keeps the extended window and picks up new matches on refetch', async () => {
    const grown = [1n, 2n, 3n].map((id) => view({ matchIdBig: id }))
    const client = fakeListClient(grown)
    // Start with two matches; a third lands later.
    client.getPlayerMatchCount.mockResolvedValueOnce(2)
    const { result } = renderList(client, { pageSize: 2 })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.entries.map((e) => e.match.matchId)).toEqual(['2', '1'])

    act(() => result.current.refetch())
    await waitFor(() =>
      expect(result.current.entries.map((e) => e.match.matchId)).toEqual(['3', '2', '1']),
    )
  })

  it('resets and reloads when the account epoch changes', async () => {
    const client = fakeListClient([view()])
    const { result, rerender } = renderList(client)
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(client.getPlayerMatchCount).toHaveBeenCalledTimes(1)

    rerender({ address: VIEWER, accountEpoch: 1 })
    await waitFor(() => expect(client.getPlayerMatchCount).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('refetches on window focus and cleans listeners up on unmount', async () => {
    const client = fakeListClient([view()])
    const { result, unmount } = renderList(client)
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const callsAfterLoad = client.getPlayerMatchCount.mock.calls.length

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() =>
      expect(client.getPlayerMatchCount.mock.calls.length).toBe(callsAfterLoad + 1),
    )

    unmount()
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(client.getPlayerMatchCount.mock.calls.length).toBe(callsAfterLoad + 1)
  })
})
