# Local Game Engine Specification

## Purpose

This document specifies the rules implemented by the local game engine so they
do not drift from the on-chain design. The engine is pure TypeScript with no
React or Three.js dependencies:

- `src/game/types.ts` - shared types;
- `src/game/constants.ts` - board size, fleet, coordinate helpers;
- `src/game/board.ts` - placement rules;
- `src/game/engine.ts` - match state and attack resolution;
- `src/game/bot.ts` - practice bot (documented in
  `docs/practice-mode-and-bot-ai.md`).

All randomness is injected (`rnd: () => number = Math.random`), so every rule
below is deterministic and unit-testable.

## Board Indexing and Coordinate Labels

- The board is 10x10 (`BOARD_SIZE = 10`, `CELL_COUNT = 100`).
- A cell is a single integer `0..99`: `cell = row * 10 + col`.
- `row 0, col 0` is cell `0`; rows grow downward, columns grow rightward in
  board space.
- Player-facing labels combine a column letter and a 1-based row number:
  columns `A..J` map to `col 0..9`, rows `1..10` map to `row 0..9`. Cell `0`
  is `A1`; cell `99` is `J10` (`cellLabel` in `src/game/constants.ts`).
- The 3D scene mirrors this layout: `cellPosition` in `src/three/models.ts`
  centers the grid on the board origin with one world unit per cell.

## Fleet Definition and Model Mapping

`FLEET` in `src/game/constants.ts` is the classic 10-ship fleet (1x4, 2x3,
3x2, 4x1). Each ship has a fixed `slot` (array index, the ship's identity),
a `classId` (which 3D model it uses), a `length`, and a display `label`:

| Slot | Class id      | Length | Label       |
| ---- | ------------- | ------ | ----------- |
| 0    | `carrier`     | 4      | Carrier     |
| 1    | `battleship`  | 3      | Battleship  |
| 2    | `cruiser`     | 3      | Cruiser     |
| 3    | `destroyer`   | 2      | Destroyer   |
| 4    | `submarine`   | 2      | Submarine   |
| 5    | `destroyer`   | 2      | Destroyer   |
| 6-9  | `patrol-boat` | 1      | Patrol Boat |

Notes:

- the four-cell flagship uses the `carrier` model per
  `assets/3d-models/README.md`, and the two three-cell ships use distinct
  models (`battleship`, `cruiser`) purely for visual variety;
- `classId` maps to runtime models through `SHIP_MODEL` in
  `src/three/models.ts` (`carrier` -> `ship-carrier.fbx`, and so on);
- rules care only about `slot` and `length`; `classId` and `label` are
  presentation.

## Placement

A placement is `{ slot, row, col, orientation }` with orientation `'h'` or
`'v'`. The placed cell is the bow; the ship extends rightward (`col + i`)
when horizontal and downward (`row + i`) when vertical.

`shipCells` (`src/game/board.ts`) returns the covered cells, or `null` when
any cell would leave the board.

### Validation and the No-touch Rule

`canPlace(placements, candidate)` accepts a candidate placement when:

1. every cell is on the board, and
2. no cell in the candidate's 3x3 neighborhood (the candidate cells plus all
   eight neighbors of each, clipped at edges) is occupied by another ship.

The candidate's own slot is excluded from the occupancy check, so `canPlace`
also re-validates or moves an already-placed ship. This is the classic
no-touch rule: ships may never touch, not even diagonally.

`isFleetComplete(placements)` requires all 10 slots placed and every
placement mutually valid; it gates the `Confirm Fleet` button.

### Auto Placement

`autoPlaceFleet(rnd)` retries up to 100 board attempts; each attempt places
ships longest-first with up to 300 random `(row, col, orientation)` tries per
ship. The first fully valid board wins. With this fleet on a 10x10 board a
valid layout is found virtually always; exhausting all attempts throws
`Auto placement failed`. Both the player's `Auto Place` button and the bot's
fleet use this function.

## Match State

`buildBoard(placements)` expands placements into a `BoardState`:

- `ships` - per ship: covered `cells`, a `hitMask` bitfield (bit `i` is hit
  on `cells[i]`), and a `sunk` flag;
- `shipAt` - 100-entry lookup of ship index per cell (`-1` when empty);
- `shots` - 100-entry `CellShot` array: `0` untried, `1` miss, `2` hit,
  `3` part of a sunk ship.

`createMatch(playerPlacements, botPlacements, firstTurn = 'player')` builds
both boards. The practice build always lets the player fire first; the
parameter exists so a coin-flip or contract-decided first turn drops in
without engine changes.

## Attack Resolution

`applyAttack(match, by, cell)` is the single rule entry point. It throws
`Invalid attack` when the match is over, it is not `by`'s turn, or the target
cell was already attacked - mirroring the reverts the contract will use.

Resolution (`applyShot`):

- empty cell: `shots[cell] = 1`, result `miss`;
- ship cell: the matching bit is set in the ship's `hitMask`; when the mask
  covers the full length the ship sinks - every cell of the ship flips to
  `shots = 3` (including earlier `2` hits) and the result is `sunk`,
  otherwise the cell becomes `2` and the result is `hit`;
- the result and the sunk ship's `slot` are recorded as a `Move`
  (`{ by, cell, result, shipSlot }`) and appended to `match.moves`.

State is never mutated: every attack returns a new `MatchState`.

### Turn Passing

Per `docs/game-mechanics.md`, the turn passes to the defender after every
valid attack, hit or miss - there is no extra shot on a hit. The single
exception is the winning shot: when the last ship sinks, `winner` is set and
the turn does not pass (the match is over).

### Win Condition

`allSunk(board)` - the attacker wins the moment every defender ship is sunk.
The local build also supports forfeit: the store sets `winner: 'bot'`
directly when the player forfeits; forfeit is UI-level, not an engine rule.

## Sunk-ship Halo Deduction

`sunkHalo(board)` returns every cell adjacent (including diagonals) to a sunk
ship's cells, excluding the ship's own cells. Under the no-touch rule those
cells are provably empty, so the deduction uses public information only -
exactly what an observer of shot results could infer.

It is used twice:

- the enemy board dims halo cells and refuses to select them
  (`src/three/Scene.tsx`);
- `Normal` and `Hard` bots exclude halo cells from their target pool.

## Game-over Summary

`matchSummary(match, forfeited)` in `src/state/store.ts` derives the
game-over panel values from the move list:

- `turns` - total moves by both sides;
- per side: shot count, accuracy (`hits + sunk` over shots, rounded to a
  whole percent, `0` when no shots), and ships still afloat;
- `winner` and whether the loss came from forfeit.

Nothing is stored beyond the match state; every stat is recomputed from
`moves` and `boards`.

## Production Logic versus Prototype-only Logic

Production game logic (must match the future contract; changes here are rule
changes and need design review):

- board indexing and the 10-ship fleet definition;
- `shipCells`, `canPlace`, `isFleetComplete` (placement and no-touch rules);
- `applyAttack` semantics: validity checks, miss/hit/sunk resolution, turn
  passing after every attack, win on last sunk ship.

Prototype-only logic (free to change, will not move on-chain):

- the bot and its difficulties;
- auto-placement of the opponent fleet;
- `firstTurn` defaulting to the player;
- `sunkHalo` (a client-side deduction helper - the contract never needs it);
- `matchSummary`, forfeit handling, and all store orchestration (effect
  timing, camera focus, toasts).

## Related Documents

- `docs/current-playable-build.md` - what the build does overall.
- `docs/practice-mode-and-bot-ai.md` - bot targeting rules.
- `docs/game-mechanics.md` - product-level rules.
- `docs/smart-contract-design.md` - the on-chain counterpart of this engine.
