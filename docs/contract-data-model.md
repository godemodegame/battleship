# Contract Data Model

## Purpose

This document defines the proposed smart contract data model for the mobile-first 3D fully on-chain Battleship game.

It turns the contract behavior, Fhenix integration, and technical architecture documents into concrete storage concepts. It does not define final function signatures. Function-level details belong in `docs/contract-api.md`.

## Implementation Status

Phase 3 (`contracts/contracts/BattleshipGame.sol`) realized the public slice
of this model: the core constants, all enums except `BotDifficulty`, the
`Match`, `PlayerState`, `PublicBoard`, and `TimeoutState` storage structs, the
`MatchView` and `PlayerPublicView` read structs, and the
`matches`/`playerMatchIds` mappings with ids starting at `1`. Decisions taken:

- timeouts are compiled-in constants (24 hours each) rather than constructor
  configuration, so deployed bytecode is byte-deterministic and deployment
  records can be validated by exact bytecode hash;
- `RESOLVING_TIMEOUT` is a placeholder constant until the Phase 4 prototype
  defines the resolving-recovery rule;
- bot state is omitted entirely instead of stored empty (`BotState`,
  `BotDifficulty`, and `PlayerSlot` routing arrive only if bot mode lands);
- `EncryptedFleet`, `FleetHealth`, `Move`, and `PendingShot` storage is
  deferred to Phase 4/7 so the encrypted encoding is not frozen before the
  CoFHE feasibility measurements;
- move history storage shape (array versus mapping) remains open until the
  attack flow lands.

## Design Goals

The data model must support:

- private friend PvP matches;
- encrypted fleet placement;
- Fhenix/CoFHE hit, sunk, and win computation;
- public attack coordinates;
- public resolved move history;
- asynchronous shot resolution;
- invited friend starts first;
- cancel and timeout hooks;
- optional backendless bot mode later;
- no plaintext hidden fleet data.

## Core Constants

Recommended constants:

```solidity
uint8 constant BOARD_SIZE = 10;
uint8 constant CELL_COUNT = 100;
uint8 constant MAX_SHIPS = 10;
uint8 constant TOTAL_SHIP_CELLS = 20;
uint8 constant NO_CELL = type(uint8).max;
```

Recommended timeouts:

```solidity
uint64 constant JOIN_TIMEOUT = 24 hours;
uint64 constant PLACEMENT_TIMEOUT = 24 hours;
uint64 constant TURN_TIMEOUT = 24 hours;
```

Timeout values can be adjusted after UX and gas testing.

## Cell Indexing

Cells use indexes from `0` to `99`.

Mapping:

- `0` = top-left;
- `9` = top-right;
- `90` = bottom-left;
- `99` = bottom-right.

Coordinate conversion:

```solidity
uint8 row = cellIndex / 10;
uint8 col = cellIndex % 10;
```

The frontend can display `A1`, `B4`, or `J10`, but the contract should use `uint8 cellIndex`.

## Ship Encoding

Recommended fleet cell encoding:

```solidity
uint8 constant WATER = 0;
uint8 constant CARRIER = 1;
uint8 constant BATTLESHIP = 2;
uint8 constant CRUISER = 3;
uint8 constant DESTROYER = 4;
uint8 constant SUBMARINE = 5;
uint8 constant PATROL_BOAT = 6;
```

For MVP storage, each encrypted board cell can contain:

- `0` for water;
- non-zero ship type or ship id for occupied cells.

Open decision:

- ship type is easier for visual interpretation;
- unique ship id is easier for exact sunk tracking.

Recommendation:

- use unique ship ids internally if full sunk tracking is required;
- map ship ids to ship type metadata separately.

## Enums

## MatchType

```solidity
enum MatchType {
  Friend,
  Open,
  Bot
}
```

MVP:

- `Friend`

Later:

- `Open`;
- `Bot`.

## MatchStatus

```solidity
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
```

Notes:

- `None` is useful for uninitialized mappings.
- `ResolvingShot` prevents the next turn while Fhenix result finalization is pending.
- `ValidatingPlacement` can be used globally or represented per-player through `PlacementStatus`.

## PlacementStatus

```solidity
enum PlacementStatus {
  None,
  NotSubmitted,
  Submitted,
  ResolvingValidation,
  Valid,
  Invalid
}
```

Each player should have an independent placement status.

## ShotResult

```solidity
enum ShotResult {
  None,
  Miss,
  Hit,
  Sunk,
  Win
}
```

Public result encoding should match Fhenix final result encoding:

- `0` = `None`;
- `1` = `Miss`;
- `2` = `Hit`;
- `3` = `Sunk`;
- `4` = `Win`.

If the Fhenix integration uses `0..3` instead, the contract API document must align all values.

Recommendation:

- reserve `0` for unset values;
- use `1..4` for real results.

## PlayerSlot

```solidity
enum PlayerSlot {
  None,
  Creator,
  Opponent,
  Bot
}
```

Use this for compact internal routing from address or match type to the correct player state.

## BotDifficulty

```solidity
enum BotDifficulty {
  None,
  Easy,
  Normal,
  Hard
}
```

MVP bot mode should only use `Easy` if bot mode is added.

## Main Storage

Recommended top-level storage:

```solidity
uint256 public nextMatchId;

mapping(uint256 => Match) private matches;
mapping(uint256 => Move[]) private matchMoves;
mapping(address => uint256[]) private playerMatchIds;
```

Optional public lookup:

```solidity
mapping(bytes32 => uint256) private inviteCodeToMatchId;
```

Only include invite codes if the UX needs link-only invites.

## Match

Recommended structure:

```solidity
struct Match {
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
  PlayerState creatorState;
  PlayerState opponentState;
  PendingShot pendingShot;
  TimeoutState timeoutState;
  BotState botState;
}
```

Field notes:

- `creator` is the address that creates the match.
- `opponent` is set after `joinMatch`.
- `invitedOpponent` is the wallet address allowed to join strict friend matches.
- `currentTurn` is set to `opponent` after both fleets are valid.
- `winner` is zero until the match ends.
- `pendingMoveId` points to an unresolved move if `status == ResolvingShot`.
- `botState` is unused for normal friend matches.

## PlayerState

Recommended structure:

```solidity
struct PlayerState {
  address player;
  bool joined;
  PlacementStatus placementStatus;
  bool fleetSubmitted;
  bool fleetValid;
  uint64 fleetSubmittedAt;
  uint64 fleetValidatedAt;
  EncryptedFleet fleet;
  PublicBoard publicBoard;
  FleetHealth fleetHealth;
}
```

Field notes:

- `player` is zero for uninitialized slots.
- `placementStatus` is more expressive than separate booleans, but booleans can be retained for cheaper reads if useful.
- `fleet` must never expose plaintext fleet data.
- `publicBoard` tracks attacks made against this player.
- `fleetHealth` is encrypted or restricted state used to determine sunk and win.

## EncryptedFleet

MVP baseline:

```solidity
struct EncryptedFleet {
  euint8[100] cells;
  bool initialized;
  bytes32 fleetCommitment;
}
```

Fields:

- `cells` stores encrypted cell values.
- `initialized` marks whether the encrypted fleet exists.
- `fleetCommitment` is optional and can be used to identify a placement payload or anti-replay context.

Storage warning:

- `euint8[100]` is simple but may be expensive.
- The first implementation should prototype gas and calldata cost before locking this model.

Fallback models:

```solidity
struct EncryptedShipListFleet {
  EncryptedShip[10] ships;
}

struct EncryptedShip {
  euint8 startCell;
  euint8 direction;
  euint8 length;
  euint8 shipId;
}
```

or:

```solidity
struct PackedEncryptedFleet {
  euint128 occupiedMaskLow;
  euint128 occupiedMaskHigh;
  euint128 shipIdData;
}
```

The MVP starts with `EncryptedFleet` unless prototyping proves it too costly.

## EncryptedFleetInput

Suggested input shape:

```solidity
struct EncryptedFleetInput {
  InEuint8[100] cells;
}
```

Potential batching shape:

```solidity
struct EncryptedFleetBatchInput {
  uint8 startIndex;
  InEuint8[] cells;
}
```

Batching can reduce client and transaction pressure if one 100-cell encrypted input is impractical.

The final contract API must choose one input shape.

## PublicBoard

`PublicBoard` tracks what has been publicly revealed about attacks against a player.

Recommended structure:

```solidity
struct PublicBoard {
  uint128 attackedMask;
  uint128 missMask;
  uint128 hitMask;
  uint128 sunkMask;
}
```

Why `uint128`:

- 100 cells fit within 128 bits;
- bit operations are compact;
- each bit corresponds to `cellIndex`.

Bit helper idea:

```solidity
uint128 bit = uint128(1) << cellIndex;
```

Field meaning:

- `attackedMask` marks every attacked cell.
- `missMask` marks resolved misses.
- `hitMask` marks resolved hits and sunk cells.
- `sunkMask` marks cells known as part of sunk state if rules reveal them.

MVP reveal rule:

- do not reveal full sunk ship cells unless they were already attacked;
- `sunkMask` may equal the final attacked cell only in MVP.

## FleetHealth

The contract needs a way to track whether ships are sunk and whether the fleet is defeated.

Recommended MVP structure:

```solidity
struct FleetHealth {
  euint8 totalRemainingHealth;
  euint8[10] shipRemainingHealth;
  bool initialized;
}
```

Field notes:

- `totalRemainingHealth` starts at `20`.
- `shipRemainingHealth` supports sunk detection.
- values remain encrypted.
- only final allowed results become public.

Open issue:

- if cells store ship type instead of unique ship id, sunk detection is harder.

Recommendation:

- use unique ship ids for cells;
- store public ship metadata separately.

## ShipMetadata

Ship metadata can be public because it does not reveal placement.

```solidity
struct ShipMetadata {
  uint8 shipId;
  uint8 shipType;
  uint8 length;
}
```

Static fleet metadata:

| Ship id | Type | Length |
| --- | --- | --- |
| 1 | Carrier | 4 |
| 2 | Battleship | 3 |
| 3 | Cruiser | 3 |
| 4 | Destroyer A | 2 |
| 5 | Destroyer B | 2 |
| 6 | Submarine A | 2 |
| 7 | Patrol A | 1 |
| 8 | Patrol B | 1 |
| 9 | Patrol C | 1 |
| 10 | Patrol D | 1 |

This keeps total occupied cells at `20`.

The visual model can still map ids to stylized ship classes.

## Move

Moves are public after they are submitted. Their results become public only after Fhenix finalization.

Recommended structure:

```solidity
struct Move {
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

Field notes:

- `moveId` should increment per match.
- `cellIndex` is public.
- `result` starts as `None`.
- `finalized` becomes true after decrypt result verification.

## PendingShot

`PendingShot` tracks the Fhenix result that has not yet been finalized.

Recommended structure:

```solidity
struct PendingShot {
  bool exists;
  uint32 moveId;
  address attacker;
  address defender;
  uint8 cellIndex;
  bytes32 resultCtHash;
  euint8 encryptedResult;
  uint64 submittedAt;
}
```

Field notes:

- `exists` prevents multiple unresolved shots.
- `resultCtHash` must match the decrypt result submitted to `finalizeAttack`.
- `encryptedResult` is the FHE result enum.
- `moveId` prevents stale finalization.

When finalized:

- verify `ctHash`;
- verify signature;
- update `Move.result`;
- update public board masks;
- update match status and turn;
- clear `pendingShot`.

## PendingPlacementValidation

Placement validation may also need pending state.

Recommended structure:

```solidity
struct PendingPlacementValidation {
  bool exists;
  address player;
  bytes32 validityCtHash;
  ebool encryptedValid;
  uint64 requestedAt;
}
```

This can be stored inside `PlayerState` or in a match-level mapping.

Recommended:

- include it inside `PlayerState` once exact validation flow is known.

## TimeoutState

Recommended structure:

```solidity
struct TimeoutState {
  uint64 joinDeadline;
  uint64 placementDeadline;
  uint64 turnDeadline;
  uint64 resolvingDeadline;
}
```

Field notes:

- `joinDeadline` applies while waiting for friend.
- `placementDeadline` applies after both players are present.
- `turnDeadline` applies during active turns.
- `resolvingDeadline` applies during Fhenix pending shot states.

Timeout actions:

- `cancelMatch`;
- `claimTimeoutWin`;
- recovery or retry for stuck resolution.

## BotState

Bot state is optional and should not block friend PvP MVP.

Recommended structure:

```solidity
struct BotState {
  bool enabled;
  BotDifficulty difficulty;
  uint32 lastBotMoveId;
  uint8 lastHitCell;
  uint128 botAttackedMask;
  uint128 candidateMask;
  bytes32 pendingRandomCtHash;
}
```

Field notes:

- `enabled` is false for friend matches.
- `botAttackedMask` tracks bot attacks against the player.
- `candidateMask` supports normal or hard strategy later.
- `pendingRandomCtHash` supports encrypted randomness workflows.

MVP friend matches can leave this empty.

## Address to Player Slot Mapping

Recommended helper:

```solidity
function getPlayerSlot(Match storage m, address account) internal view returns (PlayerSlot);
```

Rules:

- `creator` maps to `Creator`;
- `opponent` maps to `Opponent`;
- bot pseudo-player maps to `Bot`;
- all other addresses map to `None`.

Do not store an extra mapping unless gas profiling shows it is needed.

## Public Read Models

Contracts should expose read models that avoid returning encrypted internals unnecessarily.

Recommended public read structs:

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

Encrypted fleet cells should not be returned from ordinary public views.

## Public vs Encrypted Fields

## Public Fields

Safe to expose:

- match id;
- match type;
- status;
- creator address;
- opponent address after join;
- invited address for strict invite;
- current turn;
- winner;
- timestamps;
- move count;
- attack coordinates;
- resolved shot result;
- public board masks;
- placement status.

## Encrypted Fields

Must stay encrypted:

- fleet cell values;
- ship health;
- total remaining health;
- validation computations before final boolean;
- hit flag before public resolution;
- sunk and win flags before public resolution;
- bot random values before safe use.

## Never Store

Never store:

- plaintext fleet;
- plaintext hidden cell values;
- plaintext ship health before reveal;
- private keys;
- wallet signatures beyond what is needed for verified decrypt results;
- frontend-provided hit or miss result.

## Storage Lifecycle

## Match Creation

Initial state:

- `status = WaitingForOpponent`;
- `creator = msg.sender`;
- `invitedOpponent = provided address`;
- `currentTurn = address(0)`;
- `winner = address(0)`;
- creator state is initialized;
- opponent state is empty;
- deadlines are set.

## Opponent Join

State updates:

- `opponent = msg.sender`;
- opponent state initialized;
- `joinedAt = block.timestamp`;
- `status = WaitingForPlacement`;
- placement deadline set.

Strict invite rule:

- `msg.sender` must equal `invitedOpponent`.

## Fleet Submission

State updates:

- encrypted fleet stored;
- contract gets access through `FHE.allowThis`;
- `placementStatus = Submitted` or `ResolvingValidation`;
- `fleetSubmittedAt = block.timestamp`.

Never emit encrypted cell plaintext.

## Fleet Validation

State updates:

- validation result finalized;
- `placementStatus = Valid` or `Invalid`;
- `fleetValid = true` only if valid;
- if both valid, match can start.

## Match Start

State updates:

- `status = InProgress`;
- `startedAt = block.timestamp`;
- `currentTurn = opponent`;
- `lastActionAt = block.timestamp`;
- turn deadline set.

The invited friend starts first.

## Attack Submission

State updates:

- create `Move` with `result = None`;
- create `PendingShot`;
- update defender `attackedMask`;
- `status = ResolvingShot`;
- `pendingMoveId = moveId`;
- resolving deadline set.

## Attack Finalization

State updates:

- verify decrypt result;
- update move result;
- update defender public board masks;
- if `Win`, set status and winner;
- if `Miss`, set `currentTurn` to defender;
- if `Hit` or `Sunk`, keep `currentTurn` with the attacker;
- clear pending shot;
- update deadline.

## Match End

State updates:

- `status = Finished`;
- `winner` set;
- `finishedAt` set;
- no further attacks allowed.

## Gas and Storage Considerations

Potential gas-heavy areas:

- storing `euint8[100]` fleet cells;
- validating full Battleship placement;
- updating encrypted ship health;
- storing every move in an on-chain array;
- returning large arrays to frontend.

Possible optimizations:

- use packed public bitsets;
- use event logs for move history and store only critical state;
- store move count and per-move mapping instead of arrays;
- batch encrypted fleet submission;
- move from encrypted cell array to encrypted ship list;
- defer full classic no-touch validation.

## Recommended MVP Data Model

Use this first:

- one `BattleshipGame` contract;
- `Match` mapping by match id;
- `Move[]` or `mapping(matchId => mapping(moveId => Move))`;
- encrypted 100-cell fleet baseline;
- public `uint128` board masks;
- encrypted total health and per-ship health;
- one pending shot per match;
- `euint8` final result enum;
- invited opponent starts first.

Revisit after prototype:

- encrypted fleet encoding;
- full validation cost;
- move storage shape;
- bot state inclusion;
- indexer need.

## Open Decisions

Still unresolved:

- final fleet encoding;
- whether cells store ship type or unique ship id;
- whether move history is array-based or mapping-based;
- exact type of `ctHash` in contract signatures;
- whether placement validation has a dedicated pending struct;
- whether `ReadyToStart` is a real stored status or transitional state;
- whether bot fields live in the main `Match` or separate mapping;
- exact timeout values;
- exact public reveal behavior for sunk ships.

## Next Document

After this data model, write:

- `docs/contract-api.md`

That document should define function signatures, events, custom errors, and state transition requirements using this data model as the base.
