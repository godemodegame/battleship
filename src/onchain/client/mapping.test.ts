import { describe, expect, it } from 'vitest'
import {
  ZERO_ADDRESS,
  isJoinExpired,
  parseMatchIdParam,
  toChainMatchView,
  toMatchPlayersView,
  type RawMatchView,
  type RawPlayerPublicView,
} from './mapping'

const CREATOR = '0xAaAA000000000000000000000000000000000001' as const
const INVITED = '0xBbBB000000000000000000000000000000000002' as const

function rawMatch(over: Partial<RawMatchView> = {}): RawMatchView {
  return {
    id: 7n,
    matchType: 0,
    status: 1, // WaitingForOpponent
    creator: CREATOR,
    opponent: ZERO_ADDRESS,
    invitedOpponent: INVITED,
    currentTurn: ZERO_ADDRESS,
    winner: ZERO_ADDRESS,
    createdAt: 1_000n,
    joinedAt: 0n,
    startedAt: 0n,
    finishedAt: 0n,
    lastActionAt: 1_000n,
    moveCount: 0,
    pendingMoveId: 0,
    timeoutState: {
      joinDeadline: 87_400n,
      placementDeadline: 0n,
      turnDeadline: 0n,
      resolvingDeadline: 0n,
    },
    ...over,
  }
}

describe('toChainMatchView (GAME-503)', () => {
  it('maps the raw struct into the resolver MatchView shape', () => {
    const view = toChainMatchView(rawMatch(), 'arb-sepolia-v1')
    expect(view).not.toBeNull()
    expect(view!.deploymentId).toBe('arb-sepolia-v1')
    expect(view!.matchId).toBe('7')
    expect(view!.matchIdBig).toBe(7n)
    expect(view!.status).toBe('WaitingForOpponent')
    expect(view!.matchType).toBe('Friend')
    // Addresses are lowercased; zero addresses become null.
    expect(view!.creator).toBe(CREATOR.toLowerCase())
    expect(view!.invitedOpponent).toBe(INVITED.toLowerCase())
    expect(view!.opponent).toBeNull()
    expect(view!.currentTurn).toBeNull()
    expect(view!.winner).toBeNull()
    expect(view!.deadlines.joinDeadline).toBe(87_400)
  })

  it('maps every contract status index onto the frontend status union', () => {
    const expected = [
      'WaitingForOpponent',
      'WaitingForPlacement',
      'ValidatingPlacement',
      'ReadyToStart',
      'InProgress',
      'ResolvingShot',
      'Finished',
      'Cancelled',
      'Forfeited',
    ] as const
    expected.forEach((status, i) => {
      const view = toChainMatchView(rawMatch({ status: i + 1 }), 'd')
      expect(view!.status).toBe(status)
    })
  })

  it('returns null for status None or out-of-range statuses', () => {
    expect(toChainMatchView(rawMatch({ status: 0 }), 'd')).toBeNull()
    expect(toChainMatchView(rawMatch({ status: 99 }), 'd')).toBeNull()
  })

  it('maps an in-progress match with turn and opponent', () => {
    const view = toChainMatchView(
      rawMatch({ status: 5, opponent: INVITED, currentTurn: INVITED, moveCount: 4 }),
      'd',
    )
    expect(view!.status).toBe('InProgress')
    expect(view!.currentTurn).toBe(INVITED.toLowerCase())
    expect(view!.moveCount).toBe(4)
  })
})

describe('toMatchPlayersView (GAME-608/609)', () => {
  const player = (
    placementStatus: number,
    over: Partial<RawPlayerPublicView> = {},
  ): RawPlayerPublicView => ({
    player: CREATOR,
    joined: true,
    placementStatus,
    fleetSubmitted: placementStatus >= 3,
    fleetValid: placementStatus === 4,
    publicBoard: {
      attackedMask: 1n,
      missMask: 2n,
      hitMask: 4n,
      sunkMask: 8n,
    },
    ...over,
  })

  it('maps public placement states and zero-address opponent slots', () => {
    const players = toMatchPlayersView([
      player(3),
      player(0, { player: ZERO_ADDRESS, joined: false }),
    ])
    expect(players.creator.placementStatus).toBe('ResolvingValidation')
    expect(players.creator.fleetSubmitted).toBe(true)
    expect(players.creator.publicBoard.hitMask).toBe(4n)
    expect(players.opponent.player).toBeNull()
    expect(players.opponent.placementStatus).toBe('None')
  })
})

describe('parseMatchIdParam', () => {
  it('parses plain positive decimal ids', () => {
    expect(parseMatchIdParam('1')).toBe(1n)
    expect(parseMatchIdParam('42')).toBe(42n)
  })

  it('rejects demo ids, zero, negatives, hex, and garbage', () => {
    expect(parseMatchIdParam('demo-place-123')).toBeNull()
    expect(parseMatchIdParam('0')).toBeNull()
    expect(parseMatchIdParam('-3')).toBeNull()
    expect(parseMatchIdParam('0x10')).toBeNull()
    expect(parseMatchIdParam('lobby')).toBeNull()
    expect(parseMatchIdParam('')).toBeNull()
    expect(parseMatchIdParam(undefined)).toBeNull()
  })
})

describe('isJoinExpired (GAME-508)', () => {
  it('is expired only while waiting, without an opponent, past the deadline', () => {
    const view = toChainMatchView(rawMatch(), 'd')!
    expect(isJoinExpired(view, 87_399)).toBe(false)
    expect(isJoinExpired(view, 87_401)).toBe(true)
  })

  it('never expires once an opponent joined or the match moved on', () => {
    const joined = toChainMatchView(rawMatch({ status: 2, opponent: INVITED }), 'd')!
    expect(isJoinExpired(joined, 999_999_999)).toBe(false)
  })

  it('treats a zero deadline as no deadline', () => {
    const view = toChainMatchView(
      rawMatch({ timeoutState: { joinDeadline: 0n, placementDeadline: 0n, turnDeadline: 0n, resolvingDeadline: 0n } }),
      'd',
    )!
    expect(isJoinExpired(view, 999_999_999)).toBe(false)
  })
})
