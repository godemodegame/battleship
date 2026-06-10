/**
 * Account-change and session-expiry cleanup (GAME-208).
 *
 * Calls `onCleanup` whenever the active wallet address changes, the active
 * chain changes, or the Privy session goes from authenticated to
 * unauthenticated. Callers use this to stop pending local action
 * orchestration, clear selected targets and transient forms, clear plaintext
 * placement state, invalidate account-bound CoFHE clients, rebuild viem
 * clients, and refetch player/match state
 * (`docs/network-and-wallet-requirements.md`).
 *
 * The hook does not itself hold any private state; it only detects the
 * transitions that require future feature stores to clear theirs.
 */

import { useEffect, useRef } from 'react'
import { useWalletConnection } from './WalletContext'

export type WalletChangeReason = 'account-changed' | 'chain-changed' | 'session-expired'

export function useAccountChangeCleanup(onCleanup: (reason: WalletChangeReason) => void): void {
  const { ready, authenticated, address, chainId } = useWalletConnection()
  const onCleanupRef = useRef(onCleanup)
  onCleanupRef.current = onCleanup

  const previous = useRef<{ authenticated: boolean; address: string | null; chainId: number | null }>({
    authenticated,
    address,
    chainId,
  })

  useEffect(() => {
    if (!ready) return

    const prev = previous.current

    if (prev.authenticated && !authenticated) {
      onCleanupRef.current('session-expired')
    } else if (prev.address !== null && address !== null && prev.address !== address) {
      onCleanupRef.current('account-changed')
    } else if (prev.chainId !== null && chainId !== null && prev.chainId !== chainId) {
      onCleanupRef.current('chain-changed')
    }

    previous.current = { authenticated, address, chainId }
  }, [ready, authenticated, address, chainId])
}
