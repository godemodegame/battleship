import { describe, expect, it } from 'vitest'
import {
  ZERO_ADDRESS,
  isJoinExpired,
  parseMatchIdParam,
  toChainMatchView,
  toChainMoveView,
  toMatchPlayersView,
  toPendingShotView,
  type RawMatchView,
  type RawMoveView,
  type RawPendingShotView,
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

describe('toChainMoveView (GAME-701/708)', () => {
  const rawMove = (over: Partial<RawMoveView> = {}): RawMoveView => ({
    moveId: 3,
    attacker: CREATOR,
    defender: INVITED,
    cellIndex: 42,
    result: 2, // Hit
    sunkShipId: 0,
    submittedAt: 5_000n,
    resolvedAt: 5_010n,
    finalized: true,
    ...over,
  })

  it('maps the raw struct with the ShotResult enum by index', () => {
    const move = toChainMoveView(rawMove())
    expect(move.moveId).toBe(3)
    expect(move.attacker).toBe(CREATOR.toLowerCase())
    expect(move.defender).toBe(INVITED.toLowerCase())
    expect(move.cellIndex).toBe(42)
    expect(move.result).toBe('Hit')
    expect(move.submittedAt).toBe(5_000)
    expect(move.resolvedAt).toBe(5_010)
    expect(move.finalized).toBe(true)
  })

  it('maps every result index and degrades unknown indexes to None', () => {
    expect(toChainMoveView(rawMove({ result: 0 })).result).toBe('None')
    expect(toChainMoveView(rawMove({ result: 1 })).result).toBe('Miss')
    expect(toChainMoveView(rawMove({ result: 3, sunkShipId: 4 })).result).toBe('Sunk')
    expect(toChainMoveView(rawMove({ result: 4, sunkShipId: 10 })).result).toBe('Win')
    expect(toChainMoveView(rawMove({ result: 99 })).result).toBe('None')
  })
})

describe('toPendingShotView (GAME-705)', () => {
  const rawPending = (over: Partial<RawPendingShotView> = {}): RawPendingShotView => ({
    exists: true,
    moveId: 6,
    attacker: CREATOR,
    defender: INVITED,
    cellIndex: 17,
    resultCtHash: 123n,
    sunkShipCtHash: 456n,
    submittedAt: 9_000n,
    ...over,
  })

  it('maps an existing pending shot including the proof-fetch ctHashes', () => {
    const pending = toPendingShotView(rawPending())!
    expect(pending.moveId).toBe(6)
    expect(pending.attacker).toBe(CREATOR.toLowerCase())
    expect(pending.cellIndex).toBe(17)
    // Public handle identifiers the client needs to fetch decrypt proofs.
    expect(pending.resultCtHash).toBe(123n)
    expect(pending.sunkShipCtHash).toBe(456n)
  })

  it('returns null when no shot is pending', () => {
    expect(toPendingShotView(rawPending({ exists: false }))).toBeNull()
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
