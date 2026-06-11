# Security and Fair Play

## Purpose

This document defines the security and fair play model for the mobile-first 3D fully on-chain Battleship game.

The game has hidden information, wallet transactions, encrypted state, and turn-based PvP. The security model must protect hidden fleets, prevent unfair moves, and keep the smart contract as the source of truth.

## Security Goals

The MVP must protect:

- hidden fleet placement;
- encrypted board state;
- valid turn order;
- only one unresolved attack at a time;
- turn retention after a hit or sunk ship and turn passing after a miss;
- repeated attack prevention;
- placement validity;
- public result integrity;
- match lifecycle integrity;
- wallet and network correctness;
- recovery from pending Fhenix operations.

The MVP must ensure:

- only the invited friend can join a strict friend match;
- both players submit encrypted fleets;
- both fleets are validated before play starts;
- the invited friend takes the first turn;
- every move is a blockchain transaction;
- hit, miss, sunk, and win results are finalized through the contract and Fhenix flow;
- the frontend cannot become the referee.

## Non-goals

The MVP security model does not need to solve:

- ranked matchmaking integrity;
- tournaments;
- wagers;
- NFT ownership;
- marketplace fraud;
- social graph abuse;
- chat moderation;
- native app store security review;
- full mainnet production incident response.

These can be added after the friend-match MVP is stable.

## Source of Truth

The smart contract is the source of truth for:

- match existence;
- player addresses;
- invited opponent;
- match status;
- placement status;
- valid turn order;
- public attack coordinates;
- public move history;
- pending shot state;
- final shot result;
- winner;
- timeout outcomes.

Fhenix/CoFHE is the privacy and encrypted computation layer for:

- encrypted fleet inputs;
- encrypted fleet validation;
- encrypted hit detection;
- encrypted sunk checks;
- encrypted win checks;
- signed decrypt results when a public value must be finalized on-chain.

The frontend is responsible for:

- collecting input;
- rendering state;
- encrypting player data through the SDK;
- submitting transactions;
- showing pending states;
- recovering after refresh or wallet switching.

The frontend must not decide game outcomes.

## Protected Assets

High-value protected assets:

- plaintext fleet layout before encryption;
- encrypted fleet ciphertext handles;
- encrypted hit detection intermediates;
- encrypted ship health counters;
- Fhenix permits;
- decrypt result signatures;
- player wallet approvals and signatures;
- pending shot ciphertext hash;
- match state before finality.

Public information:

- match id;
- player addresses;
- invited opponent address;
- attack cell indexes;
- finalized move results;
- move count;
- match status;
- winner;
- timestamps and deadlines.

Public attacks are acceptable because Battleship normally reveals the attacked coordinate. Hidden ship placement must remain private.

## Plaintext Fleet Lifecycle

Plaintext fleet data may exist only in temporary frontend memory before encryption.

Allowed:

- local React or Zustand placement state before `submitFleet`;
- transient values passed into the Fhenix SDK encryption call;
- local validation for UX only.

Forbidden:

- local storage;
- indexedDB;
- cookies;
- analytics;
- server logs;
- URL parameters;
- invite links;
- event names or payloads;
- screenshots used for debugging;
- persisted crash reports;
- contract calldata as plaintext.

After encrypted fleet submission succeeds, the frontend must clear plaintext fleet state.

The app must also clear plaintext fleet state when:

- wallet account changes;
- wallet disconnects;
- chain changes away from Arbitrum Sepolia;
- match id changes;
- the player leaves the placement screen before submission;
- placement is reset.

## Fhenix Access Policy

Hidden fleet cells:

- contract access: yes, through `FHE.allowThis`;
- owning player access: only if the implementation truly needs it;
- opponent access: never;
- public access: never.

Placement validity result:

- public reveal allowed;
- reveal only final valid or invalid value;
- do not reveal intermediate validation data.

Shot result:

- public reveal allowed;
- reveal only `Miss`, `Hit`, `Sunk`, or `Win`;
- do not reveal raw board cells, ship ids, or encrypted health counters.

Permits:

- use for `decryptForView` only when needed;
- never grant broad access to opponent hidden data;
- scope permits to the connected wallet and chain;
- treat permit rejection as a recoverable user action.

## Smart Contract Controls

The contract must enforce:

- `createMatch` cannot invite `address(0)`;
- `createMatch` cannot invite the creator;
- `joinMatch` only accepts the invited opponent for strict friend matches;
- only match players can submit fleets;
- no plaintext fleet submission exists;
- no second fleet submission while validation is pending;
- both fleets must be valid before match start;
- `currentTurn` controls who can attack;
- `cellIndex < 100`;
- the same attacker cannot attack the same defender cell twice;
- no new attack is allowed while `status == ResolvingShot`;
- shot finalization must verify the expected ciphertext hash;
- decrypt signatures must be valid;
- `ShotResult.None` cannot be finalized as a real result;
- `Win` sets the winner and finishes the match;
- timeout claims respect the current lifecycle phase.

The contract should prefer custom errors for clear failure cases.

## Match Invite Risks

Strict friend invite risk:

- creator enters the wrong wallet address.

Controls:

- frontend validates address format;
- UI shows the invited address before creation;
- creator confirms `Create Match`;
- contract enforces `msg.sender == invitedOpponent` on join.

Link-only invite risk:

- anyone with the link can claim the opponent slot.

MVP decision:

- strict friend invite is the default;
- link-only invite is out of MVP unless explicitly added later.

Invite links must not contain private data.

Allowed invite link data:

- public match id.

Forbidden invite link data:

- fleet layout;
- encrypted fleet payload;
- permit;
- signature;
- wallet private data;
- hidden board metadata.

## Fleet Validation Abuse

Possible abuses:

- submit an invalid fleet;
- submit malformed encrypted input;
- try to resubmit while validation is pending;
- try to start a match before both fleets are valid;
- try to learn private placement from validation timing.

Controls (implemented in Phase 4):

- the fixed `InEuint8[20]` ABI and CoFHE input verification enforce input
  shape;
- store placement status per player;
- use `ResolvingValidation` to prevent duplicate validation;
- finalize only the public validity boolean;
- allow resubmission after an invalid result, with a fresh validity handle
  so stale decrypt results cannot finalize the new submission;
- avoid exposing intermediate validation values;
- avoid detailed validation errors that reveal private layout.

Player-facing copy should say `Fleet placement invalid`, not reveal exact hidden validation internals.

On-chain validation scope (decided by measurement, see
`docs/cofhe-feasibility-results.md`):

- enforced encrypted: every segment in board range, every multi-cell ship
  straight and contiguous, horizontal ships inside one row. Straightness
  (consecutive deltas of exactly 1 or 10) also forces distinct cells within
  a ship, which excludes the one dangerous shape abuse: a ship folded onto
  fewer cells than its health, which could never be sunk;
- not enforced on-chain: cross-ship overlap and the classic no-touch rule.
  Both only harm the player who breaks them. The win condition is
  all-ships-dead, and per-ship health decrements on every hit to one of the
  ship's own cells, so stacking or touching ships concentrates the fleet
  into fewer distinct cells and strictly speeds up the owner's defeat - it
  grants no defensive or informational advantage. The client still enforces
  classic placement for UX, and a rule-breaking opponent cannot win by
  breaking these rules.

## Attack Abuse

Possible abuses:

- attack out of turn;
- attack an invalid cell;
- attack the same cell twice;
- attack while a previous shot is pending;
- try to finalize a forged shot result;
- try to finalize a shot for another move;
- try to continue after a win.

Controls (implemented in Phase 4):

- check `status == InProgress`;
- check `msg.sender == currentTurn`;
- check `cellIndex < 100`;
- track attacked cells on the defender's public board;
- set `status = ResolvingShot` after attack;
- store the pending move id and both result ciphertext handles;
- finalization takes no result data from the caller: it reads the decrypt
  results the CoFHE network posted on-chain for exactly the stored handles,
  so a forged hash, value, or signature has no entry point;
- reject stale move ids during finalization (`InvalidMoveId`);
- duplicate finalization structurally reverts: clearing the pending shot
  leaves `ResolvingShot`, so a replayed call fails the status check;
- reject result values outside `1..4` (fail-closed guard);
- set `Finished` immediately on `Win`.

The UI may disable unavailable actions, but the contract must enforce every rule.

## Pending Fhenix Griefing

Fhenix operations can be asynchronous. A player may try to stall the game by leaving a fleet validation or shot result unresolved.

Controls (implemented in Phase 4):

- `finalizeFleetValidation` and `finalizeAttack` are permissionless: any
  wallet can trigger them once the network posts the decrypt result, and
  the caller cannot influence the outcome;
- `retryFleetValidation` and `retryShotResolution` are permissionless and
  idempotent re-requests for decryptions that never land; a stuck
  resolution is never a win or loss for either player, and `forfeit`
  remains the guaranteed exit;
- provide timeout windows for placement and turns;
- expose `getPendingShot(matchId)` for recovery after refresh;
- show clear UI states for pending Fhenix work.

Recommended pending states:

- `Validating Fleet`;
- `Resolving Shot`;
- `Publishing Result`;
- `Recovering Match State`.

The contract should avoid states where only the losing player can unblock progress.

## Timeout Model

Timeouts protect against inactive players.

Recommended MVP timeouts:

- join timeout;
- placement timeout;
- turn timeout;
- pending shot timeout if the implementation can define a safe resolution path.

Timeout claims should:

- be permissionless or callable by the affected opponent;
- update match status on-chain;
- emit an event;
- never reveal hidden fleet data;
- avoid rewarding the player who caused the stall.

Timeout copy must be direct:

- `Opponent timed out`;
- `You timed out`;
- `Claim Timeout Win`;
- `Match expired`.

## Replay and Ordering Risks

Risks:

- replay an old decrypt result;
- finalize a result for the wrong match;
- finalize a result for the wrong move;
- process old events after a page refresh;
- show stale UI after a chain reorg or provider lag.

Controls:

- bind decrypt results to stored ciphertext hashes;
- include match id and move id in pending state;
- clear pending state after finalization;
- reject already finalized moves;
- refetch contract reads after events;
- treat events as triggers, not source of truth;
- on page focus, refetch the active match;
- wait for transaction receipts before advancing local state.

## Frontend Trust Boundaries

The frontend can improve UX but cannot be trusted for rules.

Trusted only for:

- local rendering;
- button states;
- temporary placement editing;
- wallet connection UI;
- transaction flow UI.

Not trusted for:

- fleet validity;
- turn order;
- attack legality;
- hit detection;
- sunk detection;
- win detection;
- timeout outcomes;
- opponent identity.

Every important frontend check must have a matching contract check.

## Indexer Trust Boundaries

An indexer may be useful later for history and faster reads.

Allowed indexer use:

- cache public events;
- display match history;
- speed up non-critical reads;
- help find open matches if that mode exists later.

Forbidden indexer use:

- decide turns;
- decide shot results;
- decide winners;
- reveal hidden fleet state;
- replace contract reads for final authority;
- authorize joins or moves.

If an indexer disagrees with direct contract reads, the frontend must trust the contract.

## Wallet and Mobile Risks

Risks:

- player connects the wrong wallet;
- player is on the wrong network;
- wallet modal closes during encryption;
- mobile browser loses page state while switching to wallet app;
- player rejects a transaction;
- player signs a permit without understanding why.

Controls:

- show wallet short address at all important steps;
- require Arbitrum Sepolia before match transactions;
- recover match phase after page focus;
- treat rejected signatures and transactions as normal recoverable states;
- show concise permit copy;
- never ask for broad approvals unrelated to gameplay.

## Bot Mode Risks

Backendless bot mode is optional and not the MVP priority.

If bot mode is added later:

- bot moves must be generated or executed through contract logic;
- `executeBotMove(matchId)` should be permissionless;
- the caller must not choose the bot target;
- bot strategy should not require a backend;
- bot mode should be clearly marked as practice;
- bot randomness or deterministic targeting must be documented before implementation.

Bot mode must not weaken PvP privacy rules.

## Information Leakage Rules

Avoid leaking hidden state through:

- detailed placement errors;
- validation timing differences;
- overly specific animations before result finalization;
- debug logs;
- analytics events;
- local persistence;
- developer screenshots;
- public error strings;
- Fhenix permits with broad access.

Public information should remain intentionally public:

- attacked cell;
- finalized result;
- move order;
- winner;
- match status.

## Emergency Controls

The MVP may include minimal emergency controls if contract complexity justifies them.

Possible controls:

- pause new match creation;
- pause new attacks;
- keep read functions active;
- allow users to forfeit or resolve already-started matches if safe.

Emergency controls must be documented in the contract implementation and should not allow the owner to reveal hidden fleets or change match winners.

## MVP Security Checklist

Before implementation is considered ready:

- no plaintext fleet contract function exists;
- hidden encrypted values never use `FHE.allowPublic`;
- strict friend join is enforced on-chain;
- both fleets require encrypted validation;
- `ResolvingShot` blocks additional attacks;
- repeated attack checks exist;
- decrypt result signature checks exist;
- ciphertext hash checks exist;
- stale finalization is rejected;
- timeout rules are implemented or intentionally deferred;
- frontend clears plaintext placement after submission;
- frontend does not persist hidden fleet data;
- events trigger contract refetches;
- all player-facing security states use English copy.

## Related Documents

- `docs/project-description.md`
- `docs/game-mechanics.md`
- `docs/smart-contract-design.md`
- `docs/fhenix-integration-plan.md`
- `docs/contract-data-model.md`
- `docs/contract-api.md`
- `docs/frontend-architecture.md`
- `docs/user-flows.md`
