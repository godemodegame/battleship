# Contract API Specification

## Purpose

This document defines the proposed smart contract API for the mobile-first 3D fully on-chain Battleship game.

It builds on:

- `docs/smart-contract-design.md`;
- `docs/fhenix-integration-plan.md`;
- `docs/technical-architecture.md`;
- `docs/contract-data-model.md`;
- `docs/user-flows.md`.

This is a near-ABI-level specification. It should guide both Solidity implementation and frontend integration.

## Scope

The MVP API focuses on:

- private friend matches;
- encrypted fleet submission;
- Fhenix-based placement validation;
- invited friend starts first;
- turn-based attacks;
- Fhenix-based shot result finalization;
- cancel, forfeit, and timeout hooks;
- public read models for the mobile UI.

Out of scope for the MVP API:

- ranking;
- wagers;
- NFT ships;
- marketplace;
- tournaments;
- chat;
- native mobile app APIs.

## Contract Name

Recommended MVP contract:

```solidity
contract BattleshipGame
```

The first implementation should keep one main contract unless complexity forces a split.

## Solidity Version and Imports

Recommended:

```solidity
pragma solidity ^0.8.24;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
```

Exact Solidity version can be adjusted to match the Fhenix/CoFHE package requirements.

## Shared Data Types

The API should use the data model from `docs/contract-data-model.md`.

Required enums:

```solidity
enum MatchType {
  Friend,
  Open,
  Bot
}

enum MatchStatus {
  None,
  WaitingForOpponent,
  WaitingForPlacement,
  ValidatingPlacement,
  ReadyToStart,
  InProgress,
  ResolvingShot,
  Finished,
  Cancelled,
  Forfeited
}

enum PlacementStatus {
  None,
  NotSubmitted,
  Submitted,
  ResolvingValidation,
  Valid,
  Invalid
}

enum ShotResult {
  None,
  Miss,
  Hit,
  Sunk,
  Win
}
```

Shot result encoding:

- `0` = `None`;
- `1` = `Miss`;
- `2` = `Hit`;
- `3` = `Sunk`;
- `4` = `Win`.

Finalized shot results must never be `None`.

## Input Structs

## EncryptedFleetInput

MVP baseline:

```solidity
struct EncryptedFleetInput {
  InEuint8[100] cells;
}
```

The final implementation may replace this with batched input if the single-call payload is too expensive.

Potential batch input:

```solidity
struct EncryptedFleetBatchInput {
  uint8 startIndex;
  InEuint8[] cells;
}
```

Do not support plaintext fleet submission.

## DecryptResult

Recommended shared struct for Fhenix finalization:

```solidity
struct DecryptResult {
  bytes32 ctHash;
  uint256 value;
  bytes signature;
}
```

Use `uint256 value` at the API boundary for flexibility, then validate and cast internally:

- placement validity expects `0` or `1`;
- shot result expects `1..4`.

If Fhenix typed verification requires a narrower plaintext type, the implementation can expose typed structs:

```solidity
struct BoolDecryptResult {
  bytes32 ctHash;
  bool value;
  bytes signature;
}

struct Uint8DecryptResult {
  bytes32 ctHash;
  uint8 value;
  bytes signature;
}
```

MVP recommendation:

- use typed structs if they make verification safer;
- keep the frontend shape equivalent to `ctHash`, `value`, and `signature`.

## Read Structs

## MatchView

```solidity
struct MatchView {
  uint256 id;
  MatchType matchType;
  MatchStatus status;
  address creator;
  address opponent;
  address invitedOpponent;
  address currentTurn;
  address winner;
  uint64 createdAt;
  uint64 joinedAt;
  uint64 startedAt;
  uint64 finishedAt;
  uint64 lastActionAt;
  uint32 moveCount;
  uint32 pendingMoveId;
}
```

## PlayerPublicView

```solidity
struct PlayerPublicView {
  address player;
  bool joined;
  PlacementStatus placementStatus;
  bool fleetSubmitted;
  bool fleetValid;
  PublicBoard publicBoard;
}
```

## MoveView

```solidity
struct MoveView {
  uint32 moveId;
  address attacker;
  address defender;
  uint8 cellIndex;
  ShotResult result;
  uint64 submittedAt;
  uint64 resolvedAt;
  bool finalized;
}
```

## PendingShotView

```solidity
struct PendingShotView {
  bool exists;
  uint32 moveId;
  address attacker;
  address defender;
  uint8 cellIndex;
  bytes32 resultCtHash;
  uint64 submittedAt;
}
```

Encrypted fleet internals must not be returned from ordinary public reads.

## Function Groups

The API is grouped by lifecycle phase:

1. Match creation.
2. Opponent joining.
3. Fleet submission and validation.
4. Match start.
5. Attack and result finalization.
6. Cancellation, forfeit, and timeout.
7. Read functions.
8. Optional bot functions.

## Match Creation API

## createMatch

```solidity
function createMatch(address invitedOpponent) external returns (uint256 matchId);
```

Purpose:

- create a strict friend match.

Requirements:

- `invitedOpponent != address(0)`;
- `invitedOpponent != msg.sender`;
- caller is the creator;
- contract is not paused if pause support exists.

State changes:

- create `Match`;
- set `matchType = MatchType.Friend`;
- set `status = WaitingForOpponent`;
- set `creator = msg.sender`;
- set `invitedOpponent`;
- initialize creator player state;
- set `createdAt`;
- set join deadline;
- add match id to creator history.

Events:

```solidity
event MatchCreated(
  uint256 indexed matchId,
  address indexed creator,
  address indexed invitedOpponent
);
```

Frontend behavior:

- show `Creating Match`;
- after transaction confirmation, read `getMatch(matchId)`;
- route creator to fleet placement;
- generate invite link from `matchId`.

Errors:

- `InvalidInvitedOpponent`;
- `SelfInviteNotAllowed`;
- `ContractPaused`.

## Open Match API

Open matches are not required for MVP.

If added later:

```solidity
function createOpenMatch() external returns (uint256 matchId);
```

Do not overload `createMatch(address(0))` unless the UX explicitly supports open matches.

## Opponent Join API

## joinMatch

```solidity
function joinMatch(uint256 matchId) external;
```

Purpose:

- let the invited friend join the match.

Requirements:

- match exists;
- `status == WaitingForOpponent`;
- `msg.sender == invitedOpponent`;
- `msg.sender != creator`;
- opponent slot is empty;
- join deadline has not expired.

State changes:

- set `opponent = msg.sender`;
- initialize opponent player state;
- set `joinedAt`;
- set `status = WaitingForPlacement`;
- set placement deadline;
- add match id to opponent history.

Events:

```solidity
event MatchJoined(
  uint256 indexed matchId,
  address indexed opponent
);
```

Frontend behavior:

- verify wallet before transaction if possible;
- show `Joining Match`;
- after event, route friend to fleet placement.

Errors:

- `MatchNotFound`;
- `InvalidMatchStatus`;
- `NotInvitedOpponent`;
- `CreatorCannotJoinOwnMatch`;
- `OpponentAlreadyJoined`;
- `JoinDeadlineExpired`.

## Fleet API

## submitFleet

```solidity
function submitFleet(
  uint256 matchId,
  EncryptedFleetInput calldata input
) external;
```

Purpose:

- submit encrypted fleet placement for the caller.

Requirements:

- match exists;
- caller is creator or opponent;
- match status is `WaitingForPlacement` or `ValidatingPlacement`;
- caller joined the match;
- caller does not currently have a pending validation;
- fleet input length and shape are valid;
- encrypted inputs pass Fhenix input checks through `FHE.asEuint8`.

State changes:

- convert each `InEuint8` to `euint8`;
- store encrypted fleet;
- call `FHE.allowThis` for stored encrypted values;
- initialize encrypted fleet health;
- set `fleetSubmitted = true`;
- set `placementStatus = ResolvingValidation`;
- set `fleetSubmittedAt`;
- create pending placement validation result if validation is asynchronous.

Events:

```solidity
event FleetSubmitted(
  uint256 indexed matchId,
  address indexed player
);

event FleetValidationRequested(
  uint256 indexed matchId,
  address indexed player,
  bytes32 ctHash
);
```

Frontend behavior:

- encrypt fleet with `@cofhe/sdk`;
- submit transaction;
- show `Validating placement`;
- wait for `FleetValidated` before showing ready state.

Errors:

- `MatchNotFound`;
- `InvalidMatchStatus`;
- `NotMatchPlayer`;
- `PlayerNotJoined`;
- `FleetAlreadySubmitted`;
- `PlacementValidationPending`;
- `InvalidEncryptedInput`;
- `FleetInputInvalidLength`;

## finalizeFleetValidation

Recommended typed version:

```solidity
function finalizeFleetValidation(
  uint256 matchId,
  address player,
  bytes32 ctHash,
  bool valid,
  bytes calldata signature
) external;
```

Alternative generic version:

```solidity
function finalizeFleetValidation(
  uint256 matchId,
  address player,
  DecryptResult calldata result
) external;
```

Purpose:

- publish the allowed placement validity result.

Requirements:

- match exists;
- player is creator or opponent;
- player's placement status is `ResolvingValidation`;
- pending validation exists;
- `ctHash` matches stored pending validation hash;
- Fhenix decrypt signature is valid;
- validation has not already been finalized.

State changes:

- if `valid == true`, set `placementStatus = Valid` and `fleetValid = true`;
- if `valid == false`, set `placementStatus = Invalid` and `fleetValid = false`;
- clear pending validation;
- set `fleetValidatedAt`;
- if both players are valid, set `ReadyToStart` or start match immediately.

Events:

```solidity
event FleetValidated(
  uint256 indexed matchId,
  address indexed player,
  bool valid
);
```

Optional event if auto-starting:

```solidity
event MatchStarted(
  uint256 indexed matchId,
  address indexed firstPlayer
);
```

Frontend behavior:

- any caller can finalize if decrypt result is public and signature validates;
- show `Fleet confirmed` if valid;
- show `Fleet placement invalid` if invalid;
- if both fleets are valid, route both users into battle state.

Errors:

- `MatchNotFound`;
- `NotMatchPlayerAddress`;
- `NoPendingPlacementValidation`;
- `InvalidCtHash`;
- `InvalidDecryptSignature`;
- `PlacementAlreadyFinalized`;

## Match Start API

## startMatch

```solidity
function startMatch(uint256 matchId) external;
```

Purpose:

- start the match after both fleets are valid.

Recommendation:

- `finalizeFleetValidation` should call `_startMatchIfReady` internally;
- keep `startMatch` as a permissionless recovery function if auto-start did not run.

Requirements:

- match exists;
- both players joined;
- both placements are valid;
- status is `ReadyToStart` or `WaitingForPlacement` with both valid;
- no pending placement validation;
- match not already started.

State changes:

- set `status = InProgress`;
- set `startedAt`;
- set `currentTurn = opponent`;
- set `lastActionAt`;
- set turn deadline.

Events:

```solidity
event MatchStarted(
  uint256 indexed matchId,
  address indexed firstPlayer
);

event TurnChanged(
  uint256 indexed matchId,
  address indexed currentTurn
);
```

Frontend behavior:

- creator sees `Opponent Turn`;
- invited friend sees `Your Turn`;
- invited friend can submit first attack.

Errors:

- `MatchNotFound`;
- `InvalidMatchStatus`;
- `PlayersNotReady`;
- `FleetNotValid`;
- `PlacementValidationPending`;
- `MatchAlreadyStarted`;

## Attack API

## attack

```solidity
function attack(
  uint256 matchId,
  uint8 cellIndex
) external returns (uint32 moveId);
```

Purpose:

- submit a public attack coordinate and start encrypted result resolution.

Requirements:

- match exists;
- `status == InProgress`;
- `msg.sender == currentTurn`;
- `cellIndex < 100`;
- target cell has not already been attacked by this attacker against this defender;
- no pending shot exists;
- both fleets are valid.

State changes:

- determine defender;
- increment move count;
- create `Move` with `result = None`;
- set defender `publicBoard.attackedMask`;
- compute encrypted shot result through Fhenix operations;
- set pending shot with `resultCtHash`;
- set `status = ResolvingShot`;
- set `pendingMoveId`;
- set resolving deadline.

Events:

```solidity
event ShotSubmitted(
  uint256 indexed matchId,
  uint32 indexed moveId,
  address indexed attacker,
  address defender,
  uint8 cellIndex
);

event ShotResolutionRequested(
  uint256 indexed matchId,
  uint32 indexed moveId,
  bytes32 ctHash
);
```

Frontend behavior:

- show selected coordinate confirmation;
- after transaction, show `Resolving Shot`;
- request `decryptForTx(ctHash)` after reading event or pending shot view;
- do not allow next turn until `ShotResolved`.

Errors:

- `MatchNotFound`;
- `InvalidMatchStatus`;
- `NotYourTurn`;
- `InvalidCellIndex`;
- `CellAlreadyAttacked`;
- `PendingShotExists`;
- `FleetNotValid`;

## finalizeAttack

Recommended typed version:

```solidity
function finalizeAttack(
  uint256 matchId,
  uint32 moveId,
  bytes32 ctHash,
  uint8 result,
  bytes calldata signature
) external;
```

Alternative generic version:

```solidity
function finalizeAttack(
  uint256 matchId,
  uint32 moveId,
  DecryptResult calldata result
) external;
```

Purpose:

- verify the Fhenix decrypt result and publish the shot outcome.

Requirements:

- match exists;
- `status == ResolvingShot`;
- pending shot exists;
- `moveId == pendingShot.moveId`;
- `ctHash == pendingShot.resultCtHash`;
- `result` is one of `Miss`, `Hit`, `Sunk`, `Win`;
- Fhenix decrypt signature is valid;
- move is not already finalized.

State changes:

- update move result;
- update move `resolvedAt`;
- set move `finalized = true`;
- update defender public board masks;
- clear pending shot;
- clear `pendingMoveId`;
- if result is `Win`, set status `Finished` and winner;
- otherwise set status `InProgress` and current turn to defender;
- update `lastActionAt`;
- set next turn deadline if not finished.

Events:

```solidity
event ShotResolved(
  uint256 indexed matchId,
  uint32 indexed moveId,
  ShotResult result
);

event TurnChanged(
  uint256 indexed matchId,
  address indexed currentTurn
);

event MatchFinished(
  uint256 indexed matchId,
  address indexed winner,
  uint32 moveCount
);
```

Frontend behavior:

- any caller may finalize if the decrypt result is valid;
- show `Miss`, `Hit`, `Sunk`, `Victory`, or `Defeat`;
- if no win, update turn state.

Errors:

- `MatchNotFound`;
- `InvalidMatchStatus`;
- `NoPendingShot`;
- `InvalidMoveId`;
- `InvalidCtHash`;
- `InvalidShotResult`;
- `InvalidDecryptSignature`;
- `MoveAlreadyFinalized`;

## Cancel, Forfeit, and Timeout API

## cancelMatch

```solidity
function cancelMatch(uint256 matchId) external;
```

Purpose:

- let the creator cancel before the match starts.

Requirements:

- match exists;
- caller is creator;
- status is `WaitingForOpponent`, `WaitingForPlacement`, or `ValidatingPlacement`;
- match is not `InProgress`;
- match is not finished.

State changes:

- set `status = Cancelled`;
- set `finishedAt`;
- clear `currentTurn`.

Events:

```solidity
event MatchCancelled(
  uint256 indexed matchId
);
```

Errors:

- `MatchNotFound`;
- `OnlyCreator`;
- `CannotCancelStartedMatch`;
- `MatchAlreadyFinished`;

## forfeit

```solidity
function forfeit(uint256 matchId) external;
```

Purpose:

- let a player voluntarily lose an active or setup match.

Requirements:

- match exists;
- caller is creator or opponent;
- match is not finished, cancelled, or forfeited.

State changes:

- loser = caller;
- winner = other player;
- set status `Forfeited`;
- set `winner`;
- set `finishedAt`.

Events:

```solidity
event MatchForfeited(
  uint256 indexed matchId,
  address indexed loser,
  address indexed winner
);
```

Errors:

- `MatchNotFound`;
- `NotMatchPlayer`;
- `MatchAlreadyFinished`;

## claimTimeoutWin

```solidity
function claimTimeoutWin(uint256 matchId) external;
```

Purpose:

- allow a player to win if the opponent is inactive too long.

Requirements:

- match exists;
- caller is a match player;
- timeout condition is active;
- caller is the eligible claimant;
- match is not finished.

Timeout cases:

- opponent did not join before join deadline: creator may cancel rather than win;
- opponent did not submit fleet before placement deadline: submitted player can claim;
- current turn player did not move before turn deadline: other player can claim;
- resolving deadline expired: recovery rule must be defined before production.

State changes:

- set status `Forfeited` or `Finished`;
- set winner to claimant;
- set `finishedAt`.

Events:

```solidity
event TimeoutWinClaimed(
  uint256 indexed matchId,
  address indexed winner,
  uint8 reason
);
```

Errors:

- `MatchNotFound`;
- `NotMatchPlayer`;
- `NoTimeoutAvailable`;
- `NotTimeoutClaimant`;
- `MatchAlreadyFinished`;

## Read API

## getMatch

```solidity
function getMatch(uint256 matchId) external view returns (MatchView memory);
```

Purpose:

- read public match metadata.

Errors:

- `MatchNotFound`.

## getPlayers

```solidity
function getPlayers(
  uint256 matchId
) external view returns (
  PlayerPublicView memory creator,
  PlayerPublicView memory opponent
);
```

Purpose:

- read public player state without encrypted fleet internals.

Errors:

- `MatchNotFound`.

## getMove

```solidity
function getMove(
  uint256 matchId,
  uint32 moveId
) external view returns (MoveView memory);
```

Purpose:

- read a single public move.

Errors:

- `MatchNotFound`;
- `MoveNotFound`.

## getMoveHistory

```solidity
function getMoveHistory(
  uint256 matchId,
  uint32 offset,
  uint32 limit
) external view returns (MoveView[] memory moves);
```

Purpose:

- read paginated move history.

Requirements:

- `limit` should be capped to avoid excessive return size.

Errors:

- `MatchNotFound`;
- `InvalidPaginationLimit`.

## getPendingShot

```solidity
function getPendingShot(
  uint256 matchId
) external view returns (PendingShotView memory);
```

Purpose:

- let the frontend recover pending shot state after refresh.

Errors:

- `MatchNotFound`.

## getPlayerMatches

```solidity
function getPlayerMatches(
  address player,
  uint32 offset,
  uint32 limit
) external view returns (uint256[] memory matchIds);
```

Purpose:

- read match ids associated with a player.

Errors:

- `InvalidPaginationLimit`.

## Bot API

Bot mode is optional and should not block friend PvP MVP.

If included later:

```solidity
function createBotMatch(BotDifficulty difficulty) external returns (uint256 matchId);
function prepareBotFleet(uint256 matchId) external;
function executeBotMove(uint256 matchId) external returns (uint32 moveId);
function finalizeBotMove(
  uint256 matchId,
  uint32 moveId,
  bytes32 ctHash,
  uint8 result,
  bytes calldata signature
) external;
```

Rules:

- `executeBotMove` must not accept `cellIndex`;
- contract chooses the target;
- result finalization follows the same validation rules as `finalizeAttack`.

## Events

Required MVP events:

```solidity
event MatchCreated(
  uint256 indexed matchId,
  address indexed creator,
  address indexed invitedOpponent
);

event MatchJoined(
  uint256 indexed matchId,
  address indexed opponent
);

event FleetSubmitted(
  uint256 indexed matchId,
  address indexed player
);

event FleetValidationRequested(
  uint256 indexed matchId,
  address indexed player,
  bytes32 ctHash
);

event FleetValidated(
  uint256 indexed matchId,
  address indexed player,
  bool valid
);

event MatchStarted(
  uint256 indexed matchId,
  address indexed firstPlayer
);

event ShotSubmitted(
  uint256 indexed matchId,
  uint32 indexed moveId,
  address indexed attacker,
  address defender,
  uint8 cellIndex
);

event ShotResolutionRequested(
  uint256 indexed matchId,
  uint32 indexed moveId,
  bytes32 ctHash
);

event ShotResolved(
  uint256 indexed matchId,
  uint32 indexed moveId,
  ShotResult result
);

event TurnChanged(
  uint256 indexed matchId,
  address indexed currentTurn
);

event MatchFinished(
  uint256 indexed matchId,
  address indexed winner,
  uint32 moveCount
);

event MatchCancelled(
  uint256 indexed matchId
);

event MatchForfeited(
  uint256 indexed matchId,
  address indexed loser,
  address indexed winner
);

event TimeoutWinClaimed(
  uint256 indexed matchId,
  address indexed winner,
  uint8 reason
);
```

Event rule:

- events may expose public state only;
- never emit plaintext fleet data;
- never emit hidden ship ids unless game rules explicitly reveal them.

## Custom Errors

Recommended errors:

```solidity
error ContractPaused();
error MatchNotFound();
error InvalidMatchStatus();
error InvalidInvitedOpponent();
error SelfInviteNotAllowed();
error NotInvitedOpponent();
error CreatorCannotJoinOwnMatch();
error OpponentAlreadyJoined();
error JoinDeadlineExpired();
error OnlyCreator();
error NotMatchPlayer();
error NotMatchPlayerAddress();
error PlayerNotJoined();
error FleetAlreadySubmitted();
error PlacementValidationPending();
error NoPendingPlacementValidation();
error PlacementAlreadyFinalized();
error InvalidEncryptedInput();
error FleetInputInvalidLength();
error PlayersNotReady();
error FleetNotValid();
error MatchAlreadyStarted();
error NotYourTurn();
error InvalidCellIndex();
error CellAlreadyAttacked();
error PendingShotExists();
error NoPendingShot();
error InvalidMoveId();
error MoveNotFound();
error InvalidCtHash();
error InvalidShotResult();
error InvalidDecryptSignature();
error MoveAlreadyFinalized();
error CannotCancelStartedMatch();
error MatchAlreadyFinished();
error NoTimeoutAvailable();
error NotTimeoutClaimant();
error InvalidPaginationLimit();
```

Frontend should map these to short English messages from the copy deck.

## State Transition Summary

```text
None
  -> WaitingForOpponent
  -> WaitingForPlacement
  -> ValidatingPlacement
  -> ReadyToStart
  -> InProgress
  -> ResolvingShot
  -> InProgress
  -> Finished
```

Alternative terminal states:

```text
WaitingForOpponent -> Cancelled
WaitingForPlacement -> Cancelled
InProgress -> Forfeited
InProgress -> Finished
ResolvingShot -> Finished
```

Important:

- `ResolvingShot` can only return to `InProgress` or move to `Finished`;
- no new attack is allowed in `ResolvingShot`;
- no gameplay action is allowed after terminal states.

## Access Rules Summary

| Function | Caller |
| --- | --- |
| `createMatch` | any wallet |
| `joinMatch` | invited wallet only |
| `submitFleet` | creator or opponent |
| `finalizeFleetValidation` | any caller with valid Fhenix result |
| `startMatch` | any caller if both fleets valid |
| `attack` | current turn player only |
| `finalizeAttack` | any caller with valid Fhenix result |
| `cancelMatch` | creator only before start |
| `forfeit` | creator or opponent |
| `claimTimeoutWin` | eligible timeout claimant |
| read functions | any caller |

## Frontend Integration Expectations

Frontend should:

- read `getMatch` before rendering match state;
- read `getPlayers` before placement or battle view;
- read `getPendingShot` after page refresh;
- listen for events;
- treat Fhenix result finalization as asynchronous;
- never infer hidden game outcomes;
- handle custom errors with short English copy.

Frontend should not:

- pass plaintext fleet data;
- pass attack results;
- choose bot target;
- assume transaction receipt means Fhenix result is resolved;
- continue a match while `status == ResolvingShot`.

## Open API Decisions

Still unresolved:

- exact Fhenix typed decrypt verification signature;
- `DecryptResult` generic struct versus typed structs;
- single-call fleet input versus batched fleet input;
- whether `startMatch` is needed as public function or only internal;
- whether move history is array-based or mapping-based;
- exact timeout reason enum;
- exact bot API inclusion phase;
- whether `cancelMatch` is allowed after opponent joins but before fleet validation.

## MVP API Checklist

The MVP API is complete when it supports:

- create strict friend match;
- invited friend joins;
- creator submits encrypted fleet;
- friend submits encrypted fleet;
- placement validity is finalized;
- match starts with invited friend first;
- current player attacks;
- Fhenix shot result is finalized;
- public move history is readable;
- game can finish with a winner;
- match can be cancelled before start;
- match can be forfeited;
- timeout hooks are present or explicitly deferred.

## Next Document

After this API spec, write:

- `docs/frontend-architecture.md`

That document should explain how the web app consumes this API through Privy,
viem, optional wagmi hooks through Privy's integration, Fhenix SDK, event
listeners, and mobile UI state.
