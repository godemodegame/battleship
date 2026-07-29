/**
 * Chain move history → the practice engine's `MatchState`.
 *
 * Every on-chain mode renders through the 3D practice engine, which keeps its
 * own local `MatchState`. That state is authoritative only as an *animation
 * mirror*: this module rebuilds it from the contract's finalized moves so a
 * reload, a second device, or a mid-match arrival lands on the real board
 * instead of an empty one.
 *
 * Two fidelity levels, decided by whether this client still holds its own
 * plaintext fleet (it does when it placed the fleet in this session; a reload
 * drops it, since fleets are never persisted):
 *
 * - **own fleet known** — incoming shots resolve against local geometry, exactly
 *   as in practice, so the player's own hulls, hit masks, and sunk halos render
 *   in full;
 * - **own fleet unknown** — the player's board is hidden too, and incoming shots
 *   are stamped from the contract's finalized results. Sunk hulls are then
 *   reconstructed from the public markers, the same way enemy hulls always are.
 *
 * The enemy board is hidden in both cases: player shots are always applied from
 * the chain's result, never from local knowledge.
 */

import { applyAttack, applyResolvedShotBy, createMatchVsHiddenEnemy } from '../../game/engine'
import type { MatchState, Placement, Side } from '../../game/types'
import type { ChainMatchView, ChainMoveView } from '../client/mapping'
import type { Address } from '../renderModel'

/** Contract `sunkShipId` (1..10, 0 = nothing sank) → FLEET slot, or null. */
export function sunkSlotOf(move: ChainMoveView): number | null {
  return move.sunkShipId > 0 ? move.sunkShipId - 1 : null
}

/** Map a finalized move's result onto the local engine's shot vocabulary. */
export function resolvedShotOf(move: ChainMoveView): {
  result: 'miss' | 'hit' | 'sunk'
  shipSlot: number | null
  winner: boolean
} | null {
  switch (move.result) {
    case 'Miss':
      return { result: 'miss', shipSlot: null, winner: false }
    case 'Hit':
      return { result: 'hit', shipSlot: null, winner: false }
    case 'Sunk':
      return { result: 'sunk', shipSlot: sunkSlotOf(move), winner: false }
    case 'Win':
      return { result: 'sunk', shipSlot: sunkSlotOf(move), winner: true }
    default:
      // Not finalized yet — the shot is still resolving on-chain.
      return null
  }
}

export interface HydrateOptions {
  match: ChainMatchView
  viewer: Address
  /** The player's own plaintext fleet, or null when this client no longer holds it. */
  ownFleet: Placement[] | null
}

/**
 * Rebuild the local mirror from the chain. Moves are applied oldest-first; the
 * turn and winner are then taken from the match read rather than inferred, so
 * a contract-side forfeit or timeout sweep lands correctly even though no move
 * carries it.
 */
export function hydrateLocalMatch({ match, viewer, ownFleet }: HydrateOptions): MatchState {
  let state = createMatchVsHiddenEnemy(ownFleet ? ownFleet.slice() : null)
  const moves = [...(match.moves ?? [])].sort((a, b) => a.moveId - b.moveId)

  for (const move of moves) {
    if (!move.finalized) continue
    const resolved = resolvedShotOf(move)
    if (!resolved) continue
    const by: Side = move.attacker === viewer ? 'player' : 'bot'
    if (by === 'bot' && ownFleet) {
      // Local geometry reproduces exactly what the contract resolved, and it
      // keeps the player's own hulls (with their real hit masks) intact.
      state = applyAttack(state, 'bot', move.cellIndex).match
    } else {
      state = applyResolvedShotBy(state, by, move.cellIndex, resolved).match
    }
  }

  const winnerSide: 'player' | 'bot' | null = match.winner
    ? match.winner === viewer
      ? 'player'
      : 'bot'
    : null

  return {
    ...state,
    turn: match.currentTurn === viewer ? 'player' : 'bot',
    winner: winnerSide,
  }
}

/** Highest finalized move id in the chain history (0 when none). */
export function lastFinalizedMoveId(match: ChainMatchView): number {
  let last = 0
  for (const move of match.moves ?? []) {
    if (move.finalized && move.moveId > last) last = move.moveId
  }
  return last
}
