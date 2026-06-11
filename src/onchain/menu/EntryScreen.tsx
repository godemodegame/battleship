/**
 * Wallet-aware entry route (GAME-504, Flow 1 in docs/user-flows.md).
 *
 * `/` shows the short onboarding only while no wallet is connected; a
 * connected wallet is routed straight to the main menu and never replays
 * onboarding. Connect Wallet is the final onboarding action (Privy is the only
 * connection surface); Skip keeps local practice reachable without a wallet.
 */

import { Link, Navigate } from 'react-router-dom'
import { onboardingCopy, walletCopy } from '../../copy/en'
import { useWalletSession } from '../wallet/WalletSessionContext'

export function EntryScreen() {
  const wallet = useWalletSession()

  if (wallet.session.isConnected) {
    return <Navigate to="/menu" replace />
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
          <button
            className="btn primary"
            data-testid="entry-connect"
            disabled={connecting}
            onClick={wallet.actions.connect}
          >
            {connecting ? walletCopy.connecting : walletCopy.connect}
          </button>
        )}

        <Link className="btn ghost" data-testid="entry-skip" to="/practice">
          {onboardingCopy.skip}
        </Link>
      </div>
    </div>
  )
}
