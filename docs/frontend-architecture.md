# Frontend Architecture

## Purpose

This document defines how the mobile browser frontend should be structured for the fully on-chain 3D Battleship game.

It translates the project, user flow, contract API, and Fhenix integration documents into an implementable web app architecture.

It also records the architecture of the playable local practice build and the
required migration boundary between local simulation and contract-derived
state.

## Current Playable Architecture

The repository currently implements one local practice application:

- `src/App.tsx` keeps the React Three Fiber canvas mounted and selects one of
  four UI overlays: `home`, `placement`, `battle`, or `gameover`;
- `src/state/store.ts` is one Zustand store containing navigation, placement,
  the complete plaintext match, bot turns, animation queues, and UI state;
- `src/game/board.ts` contains placement and board helpers;
- `src/game/engine.ts` creates plaintext boards and resolves attacks;
- `src/game/bot.ts` selects the local practice bot target;
- `src/three/` renders both boards, ships, camera states, projectiles, and
  effects directly from the local store;
- `src/ui/` renders the four screen overlays;
- `src/lib/sfx.ts` owns synthesized sound and the only persisted setting
  (`localStorage.eb-muted`).

There is no router, Privy provider, contract client, event sync, CoFHE client,
query cache, or deployment configuration yet.

In practice mode, the local store is intentionally authoritative. It knows both
fleets and calls `applyAttack()` directly. That authority must never be reused
for an on-chain friend match.

## Migration Principle

Practice and on-chain modes should coexist as two orchestration paths:

- practice mode keeps using the local engine and local bot;
- on-chain mode derives match truth from contract reads and finalized events;
- pure placement helpers, board coordinates, model loaders, sound, and visual
  effects may be shared;
- plaintext match objects and bot-only state must not cross into on-chain
  mode.

Do not gradually add wallet and contract fields to the existing monolithic
`useStore` until it becomes a mixed source of truth. Introduce an on-chain route
shell and dedicated contract/query state, then adapt the existing scene to a
public render model.

## Target Goals

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
- Privy React SDK for wallet-only login, connection, and session state;
- wagmi through Privy's integration if React contract hooks are useful;
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
    phaseResolver.ts
  practice/
    practiceStore.ts
    PracticeApp.tsx
  onchain/
    OnchainApp.tsx
    matchQueries.ts
    matchCommands.ts
    eventSync.ts
    renderModel.ts
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
    privyConfig.ts
    networkGuard.ts
    clients.ts
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
    errors.ts
  utils/
```

This is a migration target, not a required immediate refactor. Existing
`src/game`, `src/three`, and `src/ui` modules can move incrementally. The
important boundary is that on-chain components consume a public render model
rather than the local plaintext `MatchState`.

## Routes

Recommended routes:

- `/` - wallet-aware entry route with conditional onboarding and wallet entry.
- `/menu` - main menu after wallet connection.
- `/play` - opponent selection.
- `/match/new` - create a friend match.
- `/match/:deploymentId/:matchId` - versioned shared match route for join,
  placement, waiting, battle, resolving, and game over.
- `/history` - local and on-chain match history.
- `/settings` - graphics, sound, wallet, and network settings.

The invite link should point to:

```txt
/match/:deploymentId/:matchId
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
- if a connected wallet opens `/match/:deploymentId/:matchId`, skip onboarding
  and resolve the match phase directly;
- if the wallet disconnects later, return to the wallet-required state without replaying unnecessary onboarding.

The onboarding completion flag may be stored locally, but wallet connection state takes priority. A connected wallet should not be forced through onboarding.

## Providers

The root app should initialize providers in this order:

1. React error boundary.
2. Privy provider.
3. Privy wagmi integration and query/cache provider if wagmi is used.
4. Router.
5. CoFHE client bridge after wallet and network readiness.
6. App state provider if context is needed.
7. 3D scene root.

Privy owns the connection UI. No second wallet modal should be mounted. The
CoFHE client bridge must wait until Privy has an active external EVM wallet and
the chain guard confirms Arbitrum Sepolia.

## Wallet and Network Layer

The wallet layer should handle:

- Privy readiness and authentication state;
- active external EVM wallet selection;
- wallet connection and disconnect through Privy;
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

The complete Privy configuration, supported-wallet scope, wrong-network
recovery, mobile return, funding, and account-switch rules are defined in
`docs/network-and-wallet-requirements.md`.

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

Required event-to-read mapping:

| Event | Required refresh | UI consequence |
| --- | --- | --- |
| `MatchCreated` | `getMatch`, creator match list | Route to `/match/:deploymentId/:matchId` after receipt |
| `MatchJoined` | `getMatch`, both player views | Resolve placement phase |
| `FleetSubmitted` | submitting player view | Show submitted/waiting state |
| `FleetValidationRequested` | player view, pending validation data if exposed | Show validation pending |
| `FleetValidated` | both player views, `getMatch` | Show valid/invalid or ready state |
| `MatchStarted` | `getMatch`, both player views | Build battle render model |
| `TurnChanged` | `getMatch` | Update controls and turn banner |
| `ShotSubmitted` | `getMatch`, `getPendingShot` | Lock targeting and show resolving |
| `ShotResolutionRequested` | `getPendingShot` | Start allowed finalization flow |
| `ShotResolved` | `getMatch`, move, move history, both public boards | Play one finalized result animation |
| `MatchFinished` | `getMatch`, move history, both player views | Show contract-derived game over |
| `MatchCancelled` | `getMatch` | Show cancelled state |
| `MatchForfeited` | `getMatch` | Show forfeit result |
| `TimeoutWinClaimed` | `getMatch` | Show timeout result |

Event consumers must be idempotent. Dedupe logs by chain id, contract address,
transaction hash, and log index. Visual effects should be keyed by finalized
move id so reconnecting or receiving the same log twice does not play duplicate
projectiles or result toasts.

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

## Local-to-On-chain State Mapping

The current `AppState` can remain authoritative only inside practice mode.

| Current local field | Practice mode | On-chain replacement |
| --- | --- | --- |
| `screen` | Local screen enum | Pure route phase derived from wallet, network, asset, and contract reads |
| `difficulty` | Local bot setting | Practice-only; absent from friend PvP |
| `howItWorksOpen` | Local modal state | Shared UI state |
| `placements` | Plaintext local fleet | Transient placement store; encrypt, submit, then clear |
| `selectedSlot` | Placement UI state | Shared transient placement UI |
| `placeOrientation` | Placement UI state | Shared transient placement UI |
| `match` | Complete plaintext `MatchState` | Forbidden; replace with `MatchView`, player public views, moves, and pending-shot reads |
| `match.boards.player.ships` | Full local fleet | Must not be retained after submission; exact owner-fleet rendering needs a separate authorized design |
| `match.boards.bot.ships` | Full bot fleet | Must never exist in on-chain friend mode |
| `match.boards.*.shots` | Local per-cell results | Decode contract `PublicBoard` attacked/miss/hit/sunk masks |
| `match.turn` | Local `player`/`bot` enum | Compare `MatchView.currentTurn` with the active wallet address |
| `match.moves` | Local move array | `getMoveHistory(matchId)` plus finalized move reads |
| `match.winner` | Local side enum | `MatchView.winner` and terminal status |
| `focus` | Camera state | Shared scene/UI state derived from phase and perspective |
| `selectedCell` | Target selection | Local battle UI only; clear after submit, turn change, account change, or refetch conflict |
| `busy` | Local animation lock | Derived transaction, receipt, CoFHE, and contract pending states |
| `effects` | Local effect queue | Shared visual queue triggered only by finalized public results |
| `projectiles` | Local projectile queue | Shared visual queue; on-chain launch timing must not imply a result |
| `toast` | Local result message | Shared copy state created from finalized move data |
| `forfeited` | Local boolean | Terminal contract status and `MatchForfeited` event |

Current actions map as follows:

| Current action | On-chain behavior |
| --- | --- |
| `startPlacement()` | Enter local placement UI after contract phase resolver allows it |
| `placeAt()`, `pickUpAt()`, `rotateSelected()`, `autoPlace()`, `clearPlacement()` | Reuse pure local placement behavior before encryption |
| `confirmFleet()` | Encrypt fleet, submit `submitFleet`, clear plaintext, wait for `FleetValidated` |
| `selectCell()` | Remain local UI state, guarded by current public contract state |
| `fire()` | Submit `attack`, recover pending shot, observe or submit finalization, then animate `ShotResolved` |
| `forfeit()` | Submit contract `forfeit`; never set winner locally |
| `rematch()` | Create a new match; never reuse terminal contract state |
| `toHome()` | Route change only; it must not mutate contract state |
| `resolveShot()` | Practice-only; forbidden in on-chain mode |
| `chooseBotTarget()` | Practice-only; forbidden in friend PvP |

## Public Scene Render Model

The on-chain route should adapt contract reads into a render-only model instead
of passing `MatchState` into `src/three/`.

Minimum model:

```ts
interface PublicBattleRenderModel {
  phase: 'waiting' | 'player-turn' | 'opponent-turn' | 'resolving' | 'finished'
  perspective: 'creator' | 'opponent'
  currentTurn: `0x${string}` | null
  winner: `0x${string}` | null
  playerBoard: PublicBoardRenderState
  opponentBoard: PublicBoardRenderState
  selectedCell: number | null
  latestFinalizedMove: PublicMove | null
}
```

`PublicBoardRenderState` may contain attacked, miss, hit, and sunk cells plus
public ship-count metadata. It must not contain enemy placements, `shipAt`,
encrypted fleet values, ciphertext-derived guesses, or unresolved shot
results.

After fleet submission, the first on-chain slice should hide exact owner fleet
geometry unless an explicit authorized `decryptForView` flow is designed and
reviewed. Keeping plaintext placement in memory for the whole match would
violate the existing privacy-clearing requirement and would not survive mobile
reloads consistently.

## Match Phase Resolution

The `/match/:deploymentId/:matchId` route should derive a screen phase from
the selected deployment record and contract reads.

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
https://game.example/match/arb-sepolia-v1/123
```

Strict friend invite remains the MVP default. The contract should enforce the invited opponent address.

## Local Persistence

Allowed local persistence:

- onboarding completed flag;
- graphics settings;
- sound settings;
- last used wallet preference only when Privy manages it;
- recently viewed match ids;
- intended route and match id during a mobile wallet handoff.

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

- exact router library;
- exact contract ABI generation workflow;
- exact CoFHE SDK version;
- exact encrypted fleet batching strategy;
- whether PWA support is included in MVP;
- whether a read-only indexer is deferred or included as optional convenience;
- whether an authorized owner-only fleet view is added after the first on-chain
  slice.

## Implementation Sequence

Recommended frontend implementation order:

1. Preserve the current practice build and introduce an explicit
   practice/on-chain mode boundary.
2. Move shared English copy and error mappings into typed modules.
3. Add routing, the on-chain route shell, and a pure phase resolver.
4. Add Privy wallet-only login and the Arbitrum Sepolia guard.
5. Add versioned contract addresses, ABI, typed reads, and typed writes.
6. Add the CoFHE client bridge and account/chain invalidation.
7. Build wallet-aware onboarding, menu, and opponent selection.
8. Build friend match creation, invite links, and join flow.
9. Reuse placement helpers in a transient on-chain placement store.
10. Add fleet encryption, `submitFleet`, plaintext clearing, and validation
    recovery.
11. Build event sync, targeted refetches, and idempotent move processing.
12. Adapt the existing 3D scene to `PublicBattleRenderModel`.
13. Add attack, pending-shot recovery, and finalization flow.
14. Add contract-derived game-over, forfeit, timeout, and rematch flows.
15. Add mobile wallet return tests, performance tuning, and end-to-end QA.

## Related Documents

- `docs/current-playable-build.md`
- `docs/local-game-engine.md`
- `docs/practice-mode-and-bot-ai.md`
- `docs/project-description.md`
- `docs/game-mechanics.md`
- `docs/user-flows.md`
- `docs/technical-architecture.md`
- `docs/network-and-wallet-requirements.md`
- `docs/deployment-plan.md`
- `docs/fhenix-integration-plan.md`
- `docs/contract-data-model.md`
- `docs/contract-api.md`
- `docs/interface-and-buttons-guide.md`
- `docs/visual-style-guide.md`
