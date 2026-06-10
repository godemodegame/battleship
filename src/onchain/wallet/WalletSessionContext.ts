/**
 * Wallet session React context (GAME-204).
 *
 * The on-chain UI reads the live wallet session and connection actions through
 * this context. It carries a safe disconnected default so `useWalletSession()`
 * never throws when no provider is mounted — e.g. route tests that render
 * `appRoutes` directly, or the practice tree which has no wallet at all.
 *
 * The concrete value is produced by `WalletProvider` (Privy + viem bridge).
 */

import { createContext, useContext } from 'react'
import type { ErrorCode } from '../../copy/errors'
import { DISCONNECTED_SESSION, type WalletSession } from './session'
import type { WriteBlockReason } from './writeGuard'

export interface WalletActions {
  /** Open Privy's connect UI (the only connection surface). */
  connect: () => void
  /** Disconnect the active wallet / Privy session. */
  disconnect: () => void
  /** Ask the active wallet to switch to Arbitrum Sepolia (421614). */
  switchToArbitrumSepolia: () => void
}

export interface WalletContextValue {
  session: WalletSession
  /** Why a contract write is currently blocked, or null when writes are allowed. */
  writeBlockedReason: WriteBlockReason | null
  /** True when wallet, chain, and viem clients are all ready for a write. */
  canWrite: boolean
  /**
   * Last recoverable wallet/connection error (e.g. connection cancelled, chain
   * switch rejected). Cleared on a successful action. Never carries raw
   * provider/Privy errors — only mapped `ErrorCode`s.
   */
  lastError: ErrorCode | null
  /** True when `VITE_PRIVY_APP_ID` is unset, so connection is unavailable. */
  configMissing: boolean
  actions: WalletActions
}

const noop = () => {}

export const DISCONNECTED_CONTEXT: WalletContextValue = {
  session: DISCONNECTED_SESSION,
  writeBlockedReason: 'no-wallet',
  canWrite: false,
  lastError: null,
  configMissing: false,
  actions: {
    connect: noop,
    disconnect: noop,
    switchToArbitrumSepolia: noop,
  },
}

export const WalletSessionContext = createContext<WalletContextValue>(DISCONNECTED_CONTEXT)

/** Read the live wallet session + actions. Safe to call outside a provider. */
export function useWalletSession(): WalletContextValue {
  return useContext(WalletSessionContext)
}
