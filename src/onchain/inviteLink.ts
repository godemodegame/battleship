/**
 * Invite link construction (GAME-506).
 *
 * Invite links are versioned: they embed the deployment id so an old link
 * keeps resolving against its original contract (`docs/frontend-architecture.md`,
 * Invite Links). The path shape must stay in sync with the
 * `/match/:deploymentId/:matchId` route.
 */

export function inviteLinkPath(deploymentId: string, matchId: string): string {
  return `/match/${encodeURIComponent(deploymentId)}/${encodeURIComponent(matchId)}`
}

/** Absolute invite URL for sharing. `origin` is injectable for tests. */
export function buildInviteLink(
  deploymentId: string,
  matchId: string,
  origin: string = typeof window !== 'undefined' ? window.location.origin : '',
): string {
  return `${origin}${inviteLinkPath(deploymentId, matchId)}`
}
