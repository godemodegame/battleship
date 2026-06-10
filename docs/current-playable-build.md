# Current Playable Build

## Purpose

This document is the source of truth for what the game does today. The
repository contains a playable local practice build: a complete
player-versus-bot slice running entirely in the browser, with no backend,
wallet, or chain interaction.

For the target on-chain product, see `docs/project-description.md` and
`docs/technical-architecture.md`. This document describes only the build that
exists now.

## How to Run

```bash
npm install
npm run dev
```

Vite prints a local URL. The dev server listens on the LAN (`server.host` is
enabled in `vite.config.ts`), so a phone on the same network can open the
printed network URL directly.

Other commands:

- `npm run build` - type-checks (`tsc -b`) and produces a production bundle;
- `npm run preview` - serves the production bundle locally.
- `npm test` - runs all Vitest suites;
- `npm run test:unit` - runs game and store tests;
- `npm run test:screen` - runs React screen smoke tests;
- `npm run test:e2e` - runs desktop and mobile Chromium practice flows.

There are no environment variables, accounts, or services to configure.

## Current Screen Flow

The app is a single React tree with one persistent 3D canvas. The active
screen is a Zustand field (`screen` in `src/state/store.ts`), not a router:

```
home -> placement -> battle -> gameover
         ^               |        |
         |               |        +-- Play Again --> placement
         +-- Back --------+        +-- Main Menu --> home
```

- `home` - title, bot difficulty selector, practice entry, disabled PvP
  actions, and a `How It Works` modal. The 3D backdrop shows drifting hero
  ships around the encrypted core prop.
- `placement` - top-down view of the player's board for manual or automatic
  fleet placement.
- `battle` - both boards in the scene; the camera swings between the enemy
  board (your attack) and your board (the bot's reply).
- `gameover` - victory/defeat panel with the match summary.

Leaving the battle is only possible by forfeiting (flag icon, confirmed in a
modal), which counts as a defeat.

## Practice-versus-Bot Scope

The only playable mode is a local match against a computer opponent:

- difficulties `Easy`, `Normal`, and `Hard`, chosen on the home screen
  (default `Normal`);
- the bot targets using public shot results only - it never reads your ship
  positions (see `docs/practice-mode-and-bot-ai.md`);
- the player always fires first;
- a hit or sunk ship grants another shot; a miss passes the turn;
- classic rules: 10x10 board, 10-ship fleet (1x4, 2x3, 3x2, 4x1), no-touch
  placement (see `docs/local-game-engine.md`).

## What Is Simulated Locally

Everything that the on-chain version delegates to a contract is simulated in
browser memory:

- the opponent is a local bot, not another player;
- the opponent fleet is auto-placed at battle start;
- attack resolution, turn order, and win detection run in
  `src/game/engine.ts` inside the page;
- match state lives in a Zustand store and is lost on page refresh - there is
  no persistence, reconnect, or resume;
- "hidden" enemy ships are hidden only visually; the full match state exists
  in client memory and is inspectable in dev tools (`window.__store` is
  exposed in dev builds).

The only persisted value is the sound mute toggle (`localStorage` key
`eb-muted`).

## What Is Intentionally Disabled

The home screen shows the on-chain entry points as disabled buttons so the
final menu shape is already visible:

- `Play Against Friend` - disabled, tooltip `On-chain PvP coming soon`;
- `Open Match` - disabled, same tooltip.

A footnote marks the build explicitly: `Local practice build - on-chain PvP
on Arbitrum Sepolia coming soon.`

There is no wallet connect button anywhere yet; wallet connection (Privy) and
the Arbitrum Sepolia network guard arrive with the on-chain milestone.

## Key Controls

Everything is tap-first and works the same with a mouse:

Placement:

- tap a ship chip in the tray to select it, then tap a board cell to place
  the ship (the tapped cell is the bow; the ship extends right when
  horizontal, down when vertical);
- `Rotate` toggles the placement orientation (`Horizontal`/`Vertical`);
- on pointer devices, a ghost preview shows validity (cyan valid, red
  invalid) while hovering;
- tap an already-placed ship to pick it up again;
- `Auto Place` places the full fleet randomly; `Clear` empties the board;
- `Confirm Fleet` is enabled only when all 10 ships are placed validly.

Battle:

- tap an unattacked enemy cell to select it (gold selection frame), then tap
  `Fire at <cell>`;
- cells already attacked, and cells dimmed by the sunk-ship halo deduction,
  are not selectable;
- the flag icon opens the forfeit confirmation; the speaker icon mutes and
  unmutes sound on every screen.

## Known Limitations

- No persistence: a refresh or tab close abandons the match.
- The player always moves first; there is no coin flip.
- The bot's fleet uses the same auto-placement as the `Auto Place` button -
  placement style is not difficulty-dependent.
- Requires WebGL; there is no fallback renderer or reduced-graphics mode yet.
- Asset loading happens at startup behind a single loading overlay; there is
  no progressive or lazy model loading. Required-asset failures show an
  explicit reload message.
- No PWA/offline support, no orientation lock, no accessibility audit yet.

## How This Prototype Maps to the On-chain Version

The local build deliberately mirrors the contract design so logic can migrate
instead of being rewritten:

- placement validation (`canPlace`, `isFleetComplete` in `src/game/board.ts`)
  implements the same fleet and no-touch rules the contract will enforce on
  encrypted placements;
- attack resolution (`applyAttack` in `src/game/engine.ts`) matches the
  contract turn model: a hit or sunk ship keeps the turn, a miss passes it,
  and the last sunk ship wins;
- the Zustand store stands in for contract state plus events - the planned
  migration replaces store mutations with transactions and store reads with
  contract-event-derived state (see `docs/frontend-architecture.md`);
- the bot is practice-only and is not part of the on-chain MVP
  (`docs/computer-opponent-design.md` covers the future on-chain bot idea);
- screens, controls, copy shape, and the 3D scene carry over unchanged in
  structure; on-chain additions are wallet connection (Privy), match
  creation/joining, and transaction/confirmation states.

## Related Documents

- `docs/local-game-engine.md` - exact rules implemented by the local engine.
- `docs/practice-mode-and-bot-ai.md` - bot behavior and limitations.
- `docs/runtime-asset-pipeline.md` - where runtime 3D assets come from.
- `docs/game-mechanics.md` - base rules of the product.
