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
  'decryption-not-ready': 'Encrypted validation is still processing. Try again shortly.',
  'transaction-rejected': 'Transaction rejected',
  'transaction-reverted': 'Transaction reverted',
  // Phase 5 lifecycle + transaction tracking copy (GAME-503/507/508/511),
  // wording from the Errors section of docs/copy-deck.md.
  'match-not-found': 'This match was not found.',
  'match-load-failed': 'Could not load the match. Check your connection and retry.',
  // GAME-804 degraded network/deployment states.
  'rpc-unreachable': 'The network RPC is not responding. Check your connection and retry.',
  'stale-deployment': 'No contract was found at the recorded address. This deployment may be stale.',
  'invalid-address': 'Invalid address.',
  'address-required': 'Enter a wallet address.',
  'self-invite': 'You cannot invite yourself.',
  'join-deadline-expired': 'This invite has expired.',
  'already-joined': 'This match has already started.',
  'match-finished': 'Match already finished.',
  'cannot-cancel': 'This match can no longer be cancelled.',
  'only-creator': 'Only the match creator can do this.',
  'not-participant': 'You are not a player in this match.',
  'fleet-already-submitted': 'Fleet already submitted.',
  'invalid-status': 'This action is not available right now.',
  'transaction-cancelled': 'Transaction was cancelled in the wallet.',
  'transaction-dropped': 'Transaction was dropped by the network. Try again.',
  unknown: 'Something went wrong',
} as const

export type ErrorCode = keyof typeof ERROR_MESSAGES

export function errorMessage(code: ErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.unknown
}

/**
 * Known contract revert identifiers mapped to a player-facing code. Names mirror
 * the custom errors in the generated `BattleshipGame` ABI
 * (`src/onchain/abi/battleshipGame.ts`); unknown names degrade safely.
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
  // Real ABI error names (Phase 3/4 contract), wired for Phase 5 writes.
  MatchNotFound: 'match-not-found',
  NotInvitedOpponent: 'not-invited',
  CreatorCannotJoinOwnMatch: 'not-invited',
  OpponentAlreadyJoined: 'already-joined',
  JoinDeadlineExpired: 'join-deadline-expired',
  InvalidInvitedOpponent: 'invalid-address',
  SelfInviteNotAllowed: 'self-invite',
  InvalidMatchStatus: 'invalid-status',
  CannotCancelStartedMatch: 'cannot-cancel',
  OnlyCreator: 'only-creator',
  MatchAlreadyFinished: 'match-finished',
  FleetAlreadySubmitted: 'fleet-already-submitted',
  NotMatchPlayer: 'not-participant',
  NotMatchPlayerAddress: 'not-participant',
  PendingShotExists: 'shot-resolving',
  PlacementValidationPending: 'invalid-status',
  DecryptionResultNotReady: 'decryption-not-ready',
  NoPendingPlacementValidation: 'finalization-failed',
  NoTimeoutAvailable: 'invalid-status',
  // Phase 7 battle reverts (GAME-704/705/710).
  InvalidCellIndex: 'invalid-status',
  NoPendingShot: 'finalization-failed',
  InvalidMoveId: 'finalization-failed',
  MoveNotFound: 'finalization-failed',
  InvalidShotResult: 'finalization-failed',
  NotTimeoutClaimant: 'invalid-status',
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
