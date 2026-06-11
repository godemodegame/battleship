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
  /** Called when the user taps the primary "get testnet ETH" action.
   * When provided, the caller is responsible for the full funding action
   * (e.g. prepareHandoff + opening the faucet). If omitted, the component
   * opens the default faucet in a new tab.
   */
  onFund?: () => void
  /**
   * Optional raw balance in wei. When non-null/undefined, a visible suffix
   * " · <value> wei" is appended to the address line (used by the zero-balance
   * funding notice to confirm the reported balance).
   */
  balanceWei?: bigint | null
}

/** Recommended public faucet for Arbitrum Sepolia testnet ETH. */
export const FAUCET_URL = 'https://sepoliafaucet.com/'

/**
 * Below this the wallet probably cannot finish a multi-transaction match
 * (create/join + fleet + shots + finalizations), so a non-blocking warning is
 * shown (GAME-804). 0.0001 ETH ≈ dozens of Arbitrum Sepolia transactions.
 */
export const LOW_BALANCE_THRESHOLD_WEI = 100_000_000_000_000n

/** Inline, non-blocking warning for a connected wallet running low on gas. */
export function LowBalanceWarning({ balanceWei }: { balanceWei: bigint | null }) {
  return (
    <p className="footnote warn" data-testid="low-balance-warning" role="status">
      {walletCopy.lowBalanceWarnBody}
      {balanceWei !== null && <span> · {balanceWei.toString()} wei</span>}
    </p>
  )
}

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
            <span data-testid="low-balance-wei"> · {balanceWei.toString()} wei</span>
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
