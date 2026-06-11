/**
 * Idempotent finalized-move processing (GAME-706 / GAME-707).
 *
 * Visual and audio shot effects must fire exactly once per finalized public
 * move, no matter how many duplicate events, refetches, or re-renders deliver
 * the same history. This module keeps an in-memory cursor of the highest
 * processed move id per deployment + match; only moves beyond the cursor are
 * returned for presentation.
 *
 * The first sighting of a match primes the cursor silently: after a refresh or
 * direct navigation the boards and history are rebuilt from contract state
 * (GAME-708) without replaying every past effect.
 */

import type { ChainMoveView } from '../client/mapping'

export interface MoveFxKey {
  deploymentId: string
  matchId: string
}

function keyOf(key: MoveFxKey): string {
  return `${key.deploymentId}:${key.matchId}`
}

/** Highest processed (or primed) finalized move id per deployment + match. */
const cursors = new Map<string, number>()

function highestFinalizedId(moves: ReadonlyArray<ChainMoveView>): number {
  let highest = 0
  for (const move of moves) {
    if (move.finalized && move.moveId > highest) highest = move.moveId
  }
  return highest
}

/**
 * Return the finalized moves that have not been presented yet, in move-id
 * order, and advance the cursor past them. On the first call for a match the
 * cursor primes to the current history and nothing is returned.
 */
export function takeNewFinalizedMoves(
  key: MoveFxKey,
  moves: ReadonlyArray<ChainMoveView>,
): ChainMoveView[] {
  const id = keyOf(key)
  const cursor = cursors.get(id)
  if (cursor === undefined) {
    cursors.set(id, highestFinalizedId(moves))
    return []
  }

  const fresh = moves
    .filter((move) => move.finalized && move.moveId > cursor)
    .sort((a, b) => a.moveId - b.moveId)
  if (fresh.length > 0) {
    cursors.set(id, fresh[fresh.length - 1].moveId)
  }
  return fresh
}

/** Test/reset hook: forget every processed-move cursor. */
export function resetMoveFx(): void {
  cursors.clear()
}
