/**
 * GAME-706: finalized moves are processed exactly once per deployment + match
 * + move id, and the first sighting (refresh / direct navigation) primes the
 * cursor without replaying history.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { ChainMoveView } from '../client/mapping'
import { resetMoveFx, takeNewFinalizedMoves } from './moveFx'

const KEY = { deploymentId: 'arb-sepolia-v1', matchId: '1' }
const OTHER_KEY = { deploymentId: 'arb-sepolia-v1', matchId: '2' }

function move(moveId: number, finalized = true): ChainMoveView {
  return {
    moveId,
    attacker: '0xaaaa000000000000000000000000000000000001',
    defender: '0xbbbb000000000000000000000000000000000002',
    cellIndex: moveId,
    result: finalized ? 'Hit' : 'None',
    sunkShipId: 0,
    submittedAt: 1,
    resolvedAt: finalized ? 2 : 0,
    finalized,
  }
}

beforeEach(() => resetMoveFx())

describe('takeNewFinalizedMoves', () => {
  it('primes silently on first sight of a match history', () => {
    expect(takeNewFinalizedMoves(KEY, [move(1), move(2)])).toEqual([])
    // Nothing replays after priming, no matter how often the same list arrives.
    expect(takeNewFinalizedMoves(KEY, [move(1), move(2)])).toEqual([])
  })

  it('returns each new finalized move exactly once', () => {
    takeNewFinalizedMoves(KEY, [])
    const first = takeNewFinalizedMoves(KEY, [move(1)])
    expect(first.map((m) => m.moveId)).toEqual([1])
    // Duplicate refetches with the same history return nothing.
    expect(takeNewFinalizedMoves(KEY, [move(1)])).toEqual([])
    // A burst of finalizations comes back in move-id order.
    const burst = takeNewFinalizedMoves(KEY, [move(1), move(3), move(2)])
    expect(burst.map((m) => m.moveId)).toEqual([2, 3])
    expect(takeNewFinalizedMoves(KEY, [move(1), move(2), move(3)])).toEqual([])
  })

  it('ignores unfinalized moves until they finalize', () => {
    takeNewFinalizedMoves(KEY, [])
    expect(takeNewFinalizedMoves(KEY, [move(1, false)])).toEqual([])
    expect(takeNewFinalizedMoves(KEY, [move(1)]).map((m) => m.moveId)).toEqual([1])
  })

  it('tracks cursors per deployment + match', () => {
    takeNewFinalizedMoves(KEY, [])
    takeNewFinalizedMoves(KEY, [move(1)])
    // A different match id has its own cursor and primes independently.
    expect(takeNewFinalizedMoves(OTHER_KEY, [move(1)])).toEqual([])
  })
})
