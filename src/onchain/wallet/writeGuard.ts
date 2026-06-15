/**
 * Contract-write readiness guard (GAME-206).
 *
 * Every contract write in the MVP must pass through this single pure check
 * before a transaction is prepared. It blocks writes whenever the account, the
 * active chain, or client readiness fails — independent of `authenticated`,
 * which the spec is explicit is *not* sufficient for gameplay.
 *
 * Phase 2 has no contract calls yet, so nothing is gated in production code
 * today; this is the foundation every later write path (create, join, attack,
 * fleet submission) will call. The caller must pass a freshly re-read chain id,
 * never a cached one (`docs/network-and-wallet-requirements.md`,
 * Security and Privacy Rules: "Never trust a cached account or chain value
 * before a write").
 */

import { isSupportedChain } from './network'

export type WriteBlockReason =
  /** No connected external wallet / no address. */
  | 'no-wallet'
  /** Connected, but not on Arbitrum Sepolia. */
  | 'wrong-network'
  /** Account + chain fine, but the viem public/wallet clients are not ready. */
  | 'client-not-ready'

export interface WriteReadinessInput {
  /** A connected external wallet exposes a non-empty address. */
  hasAddress: boolean
  /** Freshly re-read numeric chain id (never cached). */
  chainId: number | null
  /** viem public client constructed and usable. */
  publicClientReady: boolean
  /** viem wallet client constructed from the active wallet. */
  walletClientReady: boolean
}

interface WriteReadiness {
  canWrite: boolean
  /** Null only when `canWrite` is true. */
  blockedReason: WriteBlockReason | null
}

const ALLOWED: WriteReadiness = { canWrite: true, blockedReason: null }

/**
 * Decide whether a contract write may proceed. Pure and synchronous.
 *
 * Checks run in escalating order so the surfaced reason is the most fundamental
 * blocker: wallet, then chain, then client readiness.
 */
export function evaluateWriteReadiness(input: WriteReadinessInput): WriteReadiness {
  if (!input.hasAddress) {
    return { canWrite: false, blockedReason: 'no-wallet' }
  }
  if (!isSupportedChain(input.chainId)) {
    return { canWrite: false, blockedReason: 'wrong-network' }
  }
  if (!input.publicClientReady || !input.walletClientReady) {
    return { canWrite: false, blockedReason: 'client-not-ready' }
  }
  return ALLOWED
}
