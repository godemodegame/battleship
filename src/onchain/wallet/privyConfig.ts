/**
 * Privy app configuration (GAME-201 / GAME-203).
 *
 * Centralizes the single Privy connection surface for the MVP: wallet-only
 * login, external EVM wallets, embedded-wallet creation disabled, and Arbitrum
 * Sepolia as the only supported/default chain. The app id is supplied through
 * `VITE_PRIVY_APP_ID`; when it is absent the app degrades gracefully (practice
 * stays playable, on-chain routes show a recoverable config message) instead of
 * crashing the whole bundle.
 *
 * Spec: `docs/network-and-wallet-requirements.md` (Privy Configuration).
 */

import type { PrivyClientConfig } from '@privy-io/react-auth'
import { arbitrumSepolia } from './network'

/** Read the Privy app id from the build environment, or null when unset. */
export function getPrivyAppId(): string | null {
  const value =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_PRIVY_APP_ID as string | undefined)
      : undefined
  return value && value.length > 0 ? value : null
}

/** Optional override RPC for the public client; falls back to the chain default. */
export function getArbitrumSepoliaRpcUrl(): string {
  const value =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_ARBITRUM_SEPOLIA_RPC_URL as string | undefined)
      : undefined
  return value && value.length > 0
    ? value
    : arbitrumSepolia.rpcUrls.default.http[0]
}

/**
 * The Privy client configuration for the first on-chain milestone.
 *
 * - `loginMethods: ['wallet']` — wallet-only; non-wallet methods disabled.
 * - `embeddedWallets.createOnLogin: 'off'` — never mint a Privy embedded wallet.
 * - `walletChainType: 'ethereum-only'` — hide non-EVM wallet families.
 * - `defaultChain` / `supportedChains` limited to Arbitrum Sepolia. (Note:
 *   `defaultChain` improves the prompt but is not a security boundary — the
 *   write guard re-checks the active chain independently.)
 */
export function buildPrivyConfig(): PrivyClientConfig {
  return {
    loginMethods: ['wallet'],
    embeddedWallets: {
      ethereum: { createOnLogin: 'off' },
    },
    appearance: {
      walletChainType: 'ethereum-only',
    },
    defaultChain: arbitrumSepolia,
    supportedChains: [arbitrumSepolia],
  }
}
