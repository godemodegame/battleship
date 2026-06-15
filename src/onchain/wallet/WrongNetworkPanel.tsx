/**
 * Wrong-network recovery panel (GAME-205 / GAME-207) — presentational.
 *
 * Shown when the wallet is connected but not on Arbitrum Sepolia. The account
 * stays visible; the primary action is `Switch to Arbitrum Sepolia`. A rejected
 * switch surfaces a recoverable message and the player may retry or disconnect.
 * Takes a session, callbacks, and an optional mapped error only.
 */

import { errorMessage, type ErrorCode } from '../../copy/errors'
import { walletCopy } from '../../copy/en'
import type { WalletSession } from './session'

export interface WrongNetworkPanelProps {
  session: WalletSession
  onSwitch: () => void
  onDisconnect: () => void
  /** Mapped recoverable error from a previous attempt (e.g. switch rejected). */
  switchError?: ErrorCode | null
  /** True while a switch request is awaiting the wallet. */
  switching?: boolean
}

export function WrongNetworkPanel({
  session,
  onSwitch,
  onDisconnect,
  switchError = null,
  switching = false,
}: WrongNetworkPanelProps) {
  return (
    <div className="wrong-network-panel" data-testid="wrong-network-panel">
      <h2 data-testid="wrong-network-heading">{walletCopy.wrongNetworkHeading}</h2>
      <p className="tagline">{walletCopy.wrongNetworkBody}</p>

      {session.address && (
        <p className="footnote" data-testid="wrong-network-address" title={session.address}>
          {walletCopy.walletLabel}: {walletCopy.shortAddress(session.address)}
        </p>
      )}

      {switchError && (
        <p className="error-note" role="alert" data-testid="wrong-network-error">
          {errorMessage(switchError)}
        </p>
      )}

      <div className="home-actions">
        <button
          className="btn primary"
          data-ic="switch"
          data-testid="wrong-network-switch"
          onClick={onSwitch}
          disabled={switching}
        >
          {switching ? walletCopy.switching : walletCopy.switchAction}
        </button>
        <button
          className="btn ghost"
          data-testid="wrong-network-disconnect"
          onClick={onDisconnect}
        >
          {walletCopy.chooseAnotherWallet}
        </button>
      </div>
    </div>
  )
}
