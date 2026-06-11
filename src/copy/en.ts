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

/** Wallet session + network copy (GAME-204 / GAME-207). */
export const walletCopy = {
  connect: 'Connect Wallet',
  connecting: 'Connecting…',
  disconnect: 'Disconnect',
  networkBadge: 'Arbitrum Sepolia',
  walletLabel: 'Wallet',
  /** Truncate a checksum/lowercased address for display: 0x1234…abcd */
  shortAddress: (address: string) =>
    address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address,
  connectPrompt: 'Connect an external wallet on Arbitrum Sepolia to play on-chain.',
  configMissing:
    'Wallet connection is not configured in this build. Local practice still works.',
  wrongNetworkHeading: 'Wrong Network',
  wrongNetworkBody: 'This match runs on Arbitrum Sepolia. Switch networks to continue.',
  switchAction: 'Switch to Arbitrum Sepolia',
  switching: 'Switching…',
  chooseAnotherWallet: 'Disconnect / choose another wallet',
  // GAME-209: low / zero balance guidance (testnet only).
  lowBalanceHeading: 'Add testnet ETH',
  lowBalanceBody:
    'This wallet has no Arbitrum Sepolia ETH. Fund it from a faucet to pay for gas.',
  addEthAction: 'Get Arbitrum Sepolia ETH',
  // GAME-210 (internal label only; not user-visible unless debug).
  restoredFromHandoff: 'Returned from wallet',
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
