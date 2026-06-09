# Frontend Architecture

## Purpose

This document defines how the mobile browser frontend should be structured for the fully on-chain 3D Battleship game.

It translates the project, user flow, contract API, and Fhenix integration documents into an implementable web app architecture.

## Goals

The frontend must support:

- mobile browser first gameplay;
- short onboarding only when no wallet is connected;
- wallet connection;
- Arbitrum Sepolia network enforcement;
- friend match creation and invite links;
- encrypted fleet placement through Fhenix/CoFHE;
- on-chain match state reads and writes;
- event-driven battle updates;
- 3D board interaction;
- a game field loading gate before required models are shown;
- clear transaction and Fhenix pending states;
- recovery after page refresh, wallet app switching, and network changes;
- English-only player-facing text.

## Non-goals

The MVP frontend should not include:

- a centralized gameplay backend;
- server-side hit detection;
- server-side matchmaking;
- native mobile app as the primary client;
- rankings;
- tournaments;
- NFT inventory;
- marketplace;
- chat;
- complex account profile pages.

## Recommended Frontend Stack

Recommended MVP stack:

- Vite React;
- TypeScript;
- React Three Fiber;
- Three.js;
- wagmi;
- viem;
- `@cofhe/sdk`;
- Zustand;
- React Router or TanStack Router;
- GLB assets for runtime 3D models.

Vite React is the recommended first implementation because the MVP is a browser-first interactive game and does not require SSR, API routes, or server-rendered content.

Next.js remains acceptable later if the project needs a larger web presence, built-in routing conventions, preview deployments, or content pages. It should not introduce backend gameplay authority.

## Core Architecture Principle

The frontend is a client, not a referee.

The frontend may:

- collect player input;
- display public match state;
- encrypt player fleet data;
- submit transactions;
- request allowed Fhenix decrypt flows;
- animate board state;
- help the player understand what is pending.

The frontend must not:

- decide hit, miss, sunk, or win results;
- store plaintext enemy data;
- store plaintext fleet data after submission;
- unlock turns locally;
- assume a transaction receipt means Fhenix resolution is complete;
- trust an indexer over contract reads;
- mutate game state outside contract transactions.

## Application Layers

The app should be organized into these layers:

1. App shell and routes.
2. Wallet and network layer.
3. Fhenix client layer.
4. Contract API layer.
5. Event sync layer.
6. Game domain state.
7. 3D scene layer.
8. UI component layer.
9. Asset loading layer.
10. Copy and error mapping layer.

Each layer should have a narrow responsibility. The 3D scene should not import contract write functions directly. Contract writes should flow through dedicated hooks or services.

## Suggested Folder Structure

Recommended structure:

```txt
src/
  main.tsx
  app/
    App.tsx
    providers/
    routes/
  components/
    buttons/
    layout/
    modals/
    status/
  features/
    onboarding/
    menu/
    match/
    fleet/
    battle/
    game-over/
  three/
    BoardScene.tsx
    FleetBoard.tsx
    TargetBoard.tsx
    ShipModels.tsx
    Effects.tsx
    InteractionController.tsx
  web3/
    chains.ts
    wallet.ts
    wagmiConfig.ts
  fhenix/
    cofheClient.ts
    cofheProvider.tsx
    encryption.ts
    permits.ts
    decrypt.ts
  contracts/
    BattleshipGame.abi.ts
    addresses.ts
    reads.ts
    writes.ts
    events.ts
    errors.ts
  stores/
    appStore.ts
    matchStore.ts
    placementStore.ts
    battleStore.ts
    txStore.ts
    fhenixStore.ts
    sceneStore.ts
  assets/
    models/
    textures/
  copy/
    en.ts
  utils/
```

The exact structure can change during implementation, but hidden-state privacy boundaries must remain explicit.

## Routes

Recommended routes:

- `/` - wallet-aware entry route with conditional onboarding and wallet entry.
- `/menu` - main menu after wallet connection.
- `/play` - opponent selection.
- `/match/new` - create a friend match.
- `/match/:matchId` - shared match route for join, placement, waiting, battle, resolving, and game over.
- `/history` - local and on-chain match history.
- `/settings` - graphics, sound, wallet, and network settings.

The invite link should point to:

```txt
/match/:matchId
```

The match route should inspect contract state and route the player to the right phase inside the same screen shell.

## Screen Flow

The frontend should support this MVP flow:

1. `EntryGate`
2. `OnboardingScreen`
3. `WalletScreen`
4. `MainMenuScreen`
5. `OpponentSelectionScreen`
6. `CreateFriendMatchScreen`
7. `FieldLoadingScreen`
8. `FleetPlacementScreen`
9. `InviteFriendScreen`
10. `JoinFriendMatchScreen`
11. `WaitingForOpponentScreen`
12. `BattleScreen`
13. `ResolvingShotScreen`
14. `GameOverScreen`

Screens may be implemented as route components, feature components, or state-driven panels inside `MatchScreen`.

## Entry and Onboarding Gate

The app entry route must be wallet-aware.

Rules:

- if no wallet is connected, show the short onboarding;
- onboarding must end with `Connect Wallet`;
- onboarding should contain no more than three screens;
- if a wallet is already connected, skip onboarding;
- if a connected wallet opens `/`, route to `/menu`;
- if a connected wallet opens `/match/:matchId`, skip onboarding and resolve the match phase directly;
- if the wallet disconnects later, return to the wallet-required state without replaying unnecessary onboarding.

The onboarding completion flag may be stored locally, but wallet connection state takes priority. A connected wallet should not be forced through onboarding.

## Providers

The root app should initialize providers in this order:

1. React error boundary.
2. Router.
3. wagmi wallet provider.
4. Query/cache provider if used.
5. Fhenix provider.
6. App state provider if context is needed.
7. 3D scene root.

The Fhenix provider should wait until wallet and network state are ready before connecting the CoFHE client.

## Wallet and Network Layer

The wallet layer should handle:

- wallet connection;
- wallet disconnect;
- account changes;
- Arbitrum Sepolia detection;
- network switching;
- mobile wallet return handling;
- transaction submission;
- transaction receipt tracking;
- transaction replacement or rejection states.

Required target network:

- Arbitrum Sepolia;
- chain id `421614`.

Player-facing states:

- `Connect Wallet`;
- `Connecting Wallet`;
- `Wallet Connected`;
- `Wrong Network`;
- `Switch to Arbitrum Sepolia`;
- `Confirm in Wallet`;
- `Transaction Submitted`;
- `Transaction Confirmed`;
- `Transaction Failed`.

## Fhenix Client Layer

The Fhenix layer should handle:

- creating the CoFHE browser client;
- connecting viem public and wallet clients;
- reconnecting on account or chain change;
- encrypting fleet placement;
- requesting decrypt flows for transaction finalization;
- managing self permits;
- exposing clear pending states to the UI.

Recommended modules:

- `fhenix/cofheClient.ts` - creates the client.
- `fhenix/cofheProvider.tsx` - connects the client to wallet state.
- `fhenix/encryption.ts` - fleet encryption helpers.
- `fhenix/permits.ts` - permit helpers.
- `fhenix/decrypt.ts` - decrypt-for-transaction helpers.

Important rule:

Plaintext fleet data may exist only in transient local memory before encryption. It must not be written to local storage, indexedDB, analytics, logs, URLs, screenshots, event payloads, or contract calldata.

After encrypted fleet submission succeeds, the placement store should clear the plaintext fleet.

## Contract API Layer

The frontend should wrap contract calls in typed hooks or services.

Recommended read hooks:

- `useMatch(matchId)`;
- `usePlayers(matchId)`;
- `useMove(matchId, moveId)`;
- `useMoveHistory(matchId)`;
- `usePendingShot(matchId)`;
- `usePlayerMatches(address)`.

Recommended write hooks:

- `useCreateMatch()`;
- `useJoinMatch()`;
- `useSubmitFleet()`;
- `useFinalizeFleetValidation()`;
- `useStartMatch()`;
- `useAttack()`;
- `useFinalizeAttack()`;
- `useCancelMatch()`;
- `useForfeit()`;
- `useClaimTimeoutWin()`.

The hook names may change, but every contract function from `docs/contract-api.md` should have one clear frontend integration point.

## Contract Read Strategy

The app should read contract state before rendering sensitive match phases.

Required reads:

- call `getMatch(matchId)` before deciding the match screen phase;
- call `getPlayers(matchId)` before placement, waiting, battle, and game over states;
- call `getPendingShot(matchId)` after refresh and while `status == ResolvingShot`;
- call `getMoveHistory(matchId)` to rebuild the visible battle timeline;
- call `getPlayerMatches(address)` for match history.

Events should trigger refetches. They should not replace contract reads as the source of truth.

## Event Sync Layer

The event sync layer should subscribe to contract events and trigger targeted state refreshes.

Important events:

- `MatchCreated`;
- `MatchJoined`;
- `FleetSubmitted`;
- `FleetValidationRequested`;
- `FleetValidated`;
- `MatchStarted`;
- `ShotSubmitted`;
- `ShotResolutionRequested`;
- `ShotResolved`;
- `TurnChanged`;
- `MatchFinished`;
- `MatchCancelled`;
- `MatchForfeited`;
- `TimeoutWinClaimed`.

Event handling rule:

- update optimistic UI for responsiveness only when safe;
- always refetch the relevant contract read after important events;
- never infer hidden state from event timing;
- handle missed events by refetching on page focus and reconnect.

## State Stores

Recommended Zustand stores:

## App Store

Tracks:

- active route phase;
- modal state;
- onboarding completion;
- graphics quality;
- sound setting;
- haptic setting if supported.

## Match Store

Tracks public match state:

- match id;
- match status;
- creator;
- opponent;
- invited opponent;
- current turn;
- winner;
- move count;
- pending move id;
- public player views.

This store should be rebuilt from contract reads.

## Placement Store

Tracks temporary local placement state:

- selected ship;
- ship orientation;
- local fleet cells;
- local placement validity;
- encryption progress.

Privacy rule:

- clear this store after `submitFleet` succeeds;
- clear this store on wallet account change;
- do not persist this store.

## Battle Store

Tracks local battle UI state:

- selected target cell;
- highlighted cell;
- last resolved move;
- animation state;
- battle camera mode;
- board view mode.

This store is visual only. It must not decide results.

## Transaction Store

Tracks:

- pending transaction type;
- transaction hash;
- confirmation state;
- retry action;
- last error;
- wallet rejection state.

## Fhenix Store

Tracks:

- client readiness;
- encryption status;
- permit status;
- decrypt request status;
- pending CoFHE operation id if available;
- last Fhenix error.

## Scene Store

Tracks:

- camera mode;
- selected board;
- selected cell index;
- hover or focus cell;
- graphics quality level;
- animation intensity.

The scene store may receive match state, but it must not own match state.

## Match Phase Resolution

The `/match/:matchId` route should derive a screen phase from contract reads.

Suggested phase resolver:

```txt
No wallet -> WalletRequired
Wrong network -> WrongNetwork
Match not found -> MatchNotFound
Wallet is invited opponent and not joined -> JoinMatch
WaitingForOpponent -> WaitingForOpponent
WaitingForPlacement and field models not ready -> FieldLoading
WaitingForPlacement and player not submitted -> FleetPlacement
WaitingForPlacement and player submitted -> WaitingForFleet
ValidatingPlacement -> ValidatingPlacement
ReadyToStart -> ReadyToStart
InProgress and field models not ready -> FieldLoading
InProgress and currentTurn == player -> PlayerTurn
InProgress and currentTurn != player -> OpponentTurn
ResolvingShot -> ResolvingShot
Finished -> GameOver
Cancelled -> MatchCancelled
Forfeited -> MatchForfeited
```

This resolver should be pure and easy to test.

## Fleet Placement Flow

Frontend flow:

1. Player arranges ships on the 10 by 10 board.
2. App validates simple placement UX locally.
3. Player taps `Lock Fleet`.
4. App shows `Encrypting Fleet`.
5. Fhenix SDK encrypts the 100-cell representation or chosen batch format.
6. App asks wallet to confirm `submitFleet`.
7. App waits for the transaction receipt.
8. App clears plaintext fleet state.
9. App waits for placement validation.
10. App shows `Fleet Confirmed` or `Fleet Invalid`.

Local validation improves UX only. The contract and Fhenix flow remain authoritative.

## Shot Flow

Frontend flow:

1. Player selects a target cell.
2. App checks public contract state for current turn.
3. Player taps `Fire`.
4. App submits `attack(matchId, cellIndex)`.
5. App enters `Resolving Shot`.
6. App reads pending shot state.
7. App requests or helps finalize the Fhenix decrypt result as required by the contract design.
8. App submits or observes `finalizeAttack`.
9. App refetches match and move history.
10. App plays the public result animation.

The UI must not let the player submit another shot while the match status is `ResolvingShot`.

## Fhenix Pending Recovery

The app must recover from page refresh during Fhenix operations.

On match page load:

1. Read `getMatch(matchId)`.
2. If the match is `ValidatingPlacement`, read player placement states.
3. If the match is `ResolvingShot`, read `getPendingShot(matchId)`.
4. Check whether the connected player is allowed or expected to finalize the pending result.
5. Reconnect the CoFHE client if needed.
6. Resume the required decrypt-for-transaction flow if possible.
7. If another player finalizes first, refetch and continue.

The UI should explain pending states without exposing technical internals.

Player-facing states:

- `Encrypting Fleet`;
- `Validating Fleet`;
- `Resolving Shot`;
- `Publishing Result`;
- `Waiting for Opponent`;
- `Recovering Match State`.

## 3D Scene Architecture

Recommended React Three Fiber components:

- `BoardScene` - canvas scene root.
- `FleetBoard` - player's board and local fleet.
- `TargetBoard` - opponent target grid.
- `ShipModels` - ship model instances.
- `ProjectileTrail` - attack animation.
- `HitEffect` - public hit animation.
- `MissEffect` - public miss animation.
- `SunkEffect` - public sunk marker.
- `TurnToken` - visual turn indicator.
- `InteractionController` - raycast and touch selection.

The 3D layer should receive:

- board size;
- public player board state;
- move history;
- selected cell;
- current turn;
- match phase;
- graphics quality setting.

The 3D layer should emit:

- selected cell index;
- ship placement changes before encryption;
- animation completion events.

The 3D layer must not call contract write functions directly.

## Mobile Rendering Strategy

The MVP should target:

- portrait mobile browser first;
- stable 30 FPS minimum on common phones;
- 60 FPS where possible;
- short initial load;
- no blocking Fhenix encryption on the main thread when workers are available;
- reduced effects on low-power devices;
- safe-area aware layout;
- touch targets of at least 44 by 44 CSS pixels.

Recommended graphics quality levels:

- `Low` - fewer particles, lower shadow quality, simplified water.
- `Medium` - default mobile setting.
- `High` - richer lighting and effects for stronger devices.

The app should default to `Medium` and allow manual override in settings.

## Asset Loading

Assets should load progressively.

Rules:

- keep the first screen light;
- lazy-load battle models after onboarding or wallet connection;
- use `.glb` models;
- compress textures;
- preload only the models needed for the current screen;
- avoid blocking wallet or transaction UI on model loading;
- show `FieldLoadingScreen` before revealing the gameplay field;
- do not render the gameplay field until required board, ship, and screen-specific effect models are loaded;
- allow optional decorative props to load after the gameplay field is visible;
- show a recoverable loading error if required models fail.

The game should never show a partially loaded gameplay field. If required field models are not ready, the player should see a loading screen instead of the board.

## UI Component System

Core reusable components:

- `IconButton`;
- `PrimaryButton`;
- `SecondaryButton`;
- `SegmentedControl`;
- `Toggle`;
- `Slider`;
- `StatusPill`;
- `TransactionSheet`;
- `WalletStatus`;
- `NetworkStatus`;
- `MatchPhaseBanner`;
- `ConfirmActionSheet`;
- `Toast`;
- `Modal`;
- `BottomCommandBar`.

Button labels and UI copy should come from `copy/en.ts` or a future copy deck.

## Error Mapping

The frontend should map contract, wallet, and Fhenix errors into clear English messages.

Examples:

- `Wallet not connected`;
- `Wrong network`;
- `Only the invited player can join`;
- `It is not your turn`;
- `This cell was already attacked`;
- `A shot is still resolving`;
- `Fleet placement is invalid`;
- `Fhenix encryption failed`;
- `Result finalization failed`;
- `Transaction rejected`;
- `Transaction reverted`.

Raw Solidity error names may be logged for developers, but player-facing messages should be readable.

## Invite Links

The friend invite link should include only public match information.

Allowed:

- match id;
- route path;
- optional referral-free UI parameters.

Forbidden:

- plaintext fleet data;
- encrypted fleet payloads;
- private keys;
- permits;
- signatures that grant broad access;
- hidden board metadata.

Example:

```txt
https://game.example/match/123
```

Strict friend invite remains the MVP default. The contract should enforce the invited opponent address.

## Local Persistence

Allowed local persistence:

- onboarding completed flag;
- graphics settings;
- sound settings;
- last used wallet connector if provided by the wallet library;
- recently viewed match ids.

Forbidden local persistence:

- plaintext fleet cells;
- unsubmitted fleet layouts;
- enemy hidden data;
- broad Fhenix permits;
- decrypted hidden values;
- private wallet data.

## PWA and Mobile App Option

The required MVP platform is the mobile browser.

Recommended browser features:

- responsive mobile layout;
- installable PWA manifest later;
- safe-area viewport support;
- offline shell only if it does not imply offline gameplay.

A native mobile app can be added later as a wrapper around the same web game if wallet, WebGL, and Fhenix SDK compatibility are confirmed. The native app must not introduce a centralized gameplay backend.

## Testing Hooks

The frontend should be built so these behaviors are testable:

- route phase resolution;
- wallet network guard;
- contract read mapping;
- contract write parameter construction;
- Fhenix encryption input construction;
- placement store privacy clearing;
- event-triggered refetch;
- mobile layout states;
- 3D scene smoke rendering;
- attack confirmation flow;
- pending Fhenix recovery.

Detailed test planning belongs in `docs/testing-strategy.md`.

## Open Decisions

Decisions still needed before implementation:

- exact Vite project template;
- exact router library;
- exact Zustand store shape;
- exact contract ABI generation workflow;
- exact CoFHE SDK version;
- exact encrypted fleet batching strategy;
- whether PWA support is included in MVP;
- whether a read-only indexer is deferred or included as optional convenience;
- exact mobile performance budgets.

## Implementation Sequence

Recommended frontend implementation order:

1. Create the Vite React TypeScript app.
2. Add routing and English copy foundation.
3. Add wallet-aware entry gate and conditional onboarding.
4. Add wallet connection and Arbitrum Sepolia guard.
5. Add contract addresses, ABI, reads, and writes.
6. Add Fhenix client provider.
7. Build onboarding, menu, and opponent selection.
8. Build match route and phase resolver.
9. Build game field loading gate.
10. Build friend match creation and invite link flow.
11. Build fleet placement with local validation.
12. Add Fhenix fleet encryption and `submitFleet`.
13. Build event sync and match refetches.
14. Build battle screen and attack flow.
15. Add Fhenix shot finalization flow.
16. Add 3D board models and effects.
17. Add mobile performance tuning and QA.

## Related Documents

- `docs/project-description.md`
- `docs/game-mechanics.md`
- `docs/user-flows.md`
- `docs/technical-architecture.md`
- `docs/fhenix-integration-plan.md`
- `docs/contract-data-model.md`
- `docs/contract-api.md`
- `docs/interface-and-buttons-guide.md`
- `docs/visual-style-guide.md`
