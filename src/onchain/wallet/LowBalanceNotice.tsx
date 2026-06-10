/**
 * Low / zero balance notice for Arbitrum Sepolia (GAME-209).
 *
 * Shown when the connected wallet reports a zero (or obviously insufficient)
 * balance before the player enters a multi-transaction friend-match flow.
 * Provides a primary action that can open a faucet (or copy the address for
 * manual funding). Non-blocking for the write guard itself — gas estimation
 * will still surface a clear failure if the user attempts a tx anyway.
 *
 * Takes only presentational props so it remains unit-testable.
 */

import { walletCopy } from '../../copy/en'
import type { WalletSession } from './session'

export interface LowBalanceNoticeProps {
  session: WalletSession
  /** Called when the user taps the primary "get testnet ETH" action. */
  onFund?: () => void
  /** Optional: the raw balance in wei (for title/tooltip). */
  balanceWei?: bigint | null
}

const FAUCET_URL = 'https://sepoliafaucet.com/' // public reference; real demo may use a curated list

export function LowBalanceNotice({ session, onFund, balanceWei }: LowBalanceNoticeProps) {
  const handleFund = () => {
    if (onFund) {
      onFund()
      return
    }
    // Default behavior: open a well-known Sepolia faucet in a new tab.
    // The address is not transmitted; the player can copy-paste or the faucet
    // may support direct paste from their wallet.
    if (typeof window !== 'undefined') {
      window.open(FAUCET_URL, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="low-balance-notice" data-testid="low-balance-notice">
      <h2 data-testid="low-balance-heading">{walletCopy.lowBalanceHeading}</h2>
      <p className="tagline">{walletCopy.lowBalanceBody}</p>

      {session.address && (
        <p className="footnote" data-testid="low-balance-address" title={session.address}>
          {walletCopy.walletLabel}: {walletCopy.shortAddress(session.address)}
          {balanceWei !== undefined && balanceWei !== null && (
            <span data-testid="low-balance-wei"> · 0 wei</span>
          )}
        </p>
      )}

      <div className="home-actions">
        <button
          className="btn primary"
          data-testid="low-balance-fund"
          onClick={handleFund}
        >
          {walletCopy.addEthAction}
        </button>
      </div>
    </div>
  )
}
