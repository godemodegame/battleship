/**
 * Transient bot-match fleet stash.
 *
 * A bot match is the one mode where the client legitimately knows BOTH plaintext
 * fleets: the player arranged their own, and the client itself generated the
 * bot's via `autoPlaceFleet()` before encrypting it (see the bot branch of
 * `CreateFriendMatchScreen`). The on-chain bot battle reuses the practice 3D
 * engine, which needs those plaintext fleets to render the boards and animate
 * shots locally while every move is mirrored on-chain.
 *
 * This module carries the two fleets from the create screen to the battle route
 * across the in-app navigate. It mirrors `placementStore`'s privacy posture:
 *  - in-memory only — never persisted to storage and never exposed as a browser
 *    global, so a refresh or a second device simply finds nothing and the route
 *    falls back to the public-data `OnchainBattlePanel`;
 *  - keyed by (deploymentId, matchId) so an unrelated match can never read it;
 *  - bot-only — it is never written for friend/open matches, where the opponent
 *    fleet is genuinely secret.
 *
 * Stakeless practice: a determined player could already inspect their own bot's
 * fleet (the client placed it), so holding it in memory leaks nothing new.
 */

import type { Placement } from '../../game/types'

export interface BotFleets {
  /** The player's own placement (their defended board). */
  player: Placement[]
  /** The client-generated bot fleet, also submitted encrypted on-chain. */
  bot: Placement[]
}

function keyOf(deploymentId: string, matchId: string): string {
  return `${deploymentId}|${matchId}`
}

/** Per (deployment, match) plaintext fleets. In-memory for this tab only. */
const stash = new Map<string, BotFleets>()

/** Record both fleets for a freshly-created bot match, before navigating to it. */
export function stashBotFleets(
  deploymentId: string,
  matchId: string,
  fleets: BotFleets,
): void {
  stash.set(keyOf(deploymentId, matchId), {
    // Defensive copies: the caller clears its placement store right after.
    player: fleets.player.slice(),
    bot: fleets.bot.slice(),
  })
}

/**
 * Read the stashed fleets for a bot match, or `null` when none are held (refresh,
 * direct link, another device). Peeks without removing — a match spans many shots
 * and the controller may re-read across remounts within the session.
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
