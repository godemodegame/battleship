/**
 * Wallet connection context (GAME-202, GAME-204).
 *
 * The rest of the app reads wallet/network state through this context instead
 * of calling Privy hooks directly. `WalletProvider` (see `WalletProvider.tsx`)
 * supplies a real value backed by Privy when `VITE_PRIVY_APP_ID` is configured,
 * and a safe "not configured" value otherwise. This keeps every consumer
 * (including tests) free of a hard dependency on `@privy-io/react-auth`.
 */

import { createContext, useContext } from 'react'
import type { Address } from '../phaseResolver'

export type EIP1193Provider = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: (args: { method: string; params?: any[] }) => Promise<unknown>
}

/** Outcome of a `switchToArbitrumSepolia` attempt (GAME-207). */
export type NetworkSwitchResult = 'switched' | 'rejected' | 'unsupported' | 'error'

export interface WalletConnectionValue {
  /** False when `VITE_PRIVY_APP_ID` is not set for this build. */
  configured: boolean
  /** True once the Privy SDK has finished restoring/initializing the session. */
  ready: boolean
  /** True when an external wallet session is authenticated. */
  authenticated: boolean
  address: Address | null
  /** Active chain id reported by the connected wallet, or null if unknown. */
  chainId: number | null
  /** e.g. "metamask", "coinbase_wallet"; null when no wallet is connected. */
  walletClientType: string | null
  /** Open Privy's connect UI. No-op when not configured. */
  login: () => void
  /** End the Privy session. No-op when not configured. */
  logout: () => Promise<void>
  /** Ask the active wallet to switch to Arbitrum Sepolia (GAME-207). */
  switchToArbitrumSepolia: () => Promise<NetworkSwitchResult>
  /** EIP-1193 provider for the active wallet, or null if unavailable. */
  getEthereumProvider: () => Promise<EIP1193Provider | null>
}

export const UNCONFIGURED_WALLET_VALUE: WalletConnectionValue = {
  configured: false,
  ready: false,
  authenticated: false,
  address: null,
  chainId: null,
  walletClientType: null,
  login: () => {},
  logout: async () => {},
  switchToArbitrumSepolia: async () => 'unsupported',
  getEthereumProvider: async () => null,
}

export const WalletContext = createContext<WalletConnectionValue>(UNCONFIGURED_WALLET_VALUE)

/** Read the current wallet/network connection state. */
export function useWalletConnection(): WalletConnectionValue {
  return useContext(WalletContext)
}

/** Read `VITE_PRIVY_APP_ID`, or `null` when unset/empty. */
export function getPrivyAppId(): string | null {
  const env =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_PRIVY_APP_ID as string | undefined)
      : undefined
  return env && env.length > 0 ? env : null
}

/** Parse a CAIP-2 chain id (e.g. "eip155:421614") into a numeric chain id. */
export function parseCaipChainId(caip: string | null | undefined): number | null {
  if (!caip) return null
  const parts = caip.split(':')
  const numeric = Number(parts[parts.length - 1])
  return Number.isFinite(numeric) ? numeric : null
}
