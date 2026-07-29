/**
 * Transient player-fleet stash for an on-chain match.
 *
 * Every on-chain battle renders through the 3D engine. The engine draws the
 * player's own hulls and resolves incoming shots locally when this client still
 * holds its own plaintext placement — which it does for a match it set up or
 * joined in this session. It never holds the *opponent's* fleet (bot or human):
 * that placement stays encrypted on-chain and the player's shots against it are
 * resolved from the contract's finalized result, so hit/miss can never be known
 * before the transaction.
 *
 * This module carries the fleet from the create/join screen to the battle route
 * across the in-app navigate. It mirrors `placementStore`'s privacy posture:
 *  - in-memory only — never persisted to storage and never exposed as a browser
 *    global. A refresh or a second device simply finds nothing, and the battle
 *    still renders in 3D with the player's own board hidden, every result taken
 *    from the chain;
 *  - keyed by (deploymentId, matchId) so an unrelated match can never read it.
 */

import type { Placement } from '../../game/types'

export interface StashedFleet {
  /** The player's own placement (their defended board). */
  player: Placement[]
}

function keyOf(deploymentId: string, matchId: string): string {
  return `${deploymentId}|${matchId}`
}

/** Per (deployment, match) plaintext fleet. In-memory for this tab only. */
const stash = new Map<string, StashedFleet>()

/** Record the player fleet for a freshly created/joined match, before navigating. */
export function stashMatchFleet(
  deploymentId: string,
  matchId: string,
  fleets: StashedFleet,
): void {
  stash.set(keyOf(deploymentId, matchId), {
    // Defensive copy: the caller clears its placement store right after.
    player: fleets.player.slice(),
  })
}

/**
 * Read the stashed player fleet, or `null` when none is held (refresh, direct
 * link, another device) — the battle then renders with the own board hidden.
 * Peeks without removing: a match spans many shots and the controller may
 * re-read across remounts within the session.
 */
export function peekMatchFleet(
  deploymentId: string,
  matchId: string,
): Placement[] | null {
  return stash.get(keyOf(deploymentId, matchId))?.player ?? null
}

/** Drop the stash for a finished/abandoned match. */
export function clearMatchFleet(deploymentId: string, matchId: string): void {
  stash.delete(keyOf(deploymentId, matchId))
}

/** Test hook: forget every stashed fleet. */
export function resetMatchFleetStash(): void {
  stash.clear()
}
