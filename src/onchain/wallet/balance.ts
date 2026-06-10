/**
 * Arbitrum Sepolia balance check and funding guidance (GAME-209).
 *
 * The MVP does not define a permanent ETH minimum because gas prices and
 * contract costs can change (`docs/network-and-wallet-requirements.md`).
 * `LOW_BALANCE_WEI` is a conservative buffer used only to prompt the player to
 * fund their wallet before starting a multi-transaction friend match; it is
 * not a hard requirement enforced by any contract write.
 */

import { formatEther } from 'viem'

/** Roughly enough for a handful of testnet transactions at typical gas prices. */
export const LOW_BALANCE_WEI = 200_000_000_000_000n // 0.0002 ETH

export interface BalanceStatus {
  /** Raw balance in wei. */
  balance: bigint
  /** Human-readable ETH amount, e.g. "0.0125". */
  formatted: string
  /** True when the balance is at or below the low-balance buffer. */
  isLow: boolean
}

export function evaluateBalance(balance: bigint): BalanceStatus {
  return {
    balance,
    formatted: formatEther(balance),
    isLow: balance <= LOW_BALANCE_WEI,
  }
}
