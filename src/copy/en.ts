/**
 * Shared English player-facing copy (GAME-108).
 *
 * Practice and on-chain modes draw result, phase, and route text from this one
 * typed module so the application has a single English source of truth. Keep all
 * strings here English-only per the roadmap Definition of Done.
 */

/** Match-phase banner labels, keyed to the resolved `MatchPhase` kinds. */
export const phaseCopy = {
  walletRequired: 'Connect wallet to continue',
  wrongNetwork: 'Switch to Arbitrum Sepolia',
  notFound: 'Match not found',
  join: 'Join this match',
  waitingForOpponent: 'Waiting for opponent to join',
  placementValidating: 'Validating fleets',
  placementWaitingForFleet: 'Waiting for opponent fleet',
  placementSubmitted: 'Fleet submitted',
  placementPlace: 'Place your fleet',
  battleYourTurn: 'Your turn',
  battleOpponentTurn: "Opponent's turn",
  resolving: 'Resolving shot',
  finishedWon: 'You won',
  finishedLost: 'You lost',
  finishedComplete: 'Match finished',
  cancelled: 'Match cancelled',
  forfeited: 'Match forfeited',
  unavailable: 'Match unavailable',
} as const

/** Shot result toasts, shared by practice and (later) finalized on-chain moves. */
export const resultCopy = {
  miss: 'Miss',
  hit: 'Hit',
  sunkEnemy: (ship: string) => `Sunk — enemy ${ship} destroyed`,
  sunkYours: (ship: string) => `Sunk — your ${ship} is lost`,
} as const

/** Copy for the versioned `/match/:deploymentId/:matchId` route shell. */
export const matchRouteCopy = {
  kicker: 'On-chain Match',
  heading: 'Match Route',
  tagline: (deploymentId: string, matchId: string) =>
    `Deployment ${deploymentId} · Match ${matchId}`,
  backToPractice: 'Back to Practice',
  shellFootnote:
    'Mocked on-chain phases for the empty shell (phase derived from the URL matchId). Real contract wiring lands in later phases.',
} as const

/** Copy for deployment resolution outcomes on the match route. */
export const deploymentCopy = {
  unknownTitle: 'Deployment unavailable',
  unknownBody: (deploymentId: string) =>
    `This invite points to an unknown deployment (${deploymentId}). ` +
    'It may target a different network or a retired contract version.',
  pendingNote:
    'This deployment is registered, but its contract is not live yet. ' +
    'On-chain actions unlock in a later phase.',
} as const

/**
 * Wallet connection, network guard, and recovery copy (GAME-204, GAME-207,
 * GAME-209). Mirrors the Player-Facing Error Mapping table in
 * `docs/network-and-wallet-requirements.md`.
 */
export const walletCopy = {
  notConfigured: 'Wallet connection is not configured for this build.',
  connect: 'Connect Wallet',
  connecting: 'Connecting…',
  disconnect: 'Disconnect',
  loading: 'Loading wallet…',
  walletRequired: 'Connect wallet to continue',
  connectCancelled: 'Wallet connection cancelled.',
  signatureRejected: 'Action cancelled in wallet.',
  walletUnavailable: 'This wallet is not available. Choose another wallet.',
  wrongNetwork: 'Switch to Arbitrum Sepolia to continue.',
  switchNetwork: 'Switch to Arbitrum Sepolia',
  switchCancelled: 'Network switch cancelled. Try again to continue.',
  switching: 'Switching network…',
  clientUnavailable: 'Network request failed. Try again.',
  noTestEth: 'Add Arbitrum Sepolia ETH before sending transactions.',
  transactionReverted: 'Transaction failed. Match state was refreshed.',
  accountChanged: 'Wallet changed. Match state was refreshed.',
  sessionExpired: 'Reconnect your wallet to continue.',
  faucetHint: 'Need testnet ETH? Use an Arbitrum Sepolia faucet, then try again.',
} as const
