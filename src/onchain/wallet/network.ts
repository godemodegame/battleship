/**
 * Arbitrum Sepolia network constants and guards (GAME-205).
 *
 * Arbitrum Sepolia (`421614`) is the only chain the MVP writes to. This module
 * is the single source of the chain id; `deployments.ts` and the write guard
 * import it instead of re-declaring the literal. The `arbitrumSepolia` chain
 * definition comes from viem so RPC URLs, the explorer, and the currency are
 * not hand-maintained.
 *
 * Spec: `docs/network-and-wallet-requirements.md` (Required Network).
 */

import { arbitrumSepolia } from 'viem/chains'

export { arbitrumSepolia }

/** The only chain supported for the MVP. */
export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614 as const

/** True only for Arbitrum Sepolia. Anything else must block contract writes. */
export function isSupportedChain(chainId: number | null | undefined): boolean {
  return chainId === ARBITRUM_SEPOLIA_CHAIN_ID
}

/**
 * Parse a chain id from the values wallets report. Privy/CAIP-2 reports the
 * active chain as an `eip155:<id>` string; some providers report a plain number
 * or a `0x`-prefixed hex string. Returns `null` when the value is unparseable so
 * the caller treats it as "unknown chain" (writes stay blocked) rather than
 * silently defaulting to a supported chain.
 */
export function parseChainId(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null
  }
  const raw = value.includes(':') ? value.split(':').pop()! : value
  const parsed = raw.startsWith('0x') ? Number.parseInt(raw, 16) : Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}
