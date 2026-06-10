/**
 * viem-compatible public/wallet clients (GAME-202, GAME-206).
 *
 * The public client is created once for Arbitrum Sepolia and works without a
 * connected wallet (used for reads and balance checks). The wallet client is
 * only created once the connected wallet reports the correct chain, and is
 * rebuilt whenever the active wallet, address, or chain changes so a write is
 * never sent through a stale client.
 */

import { useEffect, useMemo, useState } from 'react'
import { createPublicClient, createWalletClient, custom, http, type PublicClient, type WalletClient } from 'viem'
import { arbitrumSepoliaChain, ARBITRUM_SEPOLIA_CHAIN_ID } from './chain'
import { useWalletConnection } from './WalletContext'

let cachedPublicClient: PublicClient | null = null

/** Public client for Arbitrum Sepolia. Available without a connected wallet. */
export function usePublicClient(): PublicClient {
  return useMemo(() => {
    if (!cachedPublicClient) {
      cachedPublicClient = createPublicClient({
        chain: arbitrumSepoliaChain,
        transport: http(),
      })
    }
    return cachedPublicClient
  }, [])
}

/**
 * Wallet client for the active wallet, or `null` until the wallet is
 * connected, on Arbitrum Sepolia, and an EIP-1193 provider is available.
 */
export function useWalletClient(): WalletClient | null {
  const { configured, ready, authenticated, address, chainId, getEthereumProvider } =
    useWalletConnection()
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null)

  const canConnect =
    configured && ready && authenticated && !!address && chainId === ARBITRUM_SEPOLIA_CHAIN_ID

  useEffect(() => {
    if (!canConnect || !address) {
      setWalletClient(null)
      return
    }

    let cancelled = false
    getEthereumProvider().then((provider) => {
      if (cancelled) return
      if (!provider) {
        setWalletClient(null)
        return
      }
      setWalletClient(
        createWalletClient({
          account: address,
          chain: arbitrumSepoliaChain,
          transport: custom(provider),
        }),
      )
    })

    return () => {
      cancelled = true
    }
  }, [canConnect, address, getEthereumProvider])

  return walletClient
}
