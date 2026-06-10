/**
 * Arbitrum Sepolia network constants (GAME-205).
 *
 * Arbitrum Sepolia (chain id 421614) is the only chain supported for the MVP
 * (see `docs/network-and-wallet-requirements.md`). This module is the single
 * source of truth for the chain id, RPC, and explorer used by Privy
 * configuration, viem clients, and the network guard.
 */

import { defineChain } from 'viem'

export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614 as const

export const ARBITRUM_SEPOLIA_RPC_URL = 'https://sepolia-rollup.arbitrum.io/rpc'

export const ARBITRUM_SEPOLIA_EXPLORER_URL = 'https://sepolia.arbiscan.io'

/** viem chain definition for Arbitrum Sepolia, used by Privy and viem clients. */
export const arbitrumSepoliaChain = defineChain({
  id: ARBITRUM_SEPOLIA_CHAIN_ID,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [ARBITRUM_SEPOLIA_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Arbiscan', url: ARBITRUM_SEPOLIA_EXPLORER_URL },
  },
  testnet: true,
})

export function explorerAddressUrl(address: string): string {
  return `${ARBITRUM_SEPOLIA_EXPLORER_URL}/address/${address}`
}

export function explorerTxUrl(hash: string): string {
  return `${ARBITRUM_SEPOLIA_EXPLORER_URL}/tx/${hash}`
}
