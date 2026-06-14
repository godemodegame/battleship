/**
 * Transient bot-match player-fleet stash.
 *
 * The on-chain bot battle reuses the practice 3D engine, which needs the
 * player's own plaintext placement to render their board and resolve the bot's
 * incoming shots locally (the player legitimately knows their own fleet, exactly
 * as in PvP). It deliberately does NOT hold the bot's fleet: the bot's placement
 * stays encrypted on-chain and the player's shots against it are resolved from
 * the contract's finalized result, so the player can never know a hit/miss
 * before the transaction — the same secrecy a human opponent gets.
 *
 * This module carries the player fleet from the create screen to the battle
 * route across the in-app navigate. It mirrors `placementStore`'s privacy
 * posture:
 *  - in-memory only — never persisted to storage and never exposed as a browser
 *    global, so a refresh or a second device simply finds nothing and the route
 *    falls back to the public-data `OnchainBattlePanel`;
 *  - keyed by (deploymentId, matchId) so an unrelated match can never read it;
 *  - bot-only — it is never written for friend/open matches.
 */

import type { Placement } from '../../game/types'

export interface BotFleets {
  /** The player's own placement (their defended board). */
  player: Placement[]
}

function keyOf(deploymentId: string, matchId: string): string {
  return `${deploymentId}|${matchId}`
}

/** Per (deployment, match) plaintext fleets. In-memory for this tab only. */
const stash = new Map<string, BotFleets>()

/** Record the player fleet for a freshly-created bot match, before navigating. */
export function stashBotFleets(
  deploymentId: string,
  matchId: string,
  fleets: BotFleets,
): void {
  stash.set(keyOf(deploymentId, matchId), {
    // Defensive copy: the caller clears its placement store right after.
    player: fleets.player.slice(),
  })
}

/**
 * Read the stashed player fleet for a bot match, or `null` when none is held
 * (refresh, direct link, another device). Peeks without removing — a match spans
 * many shots and the controller may re-read across remounts within the session.
 */
export function peekBotFleets(
  deploymentId: string,
  matchId: string,
): BotFleets | null {
  return stash.get(keyOf(deploymentId, matchId)) ?? null
}

/** Drop the stash for a finished/abandoned bot match. */
export function clearBotFleets(deploymentId: string, matchId: string): void {
  stash.delete(keyOf(deploymentId, matchId))
}

/** Test hook: forget every stashed fleet pair. */
export function resetBotFleetStash(): void {
  stash.clear()
}
