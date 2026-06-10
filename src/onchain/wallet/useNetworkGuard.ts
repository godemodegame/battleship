/**
 * React hook wrapping `resolveWalletGuard` with live connection state
 * (GAME-205, GAME-206, GAME-207).
 */

import { useCallback, useState } from 'react'
import { resolveWalletGuard, type WalletGuardState } from './networkGuard'
import { useWalletConnection, type NetworkSwitchResult } from './WalletContext'
import { useWalletClient, usePublicClient } from './useViemClients'

export interface NetworkGuard {
  guard: WalletGuardState
  /** True while a `switchToArbitrumSepolia` request is pending. */
  switching: boolean
  /** Result of the most recent switch attempt, for recoverable messaging. */
  lastSwitchResult: NetworkSwitchResult | null
  /** Ask the active wallet to switch to Arbitrum Sepolia (GAME-207). */
  switchNetwork: () => Promise<NetworkSwitchResult>
}

export function useNetworkGuard(): NetworkGuard {
  const connection = useWalletConnection()
  const publicClient = usePublicClient()
  const walletClient = useWalletClient()
  const [switching, setSwitching] = useState(false)
  const [lastSwitchResult, setLastSwitchResult] = useState<NetworkSwitchResult | null>(null)

  const guard = resolveWalletGuard({
    configured: connection.configured,
    ready: connection.ready,
    authenticated: connection.authenticated,
    address: connection.address,
    chainId: connection.chainId,
    hasPublicClient: !!publicClient,
    hasWalletClient: !!walletClient,
  })

  const switchNetwork = useCallback(async (): Promise<NetworkSwitchResult> => {
    setSwitching(true)
    try {
      const result = await connection.switchToArbitrumSepolia()
      setLastSwitchResult(result)
      return result
    } finally {
      setSwitching(false)
    }
  }, [connection])

  return { guard, switching, lastSwitchResult, switchNetwork }
}
