/**
 * Wallet-aware entry route (GAME-504, Flow 1 in docs/user-flows.md).
 *
 * `/` is the only unauthenticated surface: it shows the short onboarding while
 * no wallet is connected, and routes a connected wallet straight to the
 * practice hub (which doubles as the menu) without replaying onboarding.
 * Signing in through Privy is the sole way into the game — there is no guest
 * or skip path, because every mode is played on-chain.
 *
 * A visitor bounced here by `RequireWallet` carries their intended route in
 * location state, so an invite link resumes at the match after login instead of
 * dropping the player on the hub.
 */

import { Navigate, useLocation } from 'react-router-dom'
import { onboardingCopy, walletCopy } from '../../copy/en'
import { useWalletSession } from '../wallet/WalletSessionContext'

function intendedRoute(state: unknown): string {
  if (typeof state !== 'object' || state === null) return '/practice'
  const from = (state as { from?: unknown }).from
  // Only same-origin absolute paths: never let a crafted history entry send a
  // freshly signed-in player off-site.
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) {
    return '/practice'
  }
  return from
}

export function EntryScreen() {
  const wallet = useWalletSession()
  const location = useLocation()

  if (wallet.session.isConnected) {
    return <Navigate to={intendedRoute(location.state)} replace />
  }

  const connecting = wallet.session.status === 'connecting'

  return (
    <div className="overlay home" data-testid="entry-screen">
      <div className="title-lockup">
        <span className="title-kicker">{onboardingCopy.kicker}</span>
        <h1>
          Encrypted
          <br />
          Battleship
        </h1>
      </div>

      <div className="home-actions">
        <ul className="onboarding-slides" data-testid="onboarding-slides">
          {onboardingCopy.slides.map((slide) => (
            <li key={slide.heading}>
              <strong>{slide.heading}</strong>
              <span>{slide.body}</span>
            </li>
          ))}
        </ul>

        {wallet.configMissing ? (
          <p className="footnote" data-testid="entry-config-missing">
            {walletCopy.configMissing}
          </p>
        ) : (
          <>
            <button
              className="btn primary"
              data-ic="login"
              data-testid="entry-connect"
              disabled={connecting}
              onClick={wallet.actions.connect}
            >
              {connecting ? walletCopy.connecting : walletCopy.connect}
            </button>
            <p className="footnote" data-testid="entry-sign-in-required">
              {onboardingCopy.signInRequired}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
