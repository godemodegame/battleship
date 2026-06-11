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

## Implementation Status

Phase 3 (GAME-301..311) implemented the public lifecycle slice of this API in
`contracts/contracts/BattleshipGame.sol`: `createMatch`, `joinMatch`,
`cancelMatch`, `forfeit`, `claimTimeoutWin`, the reads `getMatch`,
`getPlayers`, `getPlayerMatches`, `getPlayerMatchCount`, and the lifecycle
events and errors those functions use. Decisions taken by the implementation:

- `forfeit` reverts with `InvalidMatchStatus` while the match is still
  `WaitingForOpponent`: there is no opponent to win, so the creator exits with
  `cancelMatch` (this resolves the open cancel-after-join question in favor of
  allowing cancel until the match starts);
- a missed join deadline is a cancellation path, not a `claimTimeoutWin` case;
- `claimTimeoutWin` supports placement and turn deadlines with reason codes
  `1` (placement) and `2` (turn);
- `MatchView` additionally exposes the `TimeoutState` deadlines so the
  frontend can render timeout UI without extra reads;
- `getPlayerMatchCount(player)` exists alongside `getPlayerMatches` for
  pagination; the pagination cap is `50`;
- match ids are sequential starting at `1`; id `0` always means no match.

Phase 4 (GAME-401..412) froze and implemented the fleet and attack API:
`submitFleet`, `finalizeFleetValidation`, `retryFleetValidation`, `attack`,
`finalizeAttack`, `retryShotResolution`, `getMove`, `getMoveHistory`,
`getPendingShot`, and `getShipLengths`. The encoding decision and
measurements live in `docs/cofhe-feasibility-results.md`. Decisions taken by
the implementation that supersede earlier proposals in this document:

- the pinned CoFHE contracts version (`0.0.13`, the only one supported by
  the mock/plugin/cofhejs `0.3.1` set) has no client-submitted decrypt
  results: the contract requests decryption on-chain (`FHE.decrypt`) and the
  CoFHE network posts the signed plaintext back on-chain. Finalization
  functions therefore take no `ctHash`/`value`/`signature` arguments - they
  are permissionless triggers that read `FHE.getDecryptResultSafe` and
  revert with `DecryptionResultNotReady` until the result lands. The
  `DecryptResult` struct proposal is obsolete;
- fleet input is `InEuint8[20]` ship segments (not `InEuint8[100]` cells),
  grouped by ship in the fixed public order carrier(4), battleship(3),
  cruiser(3), destroyer A(2), destroyer B(2), submarine(2), patrol A..D(1);
- `startMatch` does not exist: `finalizeFleetValidation` auto-starts the
  match when both fleets are valid, atomically, so a separate recovery
  function has no reachable state. `ReadyToStart` is never stored;
- `ShotResolved` and `MoveView` carry a public `sunkShipId` (`0` unless the
  shot sank a ship, else `1..10`), matching the classic rule that a sunk
  announcement names the ship class;
- ciphertext handles in events and views are `uint256` (the native CoFHE
  handle type), not `bytes32`;
- an invalid placement resets `fleetSubmitted` to `false` and the player
  resubmits with a fresh validity handle, so stale decrypt results can
  never finalize a newer submission;
- the `ResolvingShot` recovery rule: a stuck decryption is never a win or
  loss for either player; anyone can re-request it with
  `retryShotResolution` / `retryFleetValidation`, and both players can
  always exit through `forfeit`. `claimTimeoutWin` stays closed during
  `ResolvingShot`, and `RESOLVING_TIMEOUT` only paces retry UI.

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

Implemented:

```solidity
pragma solidity 0.8.25;

import {FHE, ebool, euint8} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {InEuint8} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";
```

`@fhenixprotocol/cofhe-contracts` is pinned to `0.0.13`, the version the
CoFHE mock/plugin/cofhejs `0.3.1` toolchain targets
(`docs/cofhe-feasibility-results.md`).

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

## Fleet input (implemented)

The encrypted fleet is submitted as a fixed-size array of CoFHE encrypted
inputs, one per occupied cell, grouped by ship in the frozen public order:

```solidity
function submitFleet(uint256 matchId, InEuint8[20] calldata segments) external;
```

Each `InEuint8` is the standard CoFHE input struct
(`uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature`)
produced by one `cofhejs.encrypt` call of 20 `Encryptable.uint8` values.
Ship identity is the public array position; `getShipLengths()` exposes the
segment grouping. See `docs/cofhe-feasibility-results.md` for why the
100-cell baseline and batched variants were rejected.

Do not support plaintext fleet submission.

## Decrypt results (no input struct)

The pinned CoFHE version has no client-submitted decrypt results. The
contract requests decryption with `FHE.decrypt(handle)` inside `submitFleet`
and `attack`; the CoFHE network posts the signed plaintext on-chain; the
permissionless finalization functions read it with
`FHE.getDecryptResultSafe(handle)`. No caller ever supplies a result value
or signature, so the previously proposed `DecryptResult` structs do not
exist.

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
  uint8 sunkShipId;
  uint64 submittedAt;
  uint64 resolvedAt;
  bool finalized;
}
```

`sunkShipId` is `0` unless the move sank a ship (`1..10`, public ship
metadata order).

## PendingShotView

```solidity
struct PendingShotView {
  bool exists;
  uint32 moveId;
  address attacker;
  address defender;
  uint8 cellIndex;
  uint256 resultCtHash;
  uint256 sunkShipCtHash;
  uint64 submittedAt;
}
```

The ct hashes are public handle identifiers (decryption stays ACL-gated);
they let a recovering client correlate `ShotResolutionRequested` events.

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

## submitFleet (implemented)

```solidity
function submitFleet(uint256 matchId, InEuint8[20] calldata segments) external;
```

Purpose:

- submit encrypted fleet placement for the caller and start encrypted
  validation in the same transaction.

Requirements:

- match exists;
- caller is creator or opponent (`NotMatchPlayer`);
- match status is `WaitingForPlacement` or `ValidatingPlacement`;
- caller has no pending validation (`PlacementValidationPending`);
- caller's fleet is not already `Valid` (`FleetAlreadySubmitted`);
- encrypted inputs pass CoFHE input verification through `FHE.asEuint8`
  (on real networks the zk proof binds them to the caller and chain).

State changes:

- convert each `InEuint8` to `euint8`, `FHE.allowThis`, and store;
- initialize encrypted per-ship health from public ship lengths;
- compute the encrypted validity flag (range, straightness, contiguity,
  horizontal row bounds) and request its decryption (`FHE.decrypt`);
- record the pending validation with the validity handle;
- set `fleetSubmitted = true`, `placementStatus = ResolvingValidation`,
  `fleetSubmittedAt`;
- set match status `ValidatingPlacement`.

Events:

```solidity
event FleetSubmitted(uint256 indexed matchId, address indexed player);

event FleetValidationRequested(
  uint256 indexed matchId,
  address indexed player,
  uint256 ctHash
);
```

Frontend behavior:

- encrypt the 20 segments with one `cofhejs.encrypt` call;
- submit transaction;
- show `Validating placement`;
- wait for `FleetValidated` before showing ready state.

Errors:

- `MatchNotFound`;
- `InvalidMatchStatus`;
- `NotMatchPlayer`;
- `PlacementValidationPending`;
- `FleetAlreadySubmitted`.

## finalizeFleetValidation (implemented)

```solidity
function finalizeFleetValidation(uint256 matchId, address player) external;
```

Purpose:

- publish the resolved placement validity once the CoFHE network has posted
  the decrypt result on-chain. Permissionless: the caller supplies no result
  data.

Requirements:

- match exists and is `ValidatingPlacement`;
- `player` is creator or opponent (`NotMatchPlayerAddress`);
- a pending validation exists for `player`;
- the decrypt result for the stored validity handle is ready
  (`DecryptionResultNotReady` until then).

State changes:

- if valid: `placementStatus = Valid`, `fleetValid = true`;
- if invalid: `placementStatus = Invalid`, `fleetValid = false`, and
  `fleetSubmitted` resets to `false` so the player can resubmit;
- clear pending validation; set `fleetValidatedAt`;
- if both players are valid, start the match immediately: status
  `InProgress`, `currentTurn = opponent`, turn deadline set.

Events:

```solidity
event FleetValidated(uint256 indexed matchId, address indexed player, bool valid);

event MatchStarted(uint256 indexed matchId, address indexed firstPlayer);

event TurnChanged(uint256 indexed matchId, address indexed currentTurn);
```

`MatchStarted` and `TurnChanged` are emitted by the finalization that
validates the second fleet. There is no separate `startMatch` function and
`ReadyToStart` is never stored: auto-start runs atomically inside
finalization, so a "start did not run" recovery state cannot exist.

Frontend behavior:

- any caller can finalize once the result is ready;
- show `Fleet confirmed` if valid;
- show `Fleet placement invalid` if invalid and return to placement;
- when `MatchStarted` arrives, route both users into battle state.

Errors:

- `MatchNotFound`;
- `InvalidMatchStatus`;
- `NotMatchPlayerAddress`;
- `NoPendingPlacementValidation`;
- `DecryptionResultNotReady`.

## retryFleetValidation (implemented)

```solidity
function retryFleetValidation(uint256 matchId, address player) external;
```

Permissionless, idempotent recovery: re-requests decryption of the same
pending validity handle and re-emits `FleetValidationRequested`. Used when a
CoFHE decrypt result never lands. Reverts with the same errors as
`finalizeFleetValidation` except `DecryptionResultNotReady`.

## Attack API

## attack (implemented)

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
- `status == InProgress` (this also implies both fleets are valid and no
  pending shot exists, since a pending shot holds the match in
  `ResolvingShot`);
- `msg.sender == currentTurn` (`NotYourTurn`);
- `cellIndex < 100` (`InvalidCellIndex`);
- target cell not already attacked on the defender's board
  (`CellAlreadyAttacked`).

State changes:

- determine defender; mark `publicBoard.attackedMask`;
- increment move count; create `Move` with `result = None` (move ids start
  at `1`);
- run the encrypted shot pipeline: per-ship hit flags, encrypted health
  decrement, sunk and all-ships-dead detection, encrypted result enum and
  encrypted sunk-ship id;
- request decryption of both result handles (`FHE.decrypt`);
- store the pending shot with both handles;
- set `status = ResolvingShot`, `pendingMoveId`, resolving deadline.

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
  uint256 resultCtHash,
  uint256 sunkShipCtHash
);
```

Frontend behavior:

- show selected coordinate confirmation;
- after transaction, show `Resolving Shot`;
- wait for the CoFHE network to post the decrypt results, then call
  `finalizeAttack` (any wallet may do it);
- do not allow the next turn until `ShotResolved`.

Errors:

- `MatchNotFound`;
- `InvalidMatchStatus`;
- `NotYourTurn`;
- `InvalidCellIndex`;
- `CellAlreadyAttacked`;
- `PendingShotExists` (defensive; unreachable through `InProgress`).

## finalizeAttack (implemented)

```solidity
function finalizeAttack(uint256 matchId, uint32 moveId) external;
```

Purpose:

- publish the resolved shot outcome once the CoFHE network has posted both
  decrypt results on-chain. Permissionless: the caller supplies no result
  data, so a malicious finalizer cannot influence the outcome.

Requirements:

- match exists;
- `status == ResolvingShot`;
- pending shot exists;
- `moveId == pendingShot.moveId` (`InvalidMoveId` rejects stale ids);
- both decrypt results are ready (`DecryptionResultNotReady`);
- the result plaintext is `1..4` (`InvalidShotResult`; fail-closed guard,
  the encrypted pipeline only emits valid values).

State changes:

- update move result, `sunkShipId`, `resolvedAt`, `finalized = true`;
- update defender public board masks (`missMask` or `hitMask`; `sunkMask`
  additionally marks the final cell on `Sunk`/`Win`);
- clear pending shot and `pendingMoveId`;
- if `Win`: status `Finished`, set winner, clear `currentTurn`;
- if `Miss`: status `InProgress`, turn passes to the defender;
- if `Hit`/`Sunk`: status `InProgress`, attacker keeps the turn;
- reset turn deadline when the match continues.

Duplicate finalization is impossible: clearing the pending shot returns the
match to `InProgress`/`Finished`, so a replayed call reverts with
`InvalidMatchStatus`.

Events:

```solidity
event ShotResolved(
  uint256 indexed matchId,
  uint32 indexed moveId,
  uint8 result,
  uint8 sunkShipId
);

event TurnChanged(uint256 indexed matchId, address indexed currentTurn);

event MatchFinished(
  uint256 indexed matchId,
  address indexed winner,
  uint32 moveCount
);
```

`TurnChanged` is emitted only when a miss changes `currentTurn`. A hit or
sunk ship keeps the same attacker and does not emit a turn-change event.
`sunkShipId` is `0` unless the result is `Sunk` or `Win`.

Frontend behavior:

- any caller may finalize once results are ready;
- show `Miss`, `Hit`, `Sunk`, `Victory`, or `Defeat`;
- after a miss, update the active player to the defender;
- after a hit or sunk ship, let the attacker select another target.

Errors:

- `MatchNotFound`;
- `InvalidMatchStatus`;
- `NoPendingShot`;
- `InvalidMoveId`;
- `DecryptionResultNotReady`;
- `InvalidShotResult`.

## retryShotResolution (implemented)

```solidity
function retryShotResolution(uint256 matchId) external;
```

Permissionless, idempotent recovery: re-requests decryption of both pending
shot handles, extends the resolving deadline, and re-emits
`ShotResolutionRequested`. This is the `ResolvingShot` recovery rule: a
stuck decryption is never a win, and players can still exit via `forfeit`.

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
- resolving deadline expired: not a win claim. Recovery is the permissionless
  `retryShotResolution` / `retryFleetValidation`, plus `forfeit` as the exit;
  `claimTimeoutWin` reverts with `NoTimeoutAvailable` during `ResolvingShot`.

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

Implemented events:

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
  uint256 ctHash
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
  uint256 resultCtHash,
  uint256 sunkShipCtHash
);

event ShotResolved(
  uint256 indexed matchId,
  uint32 indexed moveId,
  uint8 result,
  uint8 sunkShipId
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

Implemented errors:

```solidity
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
error CannotCancelStartedMatch();
error MatchAlreadyFinished();
error NoTimeoutAvailable();
error NotTimeoutClaimant();
error InvalidPaginationLimit();
error NotMatchPlayerAddress();
error FleetAlreadySubmitted();
error PlacementValidationPending();
error NoPendingPlacementValidation();
error DecryptionResultNotReady();
error NotYourTurn();
error InvalidCellIndex();
error CellAlreadyAttacked();
error PendingShotExists();
error NoPendingShot();
error InvalidMoveId();
error MoveNotFound();
error InvalidShotResult();
```

Errors proposed earlier but not implemented, with the reason:

- `InvalidCtHash`, `InvalidDecryptSignature`: callers never supply hashes or
  signatures in the on-chain decrypt flow;
- `PlacementAlreadyFinalized`, `MoveAlreadyFinalized`: duplicate
  finalization structurally reverts with `NoPendingPlacementValidation` /
  `InvalidMatchStatus` because finalization clears the pending state;
- `PlayersNotReady`, `FleetNotValid`, `MatchAlreadyStarted`: belonged to the
  removed `startMatch`;
- `PlayerNotJoined`: unreachable - `WaitingForPlacement` implies both joined;
- `InvalidEncryptedInput`, `FleetInputInvalidLength`: the fixed-size
  `InEuint8[20]` ABI and CoFHE input verification enforce shape;
- `ContractPaused`: no pause support in the MVP.

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
| `finalizeFleetValidation` | any caller once the decrypt result is ready |
| `retryFleetValidation` | any caller while validation is pending |
| `attack` | current turn player only |
| `finalizeAttack` | any caller once the decrypt results are ready |
| `retryShotResolution` | any caller while a shot is resolving |
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

Resolved by the Phase 4 implementation:

- decrypt verification: on-chain `FHE.decrypt` + `FHE.getDecryptResultSafe`;
  no client-supplied results, no `DecryptResult` struct (see Implementation
  Status);
- fleet input: single-call `InEuint8[20]` ship segments;
- `startMatch`: does not exist; auto-start inside `finalizeFleetValidation`;
- move history: `mapping(matchId => mapping(moveId => Move))` with
  paginated `getMoveHistory`;
- timeout reasons: `1` placement, `2` turn; resolving is retry-based, never
  a claim;
- `cancelMatch`: allowed through `WaitingForOpponent`, `WaitingForPlacement`,
  and `ValidatingPlacement`; blocked from `InProgress` on.

Still open:

- exact bot API inclusion phase (post-MVP).

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
