/**
 * Wallet identity, network guard, and balance UI (GAME-204, GAME-207, GAME-209).
 *
 * Renders on on-chain routes. Shows the active wallet address, a disconnect
 * action, the Arbitrum Sepolia network guard with a switch action and
 * recoverable messaging, and a low-balance funding hint.
 */

import { walletCopy } from '../../copy/en'
import { useWalletConnection } from './WalletContext'
import { useNetworkGuard } from './useNetworkGuard'
import { useBalanceCheck } from './useBalanceCheck'

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function WalletConnectionPanel() {
  const connection = useWalletConnection()
  const { guard, switching, lastSwitchResult, switchNetwork } = useNetworkGuard()
  const { status: balance, error: balanceError } = useBalanceCheck()

  if (!connection.configured) {
    return (
      <div className="home-actions" data-testid="wallet-panel" data-wallet-state="not-configured">
        <p className="footnote">{walletCopy.notConfigured}</p>
      </div>
    )
  }

  if (!connection.ready) {
    return (
      <div className="home-actions" data-testid="wallet-panel" data-wallet-state="loading">
        <p className="footnote">{walletCopy.loading}</p>
      </div>
    )
  }

  if (!connection.authenticated || !connection.address) {
    return (
      <div className="home-actions" data-testid="wallet-panel" data-wallet-state="disconnected">
        <button type="button" className="btn primary" onClick={connection.login}>
          {walletCopy.connect}
        </button>
        <p className="footnote">{walletCopy.walletRequired}</p>
      </div>
    )
  }

  return (
    <div className="home-actions" data-testid="wallet-panel" data-wallet-state={guard.kind}>
      <p className="footnote" data-testid="wallet-address">
        {shortenAddress(connection.address)}
      </p>

      {guard.kind === 'wrong-network' && (
        <>
          <p className="footnote" data-testid="wallet-wrong-network">
            {walletCopy.wrongNetwork}
          </p>
          <button
            type="button"
            className="btn primary"
            onClick={() => void switchNetwork()}
            disabled={switching}
          >
            {switching ? walletCopy.switching : walletCopy.switchNetwork}
          </button>
          {lastSwitchResult === 'rejected' && (
            <p className="footnote" data-testid="wallet-switch-rejected">
              {walletCopy.switchCancelled}
            </p>
          )}
          {lastSwitchResult === 'error' && (
            <p className="footnote" data-testid="wallet-switch-error">
              {walletCopy.clientUnavailable}
            </p>
          )}
        </>
      )}

      {guard.kind === 'client-unavailable' && (
        <p className="footnote" data-testid="wallet-client-unavailable">
          {walletCopy.clientUnavailable}
        </p>
      )}

      {guard.kind === 'ready' && (
        <>
          {balanceError && (
            <p className="footnote" data-testid="wallet-balance-error">
              {walletCopy.clientUnavailable}
            </p>
          )}
          {balance?.isLow && (
            <p className="footnote" data-testid="wallet-low-balance">
              {walletCopy.noTestEth} {walletCopy.faucetHint}
            </p>
          )}
        </>
      )}

      <button type="button" className="btn ghost" onClick={() => void connection.logout()}>
        {walletCopy.disconnect}
      </button>
    </div>
  )
}
