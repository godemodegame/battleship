/**
 * Error mapping into readable English (GAME-108).
 *
 * Raw Solidity revert names and wallet error codes may be logged for developers,
 * but everything shown to a player should flow through `errorMessage`. See the
 * Error Mapping section of `docs/frontend-architecture.md`.
 */

export const ERROR_MESSAGES = {
  'wallet-not-connected': 'Wallet not connected',
  'wrong-network': 'Wrong network',
  // Wallet/connection recovery copy (GAME-204/207), mirrors the Player-Facing
  // Error Mapping table in docs/network-and-wallet-requirements.md.
  'connection-cancelled': 'Wallet connection cancelled.',
  'chain-switch-rejected': 'Network switch cancelled. Try again to continue.',
  'unsupported-wallet': 'This wallet is not available. Choose another wallet.',
  // GAME-209 funding guidance surfaced before write flows.
  'no-test-eth': 'Add Arbitrum Sepolia ETH before sending transactions.',
  'not-invited': 'Only the invited player can join',
  'not-your-turn': 'It is not your turn',
  'cell-already-attacked': 'This cell was already attacked',
  'shot-resolving': 'A shot is still resolving',
  'invalid-placement': 'Fleet placement is invalid',
  'encryption-failed': 'Fhenix encryption failed',
  'finalization-failed': 'Result finalization failed',
  'transaction-rejected': 'Transaction rejected',
  'transaction-reverted': 'Transaction reverted',
  unknown: 'Something went wrong',
} as const

export type ErrorCode = keyof typeof ERROR_MESSAGES

export function errorMessage(code: ErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.unknown
}

/**
 * Known contract revert identifiers mapped to a player-facing code. Names mirror
 * the errors planned in `docs/contract-api.md`; unknown names degrade safely.
 */
const CONTRACT_ERROR_CODES: Record<string, ErrorCode> = {
  NotInvited: 'not-invited',
  OnlyInvitedPlayer: 'not-invited',
  NotYourTurn: 'not-your-turn',
  CellAlreadyAttacked: 'cell-already-attacked',
  AlreadyAttacked: 'cell-already-attacked',
  ShotResolving: 'shot-resolving',
  ShotStillResolving: 'shot-resolving',
  InvalidPlacement: 'invalid-placement',
  WrongNetwork: 'wrong-network',
}

export function mapContractError(name: string | null | undefined): ErrorCode {
  if (!name) return 'unknown'
  return CONTRACT_ERROR_CODES[name] ?? 'unknown'
}

/** EIP-1193 user-rejected-request (4001) and viem's named variant → rejection. */
export function mapWalletError(
  err: { code?: number; name?: string } | null | undefined,
): ErrorCode {
  if (!err) return 'unknown'
  if (err.code === 4001 || err.name === 'UserRejectedRequestError') {
    return 'transaction-rejected'
  }
  return 'unknown'
}
