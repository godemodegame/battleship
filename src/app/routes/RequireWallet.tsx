/**
 * Sign-in gate for every playable route.
 *
 * Playing is sign-in only: the menu, practice hub, match creation, lobby,
 * match list, and every match route sit behind this guard. A visitor without a
 * connected wallet is sent back to `/`, which is the only unauthenticated
 * surface (onboarding + Sign in).
 *
 * The intended destination rides along in location state so an invite link
 * survives the login round-trip and lands on the match instead of the hub.
 *
 * While Privy is still resolving a stored session the guard renders a status
 * overlay rather than redirecting — a reload of a signed-in tab must not flash
 * the onboarding screen or lose the deep link.
 */

import { Navigate, useLocation } from 'react-router-dom'
import { useWalletSession } from '../../onchain/wallet/WalletSessionContext'
import { StatusOverlay } from '../../ui/common'
import { walletCopy } from '../../copy/en'

export function RequireWallet({ children }: { children: React.ReactNode }) {
  const wallet = useWalletSession()
  const location = useLocation()

  if (wallet.session.isConnected) return <>{children}</>

  if (wallet.session.status === 'connecting') {
    return <StatusOverlay title={walletCopy.connecting} testId="wallet-gate-connecting" />
  }

  return (
    <Navigate
      to="/"
      replace
      state={{ from: `${location.pathname}${location.search}` }}
    />
  )
}
