/**
 * Privy app configuration (GAME-201 / GAME-203 / GAME-210).
 *
 * Centralizes the single Privy connection surface: wallet **and** social/email
 * login, with an embedded EVM wallet minted for any user who signs in without
 * an external wallet, and Arbitrum Sepolia as the only supported/default chain.
 * The app id is supplied through `VITE_PRIVY_APP_ID`; when it is absent the app
 * degrades gracefully (practice stays playable, on-chain routes show a
 * recoverable config message) instead of crashing the whole bundle.
 *
 * Login methods listed here only render if they are also enabled in the Privy
 * dashboard (the array is a *display subset* of dashboard-enabled methods), and
 * each OAuth provider needs its own dashboard credentials. The embedded wallet
 * created for social/email users is what makes sponsored (gasless) writes
 * possible — see `PrivyWalletBridge` (`useSendTransaction({ sponsor: true })`).
 *
 * Spec: `docs/network-and-wallet-requirements.md` (Privy Configuration).
 */

import type { PrivyClientConfig } from '@privy-io/react-auth'
import { arbitrumSepolia } from './network'

/**
 * Every login method we surface in Privy's modal. This is the full set the SDK
 * accepts (minus cross-app `privy:${appId}` providers); each entry must also be
 * toggled on in the Privy dashboard to actually appear. `wallet` keeps external
 * EVM wallets available alongside the social/email methods.
 */
export const ENABLED_LOGIN_METHODS: NonNullable<PrivyClientConfig['loginMethods']> = [
  'wallet',
  'email',
  'sms',
  'google',
  'apple',
  'twitter',
  'discord',
  'github',
  'linkedin',
  'farcaster',
  'telegram',
  'passkey',
  'tiktok',
  'twitch',
  'line',
  'spotify',
  'instagram',
]

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
 * The Privy client configuration.
 *
 * - `loginMethods: ENABLED_LOGIN_METHODS` — external wallets plus social/email.
 * - `embeddedWallets.ethereum.createOnLogin: 'users-without-wallets'` — mint a
 *   Privy embedded EVM wallet for users who sign in without an external wallet
 *   (the precondition for sponsored, gasless writes). Users who linked an
 *   external wallet are left untouched and keep paying their own gas.
 * - `embeddedWallets.showWalletUIs: false` — embedded-wallet sends/signs run
 *   headlessly with NO per-transaction confirmation modal. This is required for
 *   the sponsored, auto-chained write flow: otherwise Privy opens a confirmation
 *   dialog for every write (which in this app renders empty and hangs the send,
 *   never broadcasting the tx). External wallets keep their own prompts.
 * - `walletChainType: 'ethereum-only'` — hide non-EVM wallet families.
 * - `defaultChain` / `supportedChains` limited to Arbitrum Sepolia. (Note:
 *   `defaultChain` improves the prompt but is not a security boundary — the
 *   write guard re-checks the active chain independently.)
 */
export function buildPrivyConfig(): PrivyClientConfig {
  return {
    loginMethods: ENABLED_LOGIN_METHODS,
    embeddedWallets: {
      ethereum: { createOnLogin: 'users-without-wallets' },
      // Headless sends/signs for the embedded wallet — no confirmation modal,
      // so sponsored writes broadcast programmatically (GAME-201).
      showWalletUIs: false,
    },
    appearance: {
      walletChainType: 'ethereum-only',
    },
    defaultChain: arbitrumSepolia,
    supportedChains: [arbitrumSepolia],
  }
}
