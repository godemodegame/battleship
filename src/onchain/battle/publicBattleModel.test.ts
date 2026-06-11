/**
 * GAME-701 / GAME-702: public board mask decoding and the contract-derived
 * battle render model. Everything must come from public data only.
 */

import { describe, expect, it } from 'vitest'
import type { ChainMatchView, ChainMoveView, MatchPlayersView } from '../client/mapping'
import type { Address } from '../renderModel'
import {
  buildPublicBattleModel,
  decodeChainBoard,
  latestFinalizedMove,
  maskToCells,
  shipsRemainingFor,
  TOTAL_SHIPS,
} from './publicBattleModel'

const CREATOR = '0xaaaa000000000000000000000000000000000001' as Address
const OPPONENT = '0xbbbb000000000000000000000000000000000002' as Address
const STRANGER = '0xcccc000000000000000000000000000000000003' as Address

function move(over: Partial<ChainMoveView> & { moveId: number }): ChainMoveView {
  return {
    attacker: CREATOR,
    defender: OPPONENT,
    cellIndex: 0,
    result: 'Miss',
    sunkShipId: 0,
    submittedAt: 1,
    resolvedAt: 2,
    finalized: true,
    ...over,
  }
}

function players(): MatchPlayersView {
  const empty = {
    joined: true,
    placementStatus: 'Valid' as const,
    fleetSubmitted: true,
    fleetValid: true,
  }
  return {
    creator: {
      ...empty,
      player: CREATOR,
      publicBoard: {
        attackedMask: 0b111n, // cells 0..2 attacked
        missMask: 0b001n, // cell 0 miss
        hitMask: 0b110n, // cells 1, 2 hit
        sunkMask: 0b100n, // cell 2 sunk
      },
    },
    opponent: {
      ...empty,
      player: OPPONENT,
      publicBoard: {
        attackedMask: 1n << 99n,
        missMask: 1n << 99n,
        hitMask: 0n,
        sunkMask: 0n,
      },
    },
  }
}

function matchView(over: Partial<ChainMatchView> = {}): ChainMatchView {
  return {
    deploymentId: 'arb-sepolia-v1',
    matchId: '7',
    matchIdBig: 7n,
    status: 'InProgress',
    matchType: 'Friend',
    creator: CREATOR,
    opponent: OPPONENT,
    invitedOpponent: OPPONENT,
    currentTurn: CREATOR,
    winner: null,
    createdAt: 1,
    joinedAt: 2,
    startedAt: 3,
    finishedAt: 0,
    lastActionAt: 3,
    moveCount: 0,
    pendingMoveId: 0,
    deadlines: { joinDeadline: 0, placementDeadline: 0, turnDeadline: 0, resolvingDeadline: 0 },
    players: players(),
    moves: [],
    pendingShot: null,
    ...over,
  }
}

describe('maskToCells', () => {
  it('decodes bit positions into cell indexes', () => {
    expect(maskToCells(0n)).toEqual([])
    expect(maskToCells(0b1011n)).toEqual([0, 1, 3])
    expect(maskToCells(1n << 99n)).toEqual([99])
  })

  it('ignores bits beyond the 100-cell board', () => {
    expect(maskToCells(1n << 100n)).toEqual([])
  })
})

describe('shipsRemainingFor', () => {
  it('subtracts one ship per finalized Sunk or Win against the defender', () => {
    const moves = [
      move({ moveId: 1, result: 'Hit' }),
      move({ moveId: 2, result: 'Sunk', sunkShipId: 4 }),
      move({ moveId: 3, result: 'Miss' }),
      move({ moveId: 4, result: 'Win', sunkShipId: 10 }),
      // Unfinalized and other-defender moves never count.
      move({ moveId: 5, result: 'Sunk', finalized: false }),
      move({ moveId: 6, result: 'Sunk', defender: CREATOR }),
    ]
    expect(shipsRemainingFor(OPPONENT, moves)).toBe(TOTAL_SHIPS - 2)
    expect(shipsRemainingFor(CREATOR, moves)).toBe(TOTAL_SHIPS - 1)
    expect(shipsRemainingFor(null, moves)).toBe(TOTAL_SHIPS)
  })
})

describe('decodeChainBoard', () => {
  it('decodes the masks into render sets', () => {
    const board = decodeChainBoard(players().creator.publicBoard, 8)
    expect([...board.misses]).toEqual([0])
    expect([...board.hits].sort()).toEqual([1, 2])
    expect([...board.sunk]).toEqual([2])
    expect([...board.attacked].sort()).toEqual([0, 1, 2])
    expect(board.shipsRemaining).toBe(8)
  })
})

describe('latestFinalizedMove', () => {
  it('returns the newest finalized move with Win rendered as sunk', () => {
    const moves = [
      move({ moveId: 1, result: 'Hit', cellIndex: 4 }),
      move({ moveId: 2, result: 'Win', cellIndex: 9, sunkShipId: 3 }),
      move({ moveId: 3, result: 'None', finalized: false, cellIndex: 11 }),
    ]
    expect(latestFinalizedMove(moves)).toEqual({ moveId: 2, cell: 9, result: 'sunk' })
    expect(latestFinalizedMove([])).toBeNull()
    expect(latestFinalizedMove(undefined)).toBeNull()
  })
})

describe('buildPublicBattleModel', () => {
  it('builds the creator perspective with their own board as playerBoard', () => {
    const model = buildPublicBattleModel(matchView(), CREATOR, 42)!
    expect(model.perspective).toBe('creator')
    expect(model.phase).toBe('player-turn')
    expect(model.selectedCell).toBe(42)
    // The creator defends the creator slot board (hit at cell 1).
    expect(model.playerBoard.hits.has(1)).toBe(true)
    expect(model.opponentBoard.misses.has(99)).toBe(true)
  })

  it('builds the opponent perspective mirrored', () => {
    const model = buildPublicBattleModel(matchView(), OPPONENT)!
    expect(model.perspective).toBe('opponent')
    expect(model.phase).toBe('opponent-turn')
    expect(model.playerBoard.misses.has(99)).toBe(true)
    expect(model.opponentBoard.hits.has(1)).toBe(true)
  })

  it('maps statuses onto public phases', () => {
    expect(buildPublicBattleModel(matchView({ status: 'ResolvingShot' }), CREATOR)!.phase).toBe(
      'resolving',
    )
    expect(
      buildPublicBattleModel(matchView({ status: 'Finished', winner: CREATOR }), CREATOR)!
        .phase,
    ).toBe('finished')
    expect(buildPublicBattleModel(matchView({ status: 'Forfeited' }), CREATOR)!.phase).toBe(
      'finished',
    )
  })

  it('returns null for spectators and when player boards are missing', () => {
    expect(buildPublicBattleModel(matchView(), STRANGER)).toBeNull()
    expect(buildPublicBattleModel(matchView({ players: undefined }), CREATOR)).toBeNull()
  })

  it('never exposes ship placements — only public cell sets', () => {
    const model = buildPublicBattleModel(matchView(), CREATOR)!
    expect(Object.keys(model.playerBoard).sort()).toEqual([
      'attacked',
      'hits',
      'misses',
      'shipsRemaining',
      'sunk',
    ])
  })
})
