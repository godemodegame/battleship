import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, type Mock } from 'vitest'
import type { BattleshipReadClient } from './client/battleshipClient'
import type { ChainMatchView } from './client/mapping'
import type { HexAddress, MatchStatus } from './phaseResolver'
import { useOpenMatches } from './useOpenMatches'

const VIEWER = '0xaaaa000000000000000000000000000000000001' as HexAddress
const HOST_A = '0xbbbb000000000000000000000000000000000002' as HexAddress
const HOST_B = '0xcccc000000000000000000000000000000000003' as HexAddress

function view(over: Partial<ChainMatchView> = {}): ChainMatchView {
  const id = over.matchIdBig ?? 7n
  return {
    deploymentId: 'arb-sepolia-v1',
    matchId: id.toString(),
    matchIdBig: id,
    status: 'WaitingForOpponent' as MatchStatus,
    matchType: 'Open',
    creator: HOST_A,
    opponent: null,
    invitedOpponent: null,
    currentTurn: null,
    winner: null,
    createdAt: 1,
    joinedAt: 0,
    startedAt: 0,
    finishedAt: 0,
    lastActionAt: 1,
    moveCount: 0,
    pendingMoveId: 0,
    deadlines: { joinDeadline: 1000, placementDeadline: 0, turnDeadline: 0, resolvingDeadline: 0 },
    ...over,
  }
}

interface FakeLobbyClient extends BattleshipReadClient {
  getMatch: Mock<(matchId: bigint) => Promise<ChainMatchView | null>>
  getOpenMatchCount: Mock<() => Promise<number>>
  getOpenMatches: Mock<(offset: number, limit: number) => Promise<bigint[]>>
}

function fakeLobbyClient(matches: ChainMatchView[]): FakeLobbyClient {
  const byId = new Map(matches.map((m) => [m.matchIdBig, m]))
  const ids = matches.map((m) => m.matchIdBig)
  return {
    getMatch: vi.fn(async (matchId: bigint) => byId.get(matchId) ?? null),
    getOpenMatchCount: vi.fn(async () => ids.length),
    getOpenMatches: vi.fn(async (offset: number, limit: number) => {
      if (limit === 0 || limit > 50) throw new Error('InvalidPaginationLimit')
      return ids.slice(offset, offset + limit)
    }),
    watchMatch: () => () => {},
  }
}

function renderLobby(client: BattleshipReadClient | null) {
  // Fixed clock well before any joinDeadline so nothing is treated as expired.
  return renderHook(() =>
    useOpenMatches({
      readClient: client,
      address: VIEWER,
      accountEpoch: 0,
      chainId: 421614,
      nowSeconds: () => 0,
    }),
  )
}

describe('useOpenMatches', () => {
  it('lists joinable open matches hosted by other players, newest first', async () => {
    const client = fakeLobbyClient([
      view({ matchIdBig: 1n, creator: HOST_A, createdAt: 10 }),
      view({ matchIdBig: 2n, creator: HOST_B, createdAt: 20 }),
    ])
    const { result } = renderLobby(client)

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.entries.map((e) => e.match.matchIdBig)).toEqual([2n, 1n])
    expect(result.current.entries.every((e) => !e.isOwn)).toBe(true)
    expect(result.current.totalCount).toBe(2)
  })

  it("separates the viewer's own open matches into `mine`", async () => {
    const client = fakeLobbyClient([
      view({ matchIdBig: 1n, creator: VIEWER, createdAt: 10 }),
      view({ matchIdBig: 2n, creator: HOST_B, createdAt: 20 }),
    ])
    const { result } = renderLobby(client)

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.mine.map((e) => e.match.matchIdBig)).toEqual([1n])
    expect(result.current.mine[0].isOwn).toBe(true)
    expect(result.current.entries.map((e) => e.match.matchIdBig)).toEqual([2n])
  })

  it('drops stale ids that were taken or are no longer waiting', async () => {
    const client = fakeLobbyClient([
      view({ matchIdBig: 1n, creator: HOST_A }), // joinable
      view({ matchIdBig: 2n, creator: HOST_B, opponent: VIEWER }), // already taken
      view({ matchIdBig: 3n, creator: HOST_B, status: 'InProgress' }), // not waiting
    ])
    const { result } = renderLobby(client)

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.entries.map((e) => e.match.matchIdBig)).toEqual([1n])
  })

  it('drops expired open matches from the joinable list', async () => {
    const client = fakeLobbyClient([
      view({ matchIdBig: 1n, creator: HOST_A, deadlines: { joinDeadline: 5, placementDeadline: 0, turnDeadline: 0, resolvingDeadline: 0 } }),
    ])
    // Clock past the join deadline.
    const { result } = renderHook(() =>
      useOpenMatches({
        readClient: client,
        address: VIEWER,
        accountEpoch: 0,
        chainId: 421614,
        nowSeconds: () => 100,
      }),
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.entries).toEqual([])
  })

  it('stays idle without a read client or wallet', async () => {
    const { result } = renderLobby(null)
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(result.current.entries).toEqual([])
  })
})
