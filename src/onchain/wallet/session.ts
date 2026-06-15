/**
 * Pure wallet-session view model (GAME-204 / GAME-205).
 *
 * Translates the raw, provider-specific signals Privy exposes (ready,
 * authenticated, the active external wallet, its reported chain, client
 * readiness) into a small, deterministic `WalletSession` the UI and the phase
 * resolver consume. Keeping this pure means the connection state machine is
 * fully unit-testable without mounting Privy or touching the network.
 *
 * This module never decides whether a write may proceed — that is the single
 * responsibility of `writeGuard.ts`. It only describes *what the wallet is*.
 *
 * Spec: `docs/network-and-wallet-requirements.md` (Connection Flow).
 */

import type { HexAddress } from '../phaseResolver'
import { isSupportedChain } from './network'

type WalletStatus =
  /** Privy not ready, or no external wallet connected. */
  | 'disconnected'
  /** Privy is resolving a login / wallet selection. */
  | 'connecting'
  /** Connected with an address, but on a chain other than Arbitrum Sepolia. */
  | 'wrong-network'
  /** Connected, on Arbitrum Sepolia, with an address. */
  | 'ready'

export interface WalletSession {
  status: WalletStatus
  /** Lowercased active EVM address, or null when none is connected. */
  address: HexAddress | null
  /** Parsed numeric chain id the wallet reports, or null when unknown. */
  chainId: number | null
  /** True only when the active chain is Arbitrum Sepolia. */
  isCorrectChain: boolean
  /** True when an external wallet with an address is connected (any chain). */
  isConnected: boolean
}

/** Raw inputs gathered from Privy + the viem client bridge. */
export interface RawWalletState {
  /** Privy `ready` — the SDK has finished initializing. */
  ready: boolean
  /**
   * Privy `authenticated` — a session exists. Necessary but not sufficient for
   * gameplay: without it any lingering injected-wallet address is ignored.
   */
  authenticated: boolean
  /** Active external EVM address, if any (any casing). */
  address: string | null | undefined
  /** Numeric chain id already parsed from the wallet's CAIP-2 string. */
  chainId: number | null | undefined
  /** True while a connect / wallet-selection flow is in flight. */
  connecting?: boolean
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

function normalizeAddress(address: string | null | undefined): HexAddress | null {
  if (!address || !ADDRESS_RE.test(address)) return null
  return address.toLowerCase() as HexAddress
}

/** Session shown before Privy resolves or when no wallet is connected. */
export const DISCONNECTED_SESSION: WalletSession = {
  status: 'disconnected',
  address: null,
  chainId: null,
  isCorrectChain: false,
  isConnected: false,
}

/**
 * Derive the wallet session from raw Privy/client signals. Pure and synchronous.
 *
 * Order matters: a connecting flow is reported even before an address resolves;
 * an address on the wrong chain is `wrong-network` (account stays visible per the
 * spec); only a valid address on 421614 is `ready`.
 */
export function deriveWalletSession(raw: RawWalletState): WalletSession {
  const address = normalizeAddress(raw.address)
  const chainId = raw.chainId ?? null
  const correctChain = isSupportedChain(chainId)

  if (!raw.ready) {
    return DISCONNECTED_SESSION
  }

  if (!raw.authenticated) {
    // No Privy session. An injected wallet may still be listed by the browser
    // after logout (the extension connection outlives the Privy session), so a
    // lingering address must NOT count as connected — otherwise Disconnect
    // appears to do nothing. A login flow in flight still reads as connecting.
    return raw.connecting
      ? { ...DISCONNECTED_SESSION, status: 'connecting' }
      : DISCONNECTED_SESSION
  }

  if (!address) {
    // No active wallet. A login/selection in flight surfaces as 'connecting' so
    // the UI can show progress; otherwise the route is simply wallet-required.
    return raw.connecting
      ? { ...DISCONNECTED_SESSION, status: 'connecting' }
      : DISCONNECTED_SESSION
  }

  if (!correctChain) {
    return {
      status: 'wrong-network',
      address,
      chainId,
      isCorrectChain: false,
      isConnected: true,
    }
  }

  return {
    status: 'ready',
    address,
    chainId,
    isCorrectChain: true,
    isConnected: true,
  }
}
