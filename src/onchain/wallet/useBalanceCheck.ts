/**
 * React hook for the Arbitrum Sepolia balance check (GAME-209).
 */

import { useEffect, useState } from 'react'
import { ARBITRUM_SEPOLIA_CHAIN_ID } from './chain'
import { evaluateBalance, type BalanceStatus } from './balance'
import { useWalletConnection } from './WalletContext'
import { usePublicClient } from './useViemClients'

export interface BalanceCheck {
  status: BalanceStatus | null
  loading: boolean
  /** True when the balance read failed (RPC unavailable). */
  error: boolean
}

export function useBalanceCheck(): BalanceCheck {
  const { configured, ready, authenticated, address, chainId } = useWalletConnection()
  const publicClient = usePublicClient()
  const [status, setStatus] = useState<BalanceStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const canCheck =
    configured && ready && authenticated && !!address && chainId === ARBITRUM_SEPOLIA_CHAIN_ID

  useEffect(() => {
    if (!canCheck || !address) {
      setStatus(null)
      setError(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(false)

    publicClient
      .getBalance({ address })
      .then((balance) => {
        if (cancelled) return
        setStatus(evaluateBalance(balance))
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
        setStatus(null)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [canCheck, address, publicClient])

  return { status, loading, error }
}
