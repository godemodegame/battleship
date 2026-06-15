/**
 * Wallet session bar (GAME-204) — presentational.
 *
 * Shows the active wallet identity: a connect button when disconnected, or the
 * truncated address + network badge + disconnect when connected. Takes a
 * `WalletSession` and callbacks only, so it is fully testable without Privy.
 */

import { walletCopy } from '../../copy/en'
import type { WalletSession } from './session'

export interface WalletSessionBarProps {
  session: WalletSession
  onConnect: () => void
  onDisconnect: () => void
  /** True when the build has no Privy app id; connection is unavailable. */
  configMissing?: boolean
}

export function WalletSessionBar({
  session,
  onConnect,
  onDisconnect,
  configMissing = false,
}: WalletSessionBarProps) {
  if (configMissing) {
    return (
      <div className="wallet-bar" data-testid="wallet-bar" data-wallet-status="config-missing">
        <span className="footnote" data-testid="wallet-config-missing">
          {walletCopy.configMissing}
        </span>
      </div>
    )
  }

  if (session.isConnected && session.address) {
    return (
      <div className="wallet-bar" data-testid="wallet-bar" data-wallet-status={session.status}>
        <span
          className={`network-badge ${session.isCorrectChain ? 'ok' : 'warn'}`}
          data-testid="network-badge"
        >
          {session.isCorrectChain ? walletCopy.networkBadge : walletCopy.wrongNetworkHeading}
        </span>
        <span className="wallet-address" data-testid="wallet-address" title={session.address}>
          {walletCopy.shortAddress(session.address)}
        </span>
        <button className="btn ghost" data-ic="power" data-testid="wallet-disconnect" onClick={onDisconnect}>
          {walletCopy.disconnect}
        </button>
      </div>
    )
  }

  const connecting = session.status === 'connecting'
  return (
    <div className="wallet-bar" data-testid="wallet-bar" data-wallet-status={session.status}>
      <button
        className="btn primary"
        data-ic="login"
        data-testid="wallet-connect"
        onClick={onConnect}
        disabled={connecting}
      >
        {connecting ? walletCopy.connecting : walletCopy.connect}
      </button>
    </div>
  )
}
