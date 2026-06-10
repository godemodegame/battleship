/**
 * Pure wallet/network guard logic (GAME-205, GAME-206).
 *
 * This module decides whether the app can show a connected wallet identity and
 * whether contract writes may be enabled. It is intentionally free of Privy,
 * viem, or React so the decision table can be unit tested without a wallet
 * provider (see `docs/network-and-wallet-requirements.md`).
 */

import { ARBITRUM_SEPOLIA_CHAIN_ID } from './chain'
import type { Address } from '../phaseResolver'

export interface WalletGuardInput {
  /** False when `VITE_PRIVY_APP_ID` is not set. */
  configured: boolean
  /** Privy has finished restoring/initializing the session. */
  ready: boolean
  /** Privy reports an authenticated session with an active wallet. */
  authenticated: boolean
  address: Address | null
  /** Active chain id reported by the connected wallet, or null if unknown. */
  chainId: number | null
  /** A viem public client could be created (RPC reachable). */
  hasPublicClient: boolean
  /** A viem wallet client could be created for the active wallet + chain. */
  hasWalletClient: boolean
}

export type WalletGuardState =
  | { kind: 'not-configured' }
  | { kind: 'loading' }
  | { kind: 'wallet-required' }
  | { kind: 'wrong-network'; chainId: number | null }
  | { kind: 'client-unavailable' }
  | { kind: 'ready'; address: Address }

/**
 * Resolve the wallet/network guard state from raw connection facts.
 *
 * Order matters: an unconfigured app, a loading session, and a missing wallet
 * are all distinguished from "wrong network" so the UI can show the correct
 * recovery message (see the Player-Facing Error Mapping table).
 */
export function resolveWalletGuard(input: WalletGuardInput): WalletGuardState {
  const { configured, ready, authenticated, address, chainId, hasPublicClient, hasWalletClient } =
    input

  if (!configured) {
    return { kind: 'not-configured' }
  }
  if (!ready) {
    return { kind: 'loading' }
  }
  if (!authenticated || !address) {
    return { kind: 'wallet-required' }
  }
  if (chainId !== ARBITRUM_SEPOLIA_CHAIN_ID) {
    return { kind: 'wrong-network', chainId }
  }
  if (!hasPublicClient || !hasWalletClient) {
    return { kind: 'client-unavailable' }
  }
  return { kind: 'ready', address }
}

/**
 * Whether a contract write may be attempted right now (GAME-206). Every write
 * path must call this (directly or via the guard state) before sending a
 * transaction; never rely on a cached account or chain value.
 */
export function canSubmitWrite(guard: WalletGuardState): guard is { kind: 'ready'; address: Address } {
  return guard.kind === 'ready'
}
