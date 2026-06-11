# Copy Deck

## Purpose

This document centralizes player-facing English copy for the mobile-first 3D fully on-chain Battleship game.

Implementation should treat this document as the starting source for UI labels, status messages, errors, confirmation sheets, onboarding text, and accessibility labels.

The playable repository now includes practice, wallet, network, friend-match,
encrypted placement, battle, recovery, and terminal copy. Runtime strings live
in `src/copy/`; `docs/copy-implementation-sync.md` records intentional
differences from this broader product deck.

## Copy Rules

All player-facing text must be English.

Rules:

- keep text short;
- prefer direct action verbs;
- avoid blockchain jargon when a simpler phrase works;
- mention wallet, network, transaction, or Fhenix only when the player needs to act;
- do not expose raw Solidity errors in normal UI;
- do not reveal hidden fleet details through error messages;
- use the same phrase for the same state everywhere.

## Product Name Placeholder

Until the final name is chosen, use:

- `Encrypted Battleship`

This can be replaced later across the copy deck.

## Global Navigation

Primary navigation:

- `Play`
- `Create Match`
- `Join Match`
- `Match History`
- `Settings`
- `Back`
- `Close`
- `Cancel`
- `Confirm`
- `Continue`
- `Retry`
- `Done`

## Onboarding

Onboarding title:

- `Encrypted Battleship`

Onboarding slides:

- `Hide your fleet with Fhenix`
- `Every move is a transaction`
- `Outplay your friend on-chain`

Onboarding actions:

- `Connect Wallet`
- `Skip`
- `How It Works`

Short explainer lines:

- `Place your fleet in secret.`
- `Attack by sending on-chain moves.`
- `Only final results are revealed.`

Onboarding behavior:

- show onboarding only when no wallet is connected;
- skip onboarding when a wallet is already connected;
- end onboarding with `Connect Wallet`.

## Wallet Copy

Wallet buttons:

- `Connect Wallet`
- `Disconnect Wallet`
- `Switch Network`
- `Switch to Arbitrum Sepolia`
- `Open Wallet`
- `Try Again`

Wallet states:

- `Connecting Wallet`
- `Wallet Connected`
- `Wallet Not Connected`
- `Wrong Network`
- `Waiting for Wallet`
- `Connection Rejected`
- `Wallet Changed`

Wallet helper copy:

- `Connect a wallet to play.`
- `This game runs on Arbitrum Sepolia.`
- `Switch networks before starting a match.`
- `Confirm the action in your wallet.`

## Loading Copy

Gameplay field loading:

- `Loading Battlefield`
- `Loading Models`
- `Preparing Board`
- `Entering Match`
- `Loading Failed`
- `Retry Loading`

Loading helper copy:

- `Preparing the tactical field.`
- `Loading required models.`
- `The field will appear when all models are ready.`
- `Required models failed to load. Try again.`

## Network Copy

Network labels:

- `Arbitrum Sepolia`
- `Wrong Network`
- `Network Ready`
- `Network Error`

Network messages:

- `Switch to Arbitrum Sepolia to continue.`
- `The connected wallet is on the wrong network.`
- `Network changed. Match state was refreshed.`

## Main Menu

Menu title:

- `Command Deck`

Menu actions:

- `Play`
- `Create Match`
- `Join Match`
- `Match History`
- `Settings`

Status labels:

- `Ready`
- `Wallet Connected`
- `Wrong Network`
- `Pending Transaction`

## Opponent Selection

Screen title:

- `Choose Opponent`

Options:

- `Play Against Friend`
- `Join Friend Match`
- `Open Match`
- `Practice`
- `Coming Soon`

Descriptions:

- `Invite a specific wallet.`
- `Open a match link from a friend.`
- `Create a public match later.`
- `Practice mode is not part of the MVP.`

## Friend Match Creation

Screen title:

- `Invite Friend`

Field labels:

- `Friend Wallet Address`
- `Match Link`
- `Match ID`

Buttons:

- `Paste Address`
- `Create Match`
- `Copy Invite Link`
- `Share Invite`
- `Cancel Match`

Statuses:

- `Creating Match`
- `Match Created`
- `Waiting for Friend`
- `Friend Joined`
- `Match Cancelled`

Helper copy:

- `Only this wallet can join the match.`
- `Share this link after your match is created.`
- `Your friend will place their fleet before battle starts.`

Validation messages:

- `Enter a wallet address.`
- `Invalid address.`
- `You cannot invite yourself.`

## Join Match

Screen title:

- `Join Match`

Field labels:

- `Match ID`
- `Invite Link`

Buttons:

- `Paste Link`
- `Check Match`
- `Join Match`
- `Back`

Statuses:

- `Checking Match`
- `Match Found`
- `Joining Match`
- `Joined Match`
- `Match Unavailable`

Messages:

- `This invite is for another wallet.`
- `This match has already started.`
- `This match was cancelled.`
- `This match was not found.`

## Match Lobby

Screen title:

- `Match Lobby`

Labels:

- `Match ID`
- `Your Wallet`
- `Opponent`
- `Network`
- `Fleet Status`
- `Opponent Status`

Statuses:

- `Waiting for Opponent`
- `Place your fleet`
- `Waiting for Fleet`
- `Validating Fleet`
- `Fleet Confirmed`
- `Fleet Invalid`
- `Ready`
- `Starting Match`

Buttons:

- `Auto Place`
- `Confirm Fleet`
- `Reset Fleet`
- `Start Match`
- `Back to Menu`
- `Forfeit`

## Fleet Placement

Screen title:

- `Place Your Fleet`

Ship labels:

- `Carrier`
- `Battleship`
- `Cruiser`
- `Destroyer`
- `Submarine`
- `Patrol Boat`

Controls:

- `Rotate`
- `Auto Place`
- `Reset`
- `Confirm Fleet`
- `Lock Fleet`

Statuses:

- `Placement Ready`
- `Invalid Placement`
- `Encrypting Fleet`
- `Confirm in Wallet`
- `Submitting Fleet`
- `Validating Fleet`
- `Fleet Confirmed`
- `Fleet Invalid`

Messages:

- `Place every ship before confirming.`
- `Ships cannot overlap.`
- `Ships must stay inside the board.`
- `Your fleet will be encrypted before submission.`
- `Plaintext fleet data is cleared after submission.`

## Battle HUD

Turn labels:

- `Your Turn`
- `Opponent Turn`
- `Resolving Shot`
- `Game Over`

Board tabs:

- `Target`
- `Fleet`

Battle buttons:

- `Fire`
- `Cancel Target`
- `View Fleet`
- `Move History`
- `Forfeit`

Selection labels:

- `Select Target`
- `Target Selected`
- `No Target Selected`

Result labels:

- `Miss`
- `Hit`
- `Sunk`
- `Victory`
- `Defeat`

Messages:

- `Choose a cell to attack.`
- `Waiting for opponent move.`
- `Shot submitted.`
- `Result is resolving.`
- `The match is finished.`

## Confirmation Sheets

Confirm fleet:

- title: `Confirm Fleet`
- body: `Your fleet will be encrypted and submitted on-chain.`
- confirm: `Confirm`
- cancel: `Cancel`

Create match:

- title: `Create Match`
- body: `Create a friend match for the selected wallet.`
- confirm: `Create`
- cancel: `Cancel`

Join match:

- title: `Join Match`
- body: `Join this match with your connected wallet.`
- confirm: `Join`
- cancel: `Cancel`

Fire:

- title pattern: `Fire at {coordinate}`
- body: `This attack will be submitted on-chain.`
- confirm: `Fire`
- cancel: `Cancel`

Forfeit:

- title: `Forfeit Match`
- body: `You will lose this match.`
- confirm: `Forfeit`
- cancel: `Cancel`

Cancel match:

- title: `Cancel Match`
- body: `This match will be cancelled.`
- confirm: `Cancel Match`
- cancel: `Back`

## Transaction States

Transaction statuses:

- `Confirm in Wallet`
- `Transaction Pending`
- `Transaction Submitted`
- `Transaction Confirmed`
- `Transaction Failed`
- `Transaction Rejected`
- `Resolving On-chain`

Transaction helper copy:

- `Open your wallet to continue.`
- `Waiting for confirmation.`
- `Your transaction was submitted.`
- `The blockchain confirmed your action.`
- `The transaction failed. Try again.`
- `You rejected the transaction.`

## Fhenix States

Fhenix statuses:

- `Fhenix Ready`
- `Fhenix Connection Failed`
- `Preparing Secure Access`
- `Sign Permit`
- `Permit Ready`
- `Permit Rejected`
- `Encrypting Fleet`
- `Validating Fleet`
- `Resolving Shot`
- `Publishing Result`
- `Recovering Match State`

Fhenix helper copy:

- `Preparing encrypted gameplay.`
- `Encrypting your fleet locally.`
- `Waiting for encrypted validation.`
- `Waiting for the public shot result.`
- `Recovering the latest on-chain state.`
- `Secure access was rejected. Try again.`

## Errors

Wallet and network errors:

- `Wallet not connected.`
- `Wrong network.`
- `Connection rejected.`
- `Switch to Arbitrum Sepolia.`

Match errors:

- `Match not found.`
- `Match unavailable.`
- `Match already started.`
- `Match already finished.`
- `This invite is for another wallet.`
- `Only the invited player can join.`

Fleet errors:

- `Fleet placement invalid.`
- `Fleet already submitted.`
- `Fleet validation pending.`
- `Encrypted fleet input failed.`

Battle errors:

- `Not your turn.`
- `Cell already attacked.`
- `Select a target first.`
- `Shot resolution pending.`
- `Invalid target cell.`

Fhenix errors:

- `Fhenix encryption failed.`
- `Fhenix connection failed.`
- `Permit rejected.`
- `Result finalization failed.`

Transaction errors:

- `Transaction rejected.`
- `Transaction failed.`
- `Transaction reverted.`
- `Try again.`

## Game Over

Victory title:

- `Victory`

Defeat title:

- `Defeat`

Result stats:

- `Turns`
- `Hits`
- `Misses`
- `Accuracy`
- `Ships Sunk`

Buttons:

- `View Match`
- `Play Again`
- `Back to Menu`

Messages:

- `You won the match.`
- `Your fleet was destroyed.`
- `Final move confirmed on-chain.`

## Match History

Screen title:

- `Match History`

Empty state:

- `No matches yet.`
- `Start a friend match to see it here.`

Labels:

- `Won`
- `Lost`
- `Cancelled`
- `Forfeited`
- `In Progress`
- `Waiting`

Buttons:

- `Open Match`
- `View Match`

## Settings

Screen title:

- `Settings`

Sections:

- `Graphics`
- `Sound`
- `Wallet`
- `Network`
- `Accessibility`

Graphics options:

- `Low`
- `Medium`
- `High`

Toggles:

- `Sound Effects`
- `Haptics`
- `Reduced Motion`
- `High Contrast`

Buttons:

- `Disconnect Wallet`
- `Back`

## Accessibility Labels

Required labels:

- `Open settings`
- `Close dialog`
- `Copy invite link`
- `Share invite link`
- `Rotate selected ship`
- `Auto place fleet`
- `Reset fleet placement`
- `Confirm fleet placement`
- `Select target board`
- `Select fleet board`
- `Fire at selected cell`
- `Cancel selected target`
- `Open move history`
- `Forfeit match`

## Toast Messages

Success toasts:

- `Invite link copied.`
- `Match created.`
- `Fleet submitted.`
- `Shot submitted.`
- `Result published.`
- `Match state refreshed.`

Failure toasts:

- `Copy failed.`
- `Share failed.`
- `Transaction failed.`
- `Could not refresh match.`
- `Try again.`

## Developer Notes

Implementation should:

- store copy in a single English copy module;
- avoid hardcoded UI strings inside components;
- map contract custom errors to copy deck messages;
- keep developer diagnostics separate from player-facing copy;
- add every new player-facing string to this document or its implementation equivalent.

## Related Documents

- `docs/interface-and-buttons-guide.md`
- `docs/frontend-architecture.md`
- `docs/user-flows.md`
- `docs/security-and-fair-play.md`
