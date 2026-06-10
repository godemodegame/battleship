# Local Prototype Test Plan

## Purpose

`docs/testing-strategy.md` targets the future on-chain MVP. This plan covers
the code that exists now - the local practice build - so the rules the
contract will later mirror are locked down by tests before web3 work starts.

Before `GAME-001`, the repository had no automated tests. The test runner
foundation is now present; the behavior coverage in this plan is the remaining
milestone 0 work referenced by the testing strategy.

## Implemented Stack and Setup

- Vitest for unit tests (`src/game/*` is pure TypeScript with injected
  randomness, so no DOM or mocks are needed);
- Vitest + React Testing Library + jsdom for screen smoke tests, with the 3D
  canvas mocked out;
- Playwright for browser smoke and regression runs against `npm run dev`.

The foundation is implemented by `GAME-001` with `vitest`,
`@testing-library/react`, `@testing-library/user-event`, `jsdom`, and
`@playwright/test`. Available commands:

```txt
npm test
npm run test:watch
npm run test:e2e
npm run test:e2e:install
```

Playwright is configured for the required desktop `1280x800` and mobile
`390x844` Chromium viewports. Feature-level unit, screen, and browser tests
remain assigned to `GAME-002` through `GAME-009`.

A tiny seeded RNG (for example mulberry32) belongs in a shared test util;
every `rnd` parameter in the game layer accepts it.

## Unit Tests: `src/game/board.ts`

`shipCells`:

- horizontal and vertical coverage for each fleet length;
- `null` when the ship would cross any of the four board edges;
- `null` for negative coordinates.

`canPlace` (the no-touch rule):

- accepts a valid placement on an empty board;
- rejects direct overlap;
- rejects orthogonal adjacency and diagonal adjacency;
- accepts two ships separated by one empty row or column;
- excludes the candidate's own slot, so re-validating or moving an existing
  ship does not collide with itself;
- rejects off-board candidates.

`isFleetComplete`:

- true for a known-good 10-ship layout;
- false when any slot is missing, when two ships touch, or when the array
  length is wrong.

`autoPlaceFleet` (seeded):

- returns 10 placements that pass `isFleetComplete`;
- is deterministic for a fixed seed;
- property check: several hundred seeds in a loop all produce complete
  fleets (guards the retry-budget assumptions).

## Unit Tests: `src/game/engine.ts`

`buildBoard`:

- `cells`, `shipAt`, and `shots` are mutually consistent for a fixture
  fleet;
- throws on an off-board placement.

`applyAttack` rules (each mirrors a future contract revert or transition):

- miss marks the cell `1` and passes the turn;
- hit marks the cell `2` and keeps the turn with the attacker;
- the final hit on a ship flips every ship cell to `3` (including earlier
  `2` cells), reports `sunk` with the ship's slot, and keeps the turn;
- sinking the last ship sets `winner` and ends the match;
- throws `Invalid attack` when: it is not the attacker's turn, the cell was
  already attacked, or the match already has a winner;
- immutability: the input `MatchState` is unchanged after an attack.

`sunkHalo`:

- empty when nothing is sunk;
- a sunk one-cell ship halos its (up to) 8 neighbors, clipped at edges;
- halo excludes the ship's own cells;
- with a valid no-touch fleet, halo cells never contain another ship.

`matchSummary` (in `src/state/store.ts` but pure):

- move counts and ships-left per side from a scripted move list;
- accuracy is hits-plus-sunk over shots, rounded, and `0` for zero shots;
- forfeit flag passes through.

## Deterministic Bot Tests: `src/game/bot.ts`

All difficulties (seeded `rnd`):

- never returns an already-attacked cell, across full scripted games;
- throws only when no untried cell remains.

Public-information invariant (the fairness contract from
`docs/practice-mode-and-bot-ai.md`):

- build two boards with identical `shots` maps and identical sunk ships but
  different hidden (unsunk) ship positions; with the same seed, every
  difficulty must pick the same target on both boards.

`easy`:

- distribution sanity: over many seeds, choices cover the untried set;
- ignores halo cells (it may target them) - asserts the documented
  behavior, not a bug.

`normal`:

- after a single open hit, the next target is one of its orthogonal
  untried neighbors;
- with two collinear adjacent hits, the next target is one of the two open
  line ends;
- in hunt mode, never targets a sunk-halo cell while non-halo cells remain.

`hard`:

- never targets misses, sunk cells, or halo cells;
- with an open hit, the next shot is adjacent to it (the 50x weighting must
  dominate the heatmap);
- regression: a scripted mid-game board has a known best cell for a fixed
  seed - pin it to catch unintended strategy changes;
- benchmark-style check: across a fixed seed set, `hard` finishes a random
  board in fewer average shots than `easy` (broad inequality, not a tight
  bound).

## Store Orchestration Tests

With fake timers (Vitest) and the real engine:

- `fire()` returns control after a player hit, or after a player miss runs bot
  replies until the bot misses or wins, then clears `busy`;
- `fire()` is a no-op when busy, when it is not the player's turn, or when
  the cell is already attacked;
- a player win skips the bot reply and moves to `gameover`;
- `forfeit()` mid-flight aborts the pending sequence (the `interrupted`
  guard) and sets `winner: 'bot'`, `forfeited: true`;
- `rematch()` returns to placement with cleared placements, effects, and
  projectiles;
- `confirmFleet()` refuses incomplete fleets.

## React Screen Smoke Tests

Mock `GameCanvas` (the WebGL scene) and drive the Zustand store directly:

- HomeScreen: difficulty radio reflects and updates the store; `Practice
  vs Bot` starts placement; `Play Against Friend` and `Open Match` are
  disabled; `How It Works` opens and closes;
- PlacementScreen: chip selection, placed count, `Rotate` label flips
  orientation, `Clear` disabled at zero, `Confirm Fleet` enabled only when
  `isFleetComplete`;
- BattleHUD: status label for your turn / resolving / opponent turn; fire
  button disabled without a selected cell and shows `Fire at <label>` with
  one; forfeit modal confirm and cancel paths;
- GameOverScreen: `Victory` and `Defeat` variants, forfeit kicker, stats
  grid values from a scripted match;
- LoadingOverlay: visible while loading, gone after progress completes.

## Playwright Smoke and Regression

Viewports: desktop (1280x800) and mobile (390x844) for every run.

Canvas non-blank check:

- after the loading overlay disappears, screenshot the canvas and assert it
  is not a single flat color (home scene must render geometry within the
  load budget from `docs/mobile-performance-budget.md`).

Regression flows - driven through `window.__store` (exposed in dev builds)
for determinism, with a handful of raw canvas taps kept to cover real input:

1. Placement: auto-place, confirm, battle HUD appears; manual flow places
   one ship by tapping the board (raw tap), rotates, picks it back up.
2. Attack: select a cell via store, fire, assert a move was appended and
   the toast appeared.
3. Sunk: script a match where the next shot sinks a ship; assert halo
   cells become unselectable (store `selectCell` refuses them).
4. Win: drive shots to victory; assert `gameover` screen with `Victory`.
5. Forfeit: forfeit mid-match; assert `Defeat` with the forfeit kicker.
6. Rematch: `Play Again` returns to placement with an empty board.
7. Mute persistence: toggle mute, reload, assert `localStorage.eb-muted`
   and the icon state.

## What Is Out of Scope Here

- contract, Fhenix, and wallet tests (`docs/testing-strategy.md` milestones
  1+);
- visual regression of the 3D scene beyond non-blank checks;
- performance budgets (procedure lives in
  `docs/mobile-performance-budget.md`).

## Suggested CI Order

1. `tsc -b` (already part of `npm run build`);
2. Vitest unit + store tests;
3. RTL screen smoke tests;
4. English-only scan from `docs/testing-strategy.md`;
5. Playwright smoke (desktop + mobile viewport).

## Related Documents

- `docs/testing-strategy.md` - the on-chain MVP strategy this plan precedes.
- `docs/local-game-engine.md` - the rules under test.
- `docs/practice-mode-and-bot-ai.md` - bot behavior under test.
