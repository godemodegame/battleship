import { useMemo } from 'react'
import type { ChainMatchView } from '../client/mapping'
import { pendingTxScope } from '../client/pendingTxStore'
import type { CofheScope } from '../fhenix/types'
import type { HexAddress } from '../phaseResolver'

/**
 * Per-match transaction + CoFHE scopes shared by the live battle panel and the
 * bot battle controller.
 *
 * - `txScope(kind)` names a recoverable in-flight write so a suspended browser
 *   re-attaches to its receipt after resume (GAME-802).
 * - the memoized `cofheScope` keys the decrypt-proof session to the
 *   account/chain/match (null until a wallet + chain are known).
 */
export function useMatchScopes(
  match: ChainMatchView,
  viewer: HexAddress | null,
  chainId: number | null,
): {
  txScope: (kind: string) => string | null
  cofheScope: CofheScope | null
} {
  const txScope = (kind: string) =>
    viewer
      ? pendingTxScope({
          deploymentId: match.deploymentId,
          matchId: match.matchIdBig,
          address: viewer,
          kind,
        })
      : null

  const cofheScope = useMemo<CofheScope | null>(
    () =>
      viewer && chainId
        ? {
            address: viewer,
            chainId,
            deploymentId: match.deploymentId,
            matchId: match.matchIdBig,
          }
        : null,
    [viewer, chainId, match.deploymentId, match.matchIdBig],
  )

  return { txScope, cofheScope }
}
