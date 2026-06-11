# Copy and UI Implementation Sync

## Purpose

This document separates the English copy used by the playable local practice
build from the wallet-first on-chain copy in `docs/copy-deck.md`.

The current UI is intentionally smaller than the target product. It has no
wallet, network, match creation, transaction, or Fhenix runtime states yet.

## Sources of Truth

Use these sources in this order:

1. `src/ui/` and `src/state/store.ts` describe strings shipped by the current
   playable build.
2. This document explains why those strings differ from the target flow.
3. `docs/copy-deck.md` defines approved copy for the future on-chain product.
4. `docs/interface-and-buttons-guide.md` defines screen hierarchy and button
   behavior.

Do not replace a working practice-mode label with target on-chain copy before
the corresponding feature exists.

## Current Home Screen

The local build opens directly on the practice menu. There is no onboarding or
wallet gate.

Current visible copy:

| UI element | Current string | Status |
| --- | --- | --- |
| Kicker | `Tactical FHE Naval Ops` | Brand flavor; may remain |
| Title | `Encrypted Battleship` | Matches the product placeholder |
| Tagline | `Hide your fleet. Sink theirs first.` | Current and target-safe |
| Difficulty label | `Bot Difficulty` | Practice-only |
| Difficulty values | `Easy`, `Normal`, `Hard` | Practice-only |
| Primary action | `Practice vs Bot` | Practice-only and intentionally primary |
| Action | `Play Against Friend` | Live since Phase 5; routes to friend match creation |
| Disabled action | `Open Match` | Target public match entry, post-MVP |
| Help action | `How It Works` | Current and target-safe |
| Build note | `On-chain friend matches run on Arbitrum Sepolia.` | Implementation disclosure |

The disabled Open Match button uses the tooltip:

- `Open matchmaking coming soon`

Rules:

- keep disabled post-MVP actions visibly disabled;
- do not imply that a local bot result is an on-chain match result.

Since Phase 5 the wallet-first copy (onboarding, main menu `Command Deck`,
`Invite Friend` creation, join/waiting/cancelled/expired match states,
transaction states, and explorer labels) ships from typed modules in
`src/copy/en.ts`, sourced from `docs/copy-deck.md`.

## Current How-It-Works Copy

The current overlay explains only rules that are playable now:

- `Place your fleet in secret on a 10×10 grid. Ships never touch, even diagonally.`
- `Fire at the enemy grid. Hit or sink to shoot again; a miss passes the turn.`
- `Sink the entire enemy fleet before the bot finds yours.`
- `In the on-chain version, fleets stay encrypted with Fhenix and every move is a transaction. This build plays the same rules locally.`

The final line is future-looking disclosure, not a claim that Fhenix or
transactions run in the current build.

## Current Placement Copy

Current placement labels:

- `Deploy Fleet`;
- `{placed}/{fleet size} placed · tap a ship chip, then the board`;
- `Rotate · Horizontal`;
- `Rotate · Vertical`;
- `Auto Place`;
- `Clear`;
- `Confirm Fleet`.

The current fleet labels come from `src/game/constants.ts`. These labels are
implementation data and should not be duplicated in a component-specific copy
table.

Differences from the target copy deck:

- `Deploy Fleet` is used instead of `Place Your Fleet`;
- `Clear` is used instead of `Reset`;
- `Confirm Fleet` starts a local match immediately;
- there are no `Encrypting Fleet`, wallet confirmation, submission, or
  validation states.

## Current Battle Copy

Current battle states and actions:

- `Your Turn`;
- `Opponent Turn`;
- `Resolving Shot`;
- `Match Over`;
- `Move {number}`;
- `Enemy fleet`;
- `Your fleet`;
- `Select a target cell`;
- `Fire at {coordinate}`;
- `Forfeit Match`;
- `Abandon ship? The match counts as a defeat.`;
- `Cancel`;
- `Forfeit`.

Current result toasts:

- `Miss`;
- `Hit`;
- `Sunk — enemy {ship} destroyed`;
- `Sunk — your {ship} is lost`.

These are immediate local-engine states. The on-chain UI must add transaction
and Fhenix pending states between target confirmation and final resolution.

## Current Game-Over Copy

Current result copy:

- `Match forfeited`;
- `All ships down`;
- `Victory`;
- `Defeat`;
- `Moves`;
- `Your accuracy`;
- `Bot accuracy`;
- `Ships left`;
- `Enemy ships left`;
- `Play Again`;
- `Main Menu`.

The current summary is calculated from local match memory. Future PvP summary
copy may remain similar, but values must come from contract-derived public
state.

## Loading and Accessibility Copy

Current loading labels:

- `Loading Battlefield`;
- `Loading Models — {percent}%`.

Current icon-only accessibility labels:

- `Back`;
- `Forfeit`;
- `Mute sound`;
- `Unmute sound`.

Every future icon-only control must have an English accessible name. Tooltip
text alone is not a replacement for an accessible name.

## Strings That Must Arrive With Features

Add copy only when the owning feature is implemented:

| Feature | Copy source |
| --- | --- |
| Privy connection and account state | `docs/copy-deck.md` wallet section |
| Arbitrum Sepolia guard | `docs/copy-deck.md` network section |
| Friend match creation and join | friend-match sections |
| Fleet encryption and submission | fleet-placement pending states |
| Contract transactions | transaction status section |
| Contract/Fhenix errors | mapped error sections |

Raw provider, RPC, Privy, viem, Solidity, or CoFHE errors must be mapped to
approved English copy before display.

## Future Copy Module

The current component-local strings are acceptable for the small prototype.
Before wallet and match routes are added, move shared player-facing copy into a
typed module such as:

```txt
src/
  copy/
    en.ts
    errors.ts
```

Recommended first migrations:

- shared navigation labels;
- wallet and network states;
- transaction states;
- contract error mappings;
- loading and retry labels;
- accessibility labels;
- practice-mode disclosure.

Dynamic strings should be formatter functions rather than concatenated text,
for example `fireAt(cellLabel)` and `moveNumber(move)`.

## English-Only Verification

Before merging UI work:

1. Review changed `.tsx`, `.ts`, and documentation files for non-English
   player-facing text.
2. Search for new inline strings in `src/ui`, `src/state`, and route
   components.
3. Check visible labels, tooltips, toasts, modal copy, loading states, and
   `aria-label` values.
4. Verify that technical errors are mapped rather than shown raw.
5. Run the app at a mobile viewport and inspect disabled and pending states.

Non-English source comments are also discouraged because all project
documentation and implementation guidance are maintained in English.

## Related Documents

- `docs/copy-deck.md` - target on-chain copy source.
- `docs/interface-and-buttons-guide.md` - current and target screen behavior.
- `docs/current-playable-build.md` - current implementation scope.
- `docs/network-and-wallet-requirements.md` - future Privy and network states.
