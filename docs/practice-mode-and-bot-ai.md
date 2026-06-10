# Practice Mode and Bot AI

## Purpose

This document describes the practice mode and the computer opponent that exist
in the current build. The bot lives in the frontend (`src/game/bot.ts`) and is
a local practice feature only.

It is a different design from `docs/computer-opponent-design.md`, which
specifies a future backendless on-chain bot. That document forbids
"frontend-only bot logic" - a rule that applies to on-chain bot matches, where
moves must be transactions. The current bot does not violate that rule because
practice mode is entirely local: nothing is at stake, nothing is on-chain, and
the mode is clearly labeled as practice.

## Practice Mode Status

- `Practice vs Bot` is the only enabled mode on the home screen.
- Difficulty (`Easy`, `Normal`, `Hard`) is chosen before the match; the
  default is `Normal`. It cannot be changed mid-match.
- The bot's fleet is auto-placed with the same `autoPlaceFleet` used by the
  player's `Auto Place` button.
- The player always fires first.
- A hit or sunk ship grants another shot. After the player misses, the store
  waits a short randomized delay (about 1.1-1.6 s, for camera swing and
  pacing) and starts the bot's turn.
- The bot keeps firing after hits and sunk ships until it misses or wins. The
  bot has no real "thinking time"; delays between shots are presentation.

Limitations:

- no persistence - leaving the page abandons the match;
- no stats, streaks, or difficulty progression across matches;
- forfeit counts as a defeat, with no confirmation beyond the modal;
- the bot cannot forfeit and never times out.

## Targeting Works from Public Information Only

`chooseBotTarget(defender, difficulty, rnd)` receives the player's board but
reads only information that an honest opponent could know:

- the public shot map (`shots`: untried, miss, hit, sunk);
- which ships are sunk and the lengths of the remaining ships (public in
  classic Battleship: fleet composition is fixed and sunk announcements name
  the ship);
- cells provably empty around sunk ships (`sunkHalo`, a deduction from the
  no-touch rule using only sunk-ship cells).

It never reads the positions of unsunk ships. This is a deliberate
fairness contract: the bot plays the same deduction game a human would.
Any change to `bot.ts` that touches `defender.ships[*].cells` for an unsunk
ship, or `defender.shipAt` outside `sunkHalo`, breaks this rule.

Randomness is injected (`rnd` defaults to `Math.random`), so bot behavior is
fully deterministic under a seeded generator - the basis for the bot tests in
`docs/local-prototype-test-plan.md`.

## Difficulty Behavior

### Easy

Uniform random choice over all untried cells. No follow-up after hits, no
sunk-halo deduction - it can waste shots on provably empty cells. Beatable by
most players; good for a first match.

### Normal

A classic hunt/target bot:

- Target mode - when open hits exist (hit cells of not-yet-sunk ships):
  - two or more collinear adjacent hits: aim at the open ends of that line
    first;
  - otherwise: try the orthogonal neighbors of the open hits;
  - among the candidate cells, the choice is uniform random.
- Hunt mode - otherwise: uniform random over untried cells, excluding
  sunk-halo cells.

### Hard

A placement-counting heatmap, recomputed every shot:

- for each remaining ship length, every legal horizontal and vertical
  placement consistent with the public shot map is enumerated (placements
  crossing a miss, a sunk cell, or a halo cell are discarded);
- each placement adds weight to the untried cells it covers; placements that
  overlap open hits are weighted 50x per overlapped hit, so explaining
  existing hits dominates the hunt;
- the bot fires at the highest-weight untried cell, breaking ties randomly.

This subsumes parity search: with only long ships remaining, cells that no
legal placement covers naturally score zero. A fallback returns to Normal's
neighbor follow-up if the heatmap somehow assigns no weight while open hits
exist.

Hard is strong but not perfect: it does not simulate ship-identity
constraints (which specific ship occupies which hit line) and its weighting
is heuristic, so determined players can still beat it.

## Why the Local Bot Is Not Production-authoritative

The bot must never be treated as an authoritative opponent for anything with
stakes (rankings, rewards, on-chain results):

- it runs in the player's browser - the player controls the runtime, can
  read all state (`window.__store` is even exposed in dev builds), and can
  modify the code;
- `Math.random` is not verifiable or reproducible after the fact;
- there is no transaction trail; results exist only in page memory;
- the "public information only" rule is a courtesy enforced by code review,
  not by cryptography - unlike the on-chain design, where Fhenix keeps the
  player's fleet encrypted even from the bot logic.

Practice results therefore stay local and unrecorded.

## Migration Options

Three paths forward, not mutually exclusive:

1. Pure PvP MVP first (recommended, matches
   `docs/computer-opponent-design.md`): ship wallet + friend matches without
   any on-chain bot. Keep the local practice mode as a free, walletless
   onboarding and testing mode - it remains valuable even after PvP ships.
2. Backendless on-chain bot later: implement `BotMatch` with permissionless
   `executeBotMove()` per `docs/computer-opponent-design.md`. The local
   difficulties map unevenly:
   - `Easy` (random over untried cells) is directly implementable on-chain;
   - `Normal` (hunt/target with compact strategy state) is feasible;
   - `Hard`'s heatmap enumerates ~340 placements per shot and is likely too
     gas-expensive; it would be approximated or dropped on-chain.
3. Keep both: local bot for instant practice, on-chain bot for players who
   want practice results recorded. The home screen already separates
   `Practice vs Bot` from the disabled PvP entries, so the menu shape
   supports this.

## Related Documents

- `docs/current-playable-build.md` - overall scope of the practice build.
- `docs/local-game-engine.md` - rules the bot plays under, including
  `sunkHalo`.
- `docs/computer-opponent-design.md` - the future backendless on-chain bot.
- `docs/local-prototype-test-plan.md` - deterministic bot test plan.
