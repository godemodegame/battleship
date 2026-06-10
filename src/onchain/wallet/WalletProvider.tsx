/**
 * Privy-backed wallet provider (GAME-201, GAME-202, GAME-203, GAME-204).
 *
 * Configuration follows `docs/network-and-wallet-requirements.md`:
 * wallet-only login, no embedded wallets, Arbitrum Sepolia as the only
 * supported chain, and EVM-only wallet discovery. When `VITE_PRIVY_APP_ID` is
 * not set (e.g. local dev without secrets, or the test environment), the
 * provider supplies a "not configured" context value and never loads Privy,
 * so practice mode and the test suite never require a Privy app id.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'
import { arbitrumSepoliaChain, ARBITRUM_SEPOLIA_CHAIN_ID } from './chain'
import {
  WalletContext,
  UNCONFIGURED_WALLET_VALUE,
  getPrivyAppId,
  parseCaipChainId,
  type EIP1193Provider,
  type NetworkSwitchResult,
  type WalletConnectionValue,
} from './WalletContext'
import type { Address } from '../phaseResolver'

/** Bridges Privy's hooks into the app's `WalletContext` (must be inside `<PrivyProvider>`). */
function PrivyWalletBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy()
  const { wallets } = useWallets()

  const wallet = wallets[0] ?? null

  const value = useMemo<WalletConnectionValue>(() => {
    const address = (wallet?.address ?? null) as Address | null
    const chainId = parseCaipChainId(wallet?.chainId)

    return {
      configured: true,
      ready,
      authenticated,
      address,
      chainId,
      walletClientType: wallet?.walletClientType ?? null,
      login: () => login(),
      logout: async () => {
        await logout()
      },
      switchToArbitrumSepolia: async (): Promise<NetworkSwitchResult> => {
        if (!wallet) return 'unsupported'
        try {
          await wallet.switchChain(ARBITRUM_SEPOLIA_CHAIN_ID)
          return 'switched'
        } catch (err) {
          const code = (err as { code?: number; name?: string } | null)?.code
          const name = (err as { code?: number; name?: string } | null)?.name
          if (code === 4001 || name === 'UserRejectedRequestError') {
            return 'rejected'
          }
          return 'error'
        }
      },
      getEthereumProvider: async (): Promise<EIP1193Provider | null> => {
        if (!wallet) return null
        try {
          return await wallet.getEthereumProvider()
        } catch {
          return null
        }
      },
    }
  }, [ready, authenticated, login, logout, wallet])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [appId] = useState(getPrivyAppId)

  if (!appId) {
    return (
      <WalletContext.Provider value={UNCONFIGURED_WALLET_VALUE}>
        {children}
      </WalletContext.Provider>
    )
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Wallet-only login: no email/social/passkey methods (GAME-203).
        loginMethods: ['wallet'],
        appearance: {
          walletChainType: 'ethereum-only',
          walletList: ['metamask', 'coinbase_wallet'],
        },
        // No embedded wallets in the first on-chain slice.
        embeddedWallets: {
          ethereum: { createOnLogin: 'off' },
        },
        defaultChain: arbitrumSepoliaChain,
        supportedChains: [arbitrumSepoliaChain],
      }}
    >
      <PrivyWalletBridge>{children}</PrivyWalletBridge>
    </PrivyProvider>
  )
}

export { useWalletConnection } from './WalletContext'
