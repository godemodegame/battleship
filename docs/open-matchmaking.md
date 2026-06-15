# Open / Random Matchmaking

Fully on-chain random matchmaking: a player hosts an **open match** that any
other wallet can join, then the two play the identical encrypted battle. No
backend, no indexer — discovery is a paginated on-chain view.

Branch: `feat/open-random-matchmaking`.

## How it works

`MatchType.Open` (already reserved in the enum) is now reachable:

- **Host** — `createOpenMatch()` / `createOpenWithFleet(segments)` create a
  match with `matchType = Open` and `invitedOpponent = address(0)`, and push it
  onto a public `openMatchIds` index.
- **Discover** — `getOpenMatches(offset, limit)` / `getOpenMatchCount()` page
  that index (the matchmaking lobby).
- **Join** — `joinMatch` / `joinWithFleet` now accept *any* non-creator when
  `matchType == Open` (the `NotInvitedOpponent` check is gated on `Friend`). The
  match is swap-popped out of `openMatchIds` the moment it is joined or
  cancelled, so the lobby only ever lists currently-joinable games.

Everything after the join — encrypted fleet validation, the shot pipeline,
turn order (joiner moves first), forfeit/timeout — is unchanged and was already
match-type-agnostic. Friend matches are completely unaffected.

## What changed

### Contract (`contracts/contracts/BattleshipGame.sol`)
- `_createMatchBase(MatchType, address)` — parameterized; skips the
  invited-opponent / self-invite guards for `Open`.
- `createOpenMatch()`, `createOpenWithFleet(InEuint8[20])` — new entrypoints.
- `_joinMatchBase` — `NotInvitedOpponent` now only fires for `Friend`; joined
  open matches are removed from the index.
- `cancelMatch` — removes cancelled open matches from the index.
- `openMatchIds` array + `openMatchIndex` map + `_addOpenMatch` / `_removeOpenMatch`
  (swap-pop, O(1)).
- `getOpenMatches(offset, limit)`, `getOpenMatchCount()` — paginated lobby views
  (same `MAX_PAGE_LIMIT` bound as `getPlayerMatches`).

No new events or errors: open creation emits `MatchCreated(id, creator, 0x0)`;
creator self-join still reverts `CreatorCannotJoinOwnMatch`.

### Frontend
- `src/onchain/client/battleshipClient.ts` — `createOpenMatch` /
  `createOpenWithFleet` writes, `getOpenMatches` / `getOpenMatchCount` reads.
- `src/onchain/useOpenMatches.ts` — lobby hook (cloned from `useMatchList`;
  re-reads from the front each load since the open set shrinks; filters out the
  viewer's own / taken / expired matches).
- `src/onchain/phaseResolver.ts` — `WaitingForOpponent` yields `join` for any
  non-creator on an `Open` match (in addition to the invited wallet on `Friend`).
- `src/onchain/match/OpenMatchLobbyScreen.tsx` — the "Find a Game" lobby
  (`/lobby`): Quick Match (oldest joinable game, or host if empty), a browsable
  list of open games, and the viewer's own open game.
- `src/onchain/match/CreateFriendMatchScreen.tsx` — now `mode`-parameterized;
  exports `CreateOpenMatchScreen` (`/match/open`, no address input).
- Open-aware copy in `JoinWithFleetPanel` ("Join Open Game"), `InviteWaitingPanel`
  ("Waiting for a Challenger"), and `src/copy/en.ts` (`lobbyCopy`, `openMatchCopy`).
- `HomeScreen` — the formerly-disabled "Open Match" button is now a live
  **Find a Game** entry routing to `/lobby`.
- `src/onchain/e2e/E2EMockProviders.tsx` — simulates open create/discover/join
  across the two-tab harness.

## Test coverage
- Contract: `battleshipGame.test.ts` (`open matchmaking` block) + `encryptedRules.test.ts`
  (`open match` block, incl. a full battle-to-Win). `npm --prefix contracts test` → **155 passing**.
- Frontend: `phaseResolver.test.ts`, `useOpenMatches.test.tsx`, updated `screens.test.tsx`.
  `npm run test:unit` + `npm run test:screen` → **424 passing**.
- E2E: `tests/e2e/open-match.spec.ts` (host → discover → join against mocks).

## Release procedure (staging-v4) — REQUIRED before going live

Open matchmaking changes the ABI, so it **cannot run on the active
`arb-sepolia-staging-v3` contract** (it lacks the new functions). The frontend
ABI has already been regenerated (`BATTLESHIP_GAME_ABI_SHA256` updated), so
`npm run verify:release` will fail until a matching deployment is cut. Deploy a
new contract version — this needs the deployer key and is the user's to run:

1. `cd contracts && npm run generate:abi` — already done on this branch; re-run if
   the contract changes again.
2. `DEPLOYMENT_ID=arb-sepolia-staging-v4 npm run deploy:arb-sepolia`
   (writes `contracts/deployments/421614/arb-sepolia-staging-v4.json`).
3. `node scripts/sync-deployment-manifest.mjs contracts/deployments/421614/arb-sepolia-staging-v4.json`
   then manually flip `arb-sepolia-staging-v3` from `active` → `retired` in
   `src/onchain/deploymentManifest.json` so v4 is the sole active record (old
   match links keep resolving read-only against v3).
4. Bump `DEFAULT_DEPLOYMENT_ID` to `arb-sepolia-staging-v4` in
   `src/onchain/deployments.ts` **and** the matching fallback literal in
   `scripts/verify-release.mjs` (both must change together).
5. `npm run verify:release` to confirm ABI/hash/manifest consistency.

Until step 4 lands, leave `DEFAULT_DEPLOYMENT_ID` on staging-v3; the "Find a
Game" lobby will surface a read error against the old contract (expected — the
feature ships together with staging-v4).

## Follow-ups (not blocking, noted from the design review)
- Anti-grief: open creation is permissionless and gasless (EIP-7702 sponsor), so
  one wallet can flood the lobby with waiting games. Consider a per-creator open
  cap, a small bond, or a permissionless "expire" that prunes
  `joinDeadline`-lapsed entries. Out of scope for staging.
- Join race: two players can target the same open game; the second reverts
  `OpponentAlreadyJoined`. The lobby refetches; surfacing a "taken — try another"
  toast on that specific revert would polish the UX.
