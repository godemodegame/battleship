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
- bot state is omitted entirely instead of stored empty (`BotState`,
  `BotDifficulty`, and `PlayerSlot` routing arrive only if bot mode lands).

Phase 4 froze the encrypted model after the CoFHE feasibility measurements
(`docs/cofhe-feasibility-results.md`). As implemented:

- the encrypted fleet is a ship-segment list: `euint8[20]` encrypted cell
  indexes grouped by ship in a fixed public order, plus `euint8[10]`
  encrypted per-ship health initialized from public ship lengths. The
  100-cell array, packed masks, and batched variants were measured and
  rejected (validation cost);
- encrypted state lives in dedicated mappings
  (`fleets[matchId][player]`, `pendingValidations[matchId][player]`,
  `pendingShots[matchId]`), never inside the publicly viewable
  `PlayerState`;
- move history is `mapping(matchId => mapping(moveId => Move))` with move
  ids starting at `1`; `Move` carries a public `sunkShipId`;
- there is no `totalRemainingHealth`: the win check is
  all-ships-dead (`and` over the ten encrypted health-is-zero flags),
  which stays correct even if a player overlaps own ships;
- pending decryptions store `uint256` ciphertext handles (the native CoFHE
  handle type); the network posts plaintexts on-chain and finalization
  reads them - no client-supplied results anywhere;
- `RESOLVING_TIMEOUT` paces retry UI only: recovery is permissionless
  re-request (`retryShotResolution`/`retryFleetValidation`), never a
  timeout win;
- `ReadyToStart` is never stored: validation finalization auto-starts the
  match;
- the MVP sunk reveal is the final attacked cell (`sunkMask` bit) plus the
  public `sunkShipId`; full sunk-geometry reveal stays post-MVP.

Phase 9 adds seeded state-transition properties, cross-match isolation,
read-surface allowlisting, and assertions that only attacked public mask bits
leave storage.

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

## Ship Encoding (implemented)

The fleet is not stored as board cells. It is a segment list: 20 encrypted
cell indexes (`0..99`), one per occupied cell, grouped by ship in a fixed
public submission order. Ship identity is the public array position, so no
encrypted ship-id values exist at all:

```solidity
// BattleshipGame.sol
bytes private constant SHIP_LENGTHS = hex"04030302020201010101";
// segments[0..3]   ship 1  carrier      (4)
// segments[4..6]   ship 2  battleship   (3)
// segments[7..9]   ship 3  cruiser      (3)
// segments[10..11] ship 4  destroyer A  (2)
// segments[12..13] ship 5  destroyer B  (2)
// segments[14..15] ship 6  submarine    (2)
// segments[16..19] ships 7..10 patrol A..D (1 each)
```

`getShipLengths()` exposes the grouping publicly. Public ship ids `1..10`
(used by `sunkShipId`) are the one-based ship positions in this order.

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

Implemented top-level storage:

```solidity
uint256 public nextMatchId;

mapping(uint256 => Match) internal matches;
mapping(address => uint256[]) internal playerMatchIds;
mapping(uint256 => mapping(address => EncryptedFleet)) private fleets;
mapping(uint256 => mapping(address => PendingPlacementValidation)) private pendingValidations;
mapping(uint256 => PendingShot) private pendingShots;
mapping(uint256 => mapping(uint32 => Move)) private moves;
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

## PlayerState (implemented)

```solidity
struct PlayerState {
  address player;
  bool joined;
  PlacementStatus placementStatus;
  bool fleetSubmitted;
  bool fleetValid;
  uint64 fleetSubmittedAt;
  uint64 fleetValidatedAt;
  PublicBoard publicBoard;
}
```

Field notes:

- `player` is zero for uninitialized slots.
- `publicBoard` tracks attacks made against this player.
- the encrypted fleet and health deliberately live outside this struct (in
  the `fleets` mapping): `PlayerState` feeds the public `getPlayers` read,
  and no encrypted handle may travel through it.
- after an `Invalid` validation verdict, `fleetSubmitted` resets to `false`
  so the player resubmits and timeout claims stay correct.

## EncryptedFleet (implemented)

```solidity
struct EncryptedFleet {
  euint8[20] segments;
  euint8[10] shipHealth;
  bool initialized;
}

mapping(uint256 matchId => mapping(address player => EncryptedFleet)) private fleets;
```

Fields:

- `segments` stores the encrypted occupied-cell indexes in submission order.
- `shipHealth` starts at the public ship lengths and decrements encrypted on
  every hit; a zero health is an encrypted sunk flag.
- `initialized` marks whether the encrypted fleet exists.

The struct lives in its own mapping, never inside `PlayerState`, so no read
of public player state can carry encrypted handles. The prototyped
alternatives (100-cell array in one or four transactions, packed nibble
masks) and the measurements that rejected them are recorded in
`docs/cofhe-feasibility-results.md`.

## Fleet input (implemented)

```solidity
function submitFleet(uint256 matchId, InEuint8[20] calldata segments) external;
```

One transaction, one `cofhejs.encrypt` call producing all 20 inputs. No
batching: the segment encoding made it unnecessary (5.8KB calldata).

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

## FleetHealth (implemented inside EncryptedFleet)

Per-ship health is the `shipHealth: euint8[10]` array of `EncryptedFleet`,
initialized from the public ship lengths at zero FHE cost.

- a hit decrements the hit ship's encrypted health;
- sunk detection is `health == 0` combined with this-shot-hit-this-ship;
- the win check is all-ships-dead (`and` over the ten health-is-zero
  flags). There is deliberately no `totalRemainingHealth` counter: a
  per-hit total would diverge from per-ship health if a player overlapped
  own ships, creating an unwinnable match; the all-sunk conjunction cannot.

All health values stay encrypted; only the final result enum and sunk ship
id are ever decrypted.

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

## Move (implemented)

Moves are public after they are submitted. Their results become public only
after decrypt finalization.

```solidity
struct Move {
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

mapping(uint256 matchId => mapping(uint32 moveId => Move)) private moves;
```

Field notes:

- `moveId` increments per match starting at `1`.
- `cellIndex` is public.
- `result` starts as `None`.
- `sunkShipId` is `0` unless the move sank a ship (`1..10`).
- `finalized` becomes true when the on-chain decrypt results are applied.

## PendingShot (implemented)

`PendingShot` tracks the one unresolved shot of a match.

```solidity
struct PendingShot {
  bool exists;
  uint32 moveId;
  address attacker;
  address defender;
  uint8 cellIndex;
  uint256 resultCtHash;
  uint256 sunkShipCtHash;
  uint64 submittedAt;
}

mapping(uint256 matchId => PendingShot) private pendingShots;
```

Field notes:

- `exists` prevents multiple unresolved shots; `ResolvingShot` status
  blocks new attacks anyway.
- `resultCtHash` and `sunkShipCtHash` are the `euint8` handles whose
  plaintexts the CoFHE network posts on-chain; finalization reads them with
  `FHE.getDecryptResultSafe`. Handles are stored as plain `uint256` - they
  are public identifiers, decryption stays ACL-gated.
- `moveId` rejects stale finalization calls.

When finalized:

- read both decrypt results (revert until ready);
- update `Move.result` and `Move.sunkShipId`;
- update public board masks;
- update match status and turn;
- clear `pendingShot`.

## PendingPlacementValidation (implemented)

```solidity
struct PendingPlacementValidation {
  bool exists;
  uint256 validityCtHash;
  uint64 requestedAt;
}

mapping(uint256 matchId => mapping(address player => PendingPlacementValidation))
    private pendingValidations;
```

Keyed per player in a match-level mapping (not inside `PlayerState`, which
is publicly viewable). A resubmission after an `Invalid` verdict replaces
the entry with a fresh handle, so stale decrypt results cannot finalize a
newer submission.

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

Resolved by the Phase 4 implementation:

- fleet encoding: ship-segment list (`euint8[20]`), ship identity by public
  array position - no encrypted ship ids at all;
- move history: mapping-based with paginated reads;
- `ctHash` type: `uint256` (native CoFHE handle);
- placement validation: dedicated pending struct in a match-level mapping;
- `ReadyToStart`: never stored, transitional only;
- sunk reveal: final attacked cell in `sunkMask` plus public `sunkShipId`;
  full geometry reveal stays post-MVP.

Still unresolved:

- whether bot fields live in the main `Match` or separate mapping (bot mode
  is post-MVP);
- exact timeout values (constants today, tunable by redeployment).

## Next Document

After this data model, write:

- `docs/contract-api.md`

That document should define function signatures, events, custom errors, and state transition requirements using this data model as the base.
