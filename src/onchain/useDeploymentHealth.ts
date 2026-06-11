/**
 * Stale-deployment detection (GAME-804).
 *
 * A deployment record can validate (right chain, well-formed address) while
 * the chain has no contract at that address — a wiped testnet, a botched
 * record, or a build pointing at a retired deployment. This hook performs a
 * one-time `getCode` probe per (deployment, address) and reports:
 *
 * - 'unknown' — not probed (no client / not ready / probe unavailable);
 * - 'ok'      — bytecode exists at the recorded address;
 * - 'stale'   — the probe returned no bytecode; on-chain actions are doomed.
 *
 * A failed probe (RPC error) stays 'unknown': reads will surface their own
 * recoverable error, and a transport blip must not brand a live deployment
 * as stale.
 */

import { useEffect, useState } from 'react'
import type { PublicClientLike } from './client/battleshipClient'
import type { HexAddress } from './phaseResolver'

export type DeploymentHealth = 'unknown' | 'ok' | 'stale'

export function useDeploymentHealth(params: {
  publicClient: PublicClientLike | null
  /** The validated, active deployment's contract address (null = not ready). */
  address: HexAddress | null
}): DeploymentHealth {
  const { publicClient, address } = params
  const [health, setHealth] = useState<DeploymentHealth>('unknown')

  useEffect(() => {
    let cancelled = false
    setHealth('unknown')
    if (!publicClient?.getCode || !address) return
    publicClient
      .getCode({ address })
      .then((code) => {
        if (cancelled) return
        setHealth(code && code !== '0x' ? 'ok' : 'stale')
      })
      .catch(() => {
        // Transport failure: stay 'unknown'; reads report their own errors.
      })
    return () => {
      cancelled = true
    }
  }, [publicClient, address])

  return health
}
