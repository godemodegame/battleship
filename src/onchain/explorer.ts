/**
 * Block explorer links for Arbitrum Sepolia (GAME-512).
 *
 * Only the MVP chain (421614) is supported, so the base URL is a constant.
 * Player-facing UI may link transactions, addresses, and the game contract;
 * no private data ever appears in these URLs.
 */

export const EXPLORER_BASE_URL = 'https://sepolia.arbiscan.io'

export function explorerTxUrl(hash: string): string {
  return `${EXPLORER_BASE_URL}/tx/${hash}`
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_BASE_URL}/address/${address}`
}
