/**
 * Active-wallet selection (GAME-204 / GAME-210).
 *
 * Once embedded wallets are minted for social/email users (privyConfig
 * `createOnLogin: 'users-without-wallets'`), a single Privy session can list
 * BOTH an injected wallet and the embedded one. `useWallets()` makes no
 * ordering guarantee, so naively taking `wallets[0]` could pick the injected
 * wallet over the embedded one — picking the wrong address and, critically,
 * routing writes away from the only wallet eligible for sponsored gas.
 *
 * This pure selector prefers the Privy embedded wallet (the gas-sponsorable
 * one) and falls back to the first listed wallet otherwise. Kept free of any
 * `@privy-io/react-auth` import so it is unit-testable without mounting Privy.
 */

/** The minimal shape of a connected wallet this module inspects. */
export interface WalletLike {
  address: string
  /** Privy reports its embedded wallet as `'privy'`; injected wallets differ. */
  walletClientType?: string
}

/** True for a Privy embedded wallet (the only kind eligible for sponsorship). */
export function isEmbeddedWallet(wallet: { walletClientType?: string } | null | undefined): boolean {
  return wallet?.walletClientType === 'privy'
}

/**
 * Choose the active wallet for the session: prefer the embedded wallet, else
 * the first connected wallet. Returns null when no wallet is connected.
 */
export function selectActiveWallet<T extends WalletLike>(wallets: readonly T[]): T | null {
  if (wallets.length === 0) return null
  return wallets.find((wallet) => isEmbeddedWallet(wallet)) ?? wallets[0]
}
