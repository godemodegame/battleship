/**
 * Shared English player-facing copy (GAME-108).
 *
 * Practice and on-chain modes draw result, phase, and route text from this one
 * typed module so the application has a single English source of truth. Keep all
 * strings here English-only per the roadmap Definition of Done.
 */

/** App-shell connectivity + asset loading states (GAME-805). */
export const appShellCopy = {
  offlineBanner: 'You are offline. Reconnect to continue playing.',
  loadingTitle: 'Loading Battlefield',
  loadingModels: (progress: number) => `Loading Models — ${progress}%`,
  loadErrorTitle: 'Battlefield Unavailable',
  loadErrorBody: 'A required 3D asset failed to load. Check your connection and retry.',
  loadErrorRetry: 'Retry Loading',
} as const

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
  connect: 'Sign in',
  connecting: 'Connecting…',
  disconnect: 'Sign out',
  networkBadge: 'Arbitrum Sepolia',
  walletLabel: 'Wallet',
  /** Truncate a checksum/lowercased address for display: 0x1234…abcd */
  shortAddress: (address: string) =>
    address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address,
  connectPrompt: 'Sign in with email, a social account, or a wallet to play on-chain.',
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
  // GAME-804: non-blocking warning when the balance may not cover a full match.
  lowBalanceWarnBody:
    'This wallet is low on Arbitrum Sepolia ETH. Top up before a long match.',
  addEthAction: 'Get Arbitrum Sepolia ETH',
  // GAME-804: the active wallet has no usable EIP-1193 provider.
  unsupportedWalletBody:
    'This wallet could not be used in this browser. Disconnect and choose another wallet.',
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
  // Placement-first creation (GAME-505/506): arrange the fleet, then create the
  // match and submit the encrypted fleet in one transaction.
  placementTitle: 'Place Your Fleet',
  placementHelper: 'Arrange your ships, then create the match and send your fleet.',
  placementIncomplete: 'Place all ten ships before creating the match.',
  createAndSubmit: 'Create Match & Send Fleet',
  submittingFleet: 'Sending Fleet',
} as const

/** Open-match creation: host a game any random player can join (GAME random-mm). */
export const openMatchCopy = {
  kicker: 'Play a Random Opponent',
  title: 'Host Open Game',
  helper: 'Anyone can join this game. The first player to join becomes your opponent.',
  placementTitle: 'Place Your Fleet',
  placementHelper: 'Arrange your ships, then host the open game and send your fleet.',
  placementIncomplete: 'Place all ten ships before hosting the game.',
  createAndSubmit: 'Host Open Game & Send Fleet',
  submittingFleet: 'Sending Fleet',
} as const

/** On-chain bot (single-player practice) match creation. */
export const botMatchCopy = {
  kicker: 'Practice vs Bot',
  title: 'Play the Bot',
  helper:
    'A fully on-chain practice match against the hard computer opponent. Both fleets are encrypted on-chain and every shot is resolved by the contract.',
  placementTitle: 'Place Your Fleet',
  placementHelper: "Arrange your ships, then start the match — the bot's fleet is placed for you.",
  placementIncomplete: 'Place all ten ships before starting the match.',
  createAndSubmit: 'Start Bot Match',
  submittingFleet: 'Starting Match',
} as const

/** Loading + status copy for the on-chain bot battle (3D, auto-chained txs). */
export const botBattleCopy = {
  preparingTitle: 'Preparing your encrypted battle',
  preparingSub: 'Encrypting both fleets and opening the match on-chain…',
  startingTitle: 'Starting the battle',
  startingSub: 'Validating your fleet on-chain…',
  warmingTitle: 'Securing the battlefield',
  warmingSub: 'Preparing the encryption session…',
  confirming: 'Confirming on-chain…',
  // Full-screen overlay shown while the opponent's move settles on-chain.
  confirmingTitle: 'Confirming on-chain',
  confirmingBotSub: 'The opponent fired — settling the result on-chain…',
  // Automatic recovery after an on-chain stall (no manual tap required).
  reconnectingTitle: 'Reconnecting',
  reconnectingStatus: 'Reconnecting…',
  reconnectingSub: 'Lost the chain for a moment — retrying automatically.',
  syncFailed: 'On-chain sync failed — tap Retry.',
  stalledStatus: 'Sync Stalled',
  retry: 'Retry now',
} as const

/** Open-match lobby ("Find a Game") + Quick Match (random matchmaking). */
export const lobbyCopy = {
  kicker: 'Random Matchmaking',
  title: 'Find a Game',
  menuEntry: 'Find a Game',
  quickMatch: 'Quick Match',
  quickMatchSearching: 'Finding a Game…',
  hostNew: 'Host Open Game',
  sectionJoinable: 'Open Games',
  sectionMine: 'Your Open Game',
  joinLabel: 'Join',
  hostedBy: 'Hosted by',
  waitingForYou: 'Waiting for a challenger',
  empty: 'No open games right now. Host one and wait for a challenger.',
  emptyCta: 'Host Open Game',
  loading: 'Loading open games…',
  loadError: 'Could not load open games.',
  partialError: 'Some games failed to load.',
  retry: 'Retry',
  refresh: 'Refresh',
  back: 'Back',
  connectPrompt: 'Connect your wallet to find a game.',
  // Quick Match navigates to the oldest joinable game, or hosts one if none.
  quickMatchHosting: 'No open game found — hosting one for you.',
} as const

/** Wallet-scoped match list ("My Battles"). */
export const matchListCopy = {
  kicker: 'On-chain Battles',
  title: 'My Battles',
  menuEntry: 'My Battles',
  sectionWaiting: 'Waiting for Opponent',
  sectionActive: 'In Progress',
  sectionFinished: 'Finished',
  roleCreator: 'You created',
  roleJoiner: 'You joined',
  opponentLabel: 'vs',
  noOpponentYet: 'No opponent yet',
  statusPlacement: 'Placing Fleet',
  statusStarting: 'Starting Match',
  resultWon: 'Won',
  resultLost: 'Lost',
  open: 'Open',
  empty: 'No battles yet. Create a match to start one.',
  emptyCta: 'Play Against Friend',
  loading: 'Loading battles…',
  loadError: 'Could not load your battles.',
  partialError: 'Some battles failed to load.',
  retry: 'Retry',
  loadMore: 'Load Older Battles',
  loadingMore: 'Loading…',
  back: 'Back',
  connectPrompt: 'Connect your wallet to see your battles.',
  // The contract indexes matches at create/join; an invite a wallet never
  // joined only surfaces through its invite link.
  invitedNote: 'Invites you have not joined appear once you join them.',
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
  // Open-match host waiting for any challenger (random matchmaking).
  openWaitingTitle: 'Waiting for a Challenger',
  openWaitingBody: 'This is an open game. The match starts as soon as any player joins.',
} as const

/** Invited-wallet join flow (GAME-507, Flow 8). */
export const joinCopy = {
  title: 'Join Match',
  invitedBody: 'You are invited to this match. Join to place your fleet.',
  // Open match (random matchmaking): no invite, any player may join.
  openTitle: 'Join Open Game',
  openBody: 'This is an open game. Place your fleet to join and start the battle.',
  creatorLabel: 'Created by',
  wrongWallet: 'This invite is for another wallet.',
  // Placement-first join (GAME-507): arrange the fleet, then join and submit the
  // encrypted fleet in one transaction.
  placementTitle: 'Place Your Fleet',
  placementHelper: 'Arrange your ships, then join the match and send your fleet.',
  placementIncomplete: 'Place all ten ships before joining the match.',
  joinAndSubmit: 'Join & Send Fleet',
  submittingFleet: 'Sending Fleet',
} as const

/** Encrypted on-chain fleet placement (GAME-602..611). */
export const encryptedPlacementCopy = {
  title: 'Deploy Encrypted Fleet',
  helper: 'Tap a ship, then a grid cell. Ships cannot touch.',
  rotate: 'Rotate',
  autoPlace: 'Auto Place',
  clear: 'Clear',
  confirm: 'Encrypt & Submit Fleet',
  preparing: 'Preparing CoFHE',
  encrypting: 'Encrypting Fleet',
  progress: {
    initializing: 'Preparing CoFHE',
    initTfhe: 'Loading encryption engine',
    fetchKeys: 'Fetching encryption keys',
    pack: 'Packing encrypted inputs',
    prove: 'Generating privacy proof',
    verify: 'Verifying encrypted inputs',
    done: 'Encryption complete',
  },
  worker: 'Encryption runs in a background worker on this browser.',
  mainThread: 'This browser does not support the encryption worker.',
  invalidTitle: 'Fleet Placement Invalid',
  invalidBody: 'The contract rejected this fleet. Place a new fleet and submit again.',
  validatingTitle: 'Validating Placement',
  validatingBody:
    'The CoFHE network is checking your fleet. Finalize to fetch the result and publish it on-chain.',
  finalize: 'Finalize Validation',
  fetchingProof: 'Fetching the CoFHE result',
  validTitle: 'Fleet Confirmed',
  waitingOpponent: 'Your fleet is valid. Waiting for the opponent fleet.',
  privacyNote: 'Your plaintext fleet is cleared after the submission confirms.',
} as const

/** On-chain battle HUD (GAME-703..712). */
export const battleCopy = {
  enemyBoard: 'Enemy waters',
  yourBoard: 'Your waters',
  enemyShips: (remaining: number, total: number) => `Enemy ships ${remaining}/${total}`,
  yourShips: (remaining: number, total: number) => `Your ships ${remaining}/${total}`,
  yourTurnHint: 'Select a target cell.',
  fireAt: (cell: string) => `Fire at ${cell}`,
  selectTarget: 'Select a target cell',
  opponentTurn: 'Waiting for the opponent to fire.',
  botTurnTitle: "Opponent's turn",
  advanceBotTurn: 'Advance Opponent Turn',
  firing: 'Sending Attack',
  resolvingTitle: 'Resolving Shot',
  resolvingBody:
    'The CoFHE network is resolving the shot. Finalize to fetch the result and publish it on-chain.',
  resolvingShotAt: (cell: string) => `Shot at ${cell} awaits its encrypted result.`,
  finalizeShot: 'Finalize Shot',
  preparingCofhe: 'Preparing CoFHE',
  fetchingProof: 'Fetching the CoFHE result',
  forfeit: 'Forfeit',
  forfeitTitle: 'Forfeit Match',
  forfeitBody: 'Abandon ship? The match counts as an on-chain defeat.',
  forfeitConfirm: 'Forfeit',
  forfeitCancel: 'Cancel',
  claimTimeoutWin: 'Claim Timeout Win',
  timeoutAvailable: 'The opponent missed their turn deadline. You can claim the win.',
  historyTitle: 'Move history',
  historyEmpty: 'No shots fired yet.',
  historyYou: 'You',
  historyOpponent: 'Opponent',
  historyResults: {
    None: 'Resolving…',
    Miss: 'Miss',
    Hit: 'Hit',
    Sunk: 'Sunk',
    Win: 'Win',
  },
  spectatorBattleBody: 'This battle is between other players.',
} as const

/** Contract-derived terminal summary (GAME-709/710/711). */
export const summaryCopy = {
  victoryTitle: 'Victory',
  defeatTitle: 'Defeat',
  completeTitle: 'Match Finished',
  wonBody: 'You sank the enemy fleet.',
  lostBody: 'Your fleet was destroyed.',
  forfeitWonBody: 'Your opponent forfeited or timed out. The win is yours.',
  forfeitLostBody: 'The match ended by forfeit or timeout.',
  spectatorBody: 'This match has finished.',
  cancelledTitle: 'Match Cancelled',
  winnerLabel: 'Winner',
  movesLabel: 'Moves',
  rematch: 'Rematch',
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
  // GAME-802: shown while re-attaching to a broadcast write after a resume.
  resuming: 'Resuming a pending transaction from your last session.',
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
