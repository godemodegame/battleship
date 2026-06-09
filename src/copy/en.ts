// Centralized English UI copy. The whole game is English-only by design
// (see docs/copy-deck.md and docs/project-description.md).
export const EN = {
  appTitle: "ON-CHAIN BATTLESHIP",
  appTagline: "Encrypted tactical warfare on the holographic sea.",

  // Entry / menu
  enterBattle: "Enter Battle",
  howItWorks: "How It Works",
  settings: "Settings",
  play: "Play",
  chooseOpponent: "Choose Opponent",
  practiceVsBot: "Practice vs Bot",
  playAgainstFriend: "Play Against Friend",
  openMatch: "Open Match",
  comingSoon: "Coming Soon",
  needsOnchain: "Needs on-chain match — not in this build",

  // Difficulty
  botDifficulty: "Bot Difficulty",
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",

  // Loading
  loadingBattlefield: "Loading Battlefield",
  loadingModels: "Loading Models",
  preparingBoard: "Preparing Board",
  retry: "Retry",
  loadFailed: "Some battlefield models failed to load.",

  // Placement
  placeYourFleet: "Place Your Fleet",
  autoPlace: "Auto Place",
  shuffle: "Shuffle",
  rotate: "Rotate",
  reset: "Reset",
  confirmFleet: "Confirm Fleet",
  tapToPlace: "Tap a cell to drop the selected ship",
  fleetReady: "Fleet ready — lock it in",
  fleetInvalid: "Fleet placement invalid",
  encryptingFleet: "Encrypting fleet…",

  // Battle HUD
  target: "Target",
  fleet: "Fleet",
  fire: "Fire",
  cancelTarget: "Cancel Target",
  viewFleet: "View Fleet",
  moveHistory: "Move History",
  forfeit: "Forfeit",
  yourTurn: "Your Turn",
  opponentTurn: "Opponent Turn",
  resolvingShot: "Resolving Shot",
  advanceOpponentTurn: "Advance Opponent Turn",
  opponentThinking: "Opponent thinking…",
  gameOver: "Game Over",
  selectTarget: "Select a target cell",
  fireAt: (c: string) => `Fire at ${c}`,

  // Results
  miss: "Miss",
  hit: "Hit",
  sunk: "Sunk",
  victory: "Victory",
  defeat: "Defeat",
  youSankTheir: (s: string) => `You sank their ${s}`,
  theySankYour: (s: string) => `They sank your ${s}`,
  playAgain: "Play Again",
  backToMenu: "Back to Menu",
  viewMatch: "View Match",

  // Stats
  turns: "Turns",
  hits: "Hits",
  misses: "Misses",
  accuracy: "Accuracy",
  shipsLeft: "Ships Left",

  // Errors / status
  cellAlreadyAttacked: "Cell already attacked",
  notYourTurn: "Not your turn",
  shotResolutionPending: "Shot resolution pending",
} as const;
