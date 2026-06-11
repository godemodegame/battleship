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
    'Demo phase preview (phase derived from the URL matchId). Real match ids load contract state.',
} as const

/** Copy for deployment resolution outcomes on the match route. */
export const deploymentCopy = {
  unknownTitle: 'Deployment unavailable',
  unknownBody: (deploymentId: string) =>
    `This invite points to an unknown deployment (${deploymentId}). ` +
    'It may target a different network or a retired contract version.',
  invalidTitle: 'Deployment record invalid',
  invalidBody: (deploymentId: string) =>
    `The deployment record for ${deploymentId} failed validation. ` +
    'This build cannot offer on-chain actions against it.',
  pendingNote:
    'This deployment is registered, but its contract is not live yet. ' +
    'On-chain actions unlock once the contract is deployed.',
} as const

/** Wallet-aware entry onboarding (GAME-504, Flow 1 in docs/user-flows.md). */
export const onboardingCopy = {
  title: 'Encrypted Battleship',
  kicker: 'Tactical FHE Naval Ops',
  slides: [
    { heading: 'Hide your fleet with Fhenix', body: 'Place your fleet in secret.' },
    { heading: 'Every move is a transaction', body: 'Attack by sending on-chain moves.' },
    { heading: 'Outplay your friend on-chain', body: 'Only final results are revealed.' },
  ],
  next: 'Continue',
  skip: 'Skip',
} as const

/** Friend match creation (GAME-505/506, Flow 5 in docs/user-flows.md). */
export const createMatchCopy = {
  kicker: 'Play Against Friend',
  title: 'Invite Friend',
  addressLabel: 'Friend Wallet Address',
  addressPlaceholder: '0x…',
  paste: 'Paste Address',
  pasteFailed: 'Clipboard unavailable. Type the address instead.',
  create: 'Create Match',
  creating: 'Creating Match',
  back: 'Back',
  helper: 'Only this wallet can join the match.',
  validationEmpty: 'Enter a wallet address.',
  validationInvalid: 'Invalid address.',
  validationSelf: 'You cannot invite yourself.',
  created: 'Match Created',
} as const

/** Invite link sharing + creator waiting state (GAME-506/508, Flow 7). */
export const inviteCopy = {
  waitingTitle: 'Waiting for Friend',
  waitingBody: 'Send the invite link. The match starts after your friend joins.',
  invitedLabel: 'Invited wallet',
  linkLabel: 'Match Link',
  copy: 'Copy Invite Link',
  copied: 'Invite link copied',
  copyFailed: 'Could not copy. Long-press the link to copy it.',
  share: 'Share Invite',
  cancelMatch: 'Cancel Match',
  cancelling: 'Cancelling Match',
} as const

/** Invited-wallet join flow (GAME-507, Flow 8). */
export const joinCopy = {
  title: 'Join Match',
  invitedBody: 'You are invited to this match. Join to place your fleet.',
  creatorLabel: 'Created by',
  join: 'Join Match',
  joining: 'Joining Match',
  wrongWallet: 'This invite is for another wallet.',
} as const

/** Terminal / blocked lifecycle states on the match route (GAME-508). */
export const matchStateCopy = {
  waitingForOpponentSpectator: 'This match is waiting for the invited player.',
  spectatorActiveBody: 'This match is between other players.',
  cancelledBody: 'This match was cancelled. Create a new match to play.',
  forfeitedBody: 'This match ended by forfeit.',
  expiredTitle: 'Invite expired',
  expiredBody: 'The join deadline passed before your friend joined.',
  expiredJoinBody: 'The join deadline for this invite has passed.',
  unavailableBody: 'Match state could not be loaded.',
  retry: 'Retry',
  loading: 'Checking Match',
  backToMenu: 'Back',
} as const

/** Transaction lifecycle states (GAME-503/511, docs/copy-deck.md). */
export const txCopy = {
  confirmInWallet: 'Confirm in Wallet',
  pending: 'Transaction Pending',
  confirmed: 'Transaction Confirmed',
  failed: 'Transaction Failed',
  retry: 'Try Again',
  replacedNote: 'Your wallet replaced the transaction. Tracking the new one.',
} as const

/** Explorer links + match identity display (GAME-512). */
export const explorerCopy = {
  matchIdLabel: 'Match ID',
  networkLabel: 'Network',
  networkName: 'Arbitrum Sepolia',
  contractLabel: 'Contract',
  viewContract: 'View contract on explorer',
  viewTx: 'View transaction on explorer',
} as const
