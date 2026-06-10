# Testing Strategy

## Purpose

This document defines the testing strategy for the mobile-first 3D fully on-chain Battleship game.

The project combines smart contracts, Fhenix/CoFHE, wallet flows, mobile browser UI, and 3D rendering. Testing must prove that the core friend-match flow works and that hidden information stays protected.

## Milestone 0: Local Prototype Tests (First)

The repository already contains a playable local practice build with no
automated tests. Before any contract or Fhenix testing, the first milestone
is to test that build - the board rules, attack engine, and bot in
`src/game/` are the same rules the contract must later mirror, so locking
them down first protects the on-chain design.

The concrete plan is `docs/local-prototype-test-plan.md`: unit tests for
`board.ts`/`engine.ts`, deterministic seeded bot tests, store orchestration
tests, React screen smoke tests, and Playwright canvas/regression runs.

Everything below this section describes the on-chain MVP milestones that
follow.

## Testing Goals

The test strategy must verify:

- contract lifecycle rules;
- encrypted fleet submission;
- Fhenix mock behavior;
- shot resolution flow;
- turn order;
- timeout behavior;
- frontend phase resolution;
- wallet and network guards;
- English-only UI copy;
- mobile browser usability;
- 3D board smoke rendering;
- full friend-match end-to-end flow.

## Non-goals

The MVP test plan does not need:

- mainnet load testing;
- ranked season testing;
- tournament simulations;
- marketplace tests;
- NFT ownership tests;
- native app store testing;
- large-scale anti-bot testing.

## Recommended Test Stack

Recommended contract stack:

- Foundry or Hardhat;
- Fhenix/CoFHE mock contracts;
- Solidity unit tests;
- TypeScript integration tests if Hardhat is used.

Recommended frontend stack:

- Vitest;
- React Testing Library;
- Playwright;
- browser mobile viewport tests;
- Three.js or React Three Fiber smoke tests;
- lightweight accessibility checks.

Recommended shared utilities:

- deterministic test fleets;
- deterministic move scripts;
- mock wallet connectors;
- contract event fixtures;
- Fhenix mock decrypt fixtures;
- route phase resolver tests.

## Test Environments

Use three environments:

1. Local unit environment.
2. Local integration environment with Fhenix mocks.
3. Arbitrum Sepolia testnet environment.

Local tests should run frequently. Testnet tests should run before important milestones because they cost time and gas.

## Contract Unit Tests

Contract unit tests should cover match lifecycle.

Required match creation tests:

- creator can create a strict friend match;
- creator cannot invite `address(0)`;
- creator cannot invite self;
- match starts in `WaitingForOpponent`;
- `MatchCreated` event is emitted;
- creator match history is updated.

Required join tests:

- invited opponent can join;
- non-invited wallet cannot join;
- creator cannot join own match;
- already joined match cannot be joined again;
- expired join cannot be joined if join timeout is implemented;
- `MatchJoined` event is emitted.

Required placement tests:

- match player can submit encrypted fleet input;
- non-player cannot submit fleet;
- plaintext fleet submission does not exist;
- duplicate fleet submission is rejected while validation is pending;
- malformed encrypted input is rejected;
- placement status becomes `ResolvingValidation`;
- `FleetSubmitted` and `FleetValidationRequested` events are emitted.

Required validation tests:

- valid decrypt result finalizes placement as valid;
- invalid decrypt result finalizes placement as invalid;
- wrong ciphertext hash is rejected;
- invalid signature is rejected;
- duplicate finalization is rejected;
- both valid fleets start the match or move to `ReadyToStart`;
- invited opponent becomes first player.

Required attack tests:

- current turn player can attack;
- non-current player cannot attack;
- invalid cell index is rejected;
- repeated target cell is rejected;
- attack creates a pending move;
- status becomes `ResolvingShot`;
- no second attack is allowed while resolving.

Required shot finalization tests:

- valid miss result finalizes as `Miss`;
- valid hit result finalizes as `Hit`;
- valid sunk result finalizes as `Sunk`;
- valid win result finalizes as `Win`;
- `ShotResult.None` is rejected;
- values outside `1..4` are rejected;
- wrong ciphertext hash is rejected;
- invalid signature is rejected;
- finalized shot clears pending state;
- non-win shot changes turn;
- win shot sets winner and finishes match.

Required cancel, forfeit, and timeout tests:

- creator can cancel before opponent joins if allowed;
- match player can forfeit;
- non-player cannot forfeit another match;
- timeout cannot be claimed before deadline;
- timeout can be claimed after deadline;
- timeout result updates match status and emits event.

## Fhenix Mock Tests

Fhenix mock tests should prove that the contract uses encrypted values correctly.

Required checks:

- encrypted fleet cells are accepted through `InEuint8`;
- stored encrypted values call contract access grants;
- hidden fleet values are not exposed through public reads;
- placement validity reveals only a boolean;
- shot result reveals only the public result enum;
- intermediate encrypted values are not returned from public views;
- public decrypt finalization verifies expected ciphertext hash.

Mock tests should also cover failure cases:

- invalid encrypted input;
- wrong decrypt result type;
- stale decrypt result;
- reused decrypt signature;
- mismatched match or move id.

## Arbitrum Sepolia Tests

Testnet tests should verify integration with the real target network.

Required testnet checks:

- contract deploys to Arbitrum Sepolia;
- frontend has correct chain id `421614`;
- wallet network guard works;
- Fhenix client connects to the target chain;
- one full friend match can be created;
- both players can submit encrypted fleets;
- at least one shot can be resolved;
- game can reach `Finished` in a short scripted match;
- events are readable by the frontend.

Testnet tests should record:

- deployment address;
- ABI version;
- package versions;
- average transaction confirmation time;
- average Fhenix resolution time;
- gas estimates for core functions.

## Frontend Unit Tests

Frontend unit tests should cover pure logic.

Required tests:

- route phase resolver;
- wallet-aware onboarding gate;
- connected wallet skips onboarding;
- disconnected wallet sees onboarding before wallet connection;
- cell coordinate conversion;
- board index conversion;
- local placement validation;
- repeated target local guard;
- copy key lookup;
- contract error mapping;
- wallet network guard logic;
- transaction state reducer;
- Fhenix pending state reducer;
- plaintext placement clearing rules.

The phase resolver is especially important because `/match/:matchId` drives many screens from contract state.

## Frontend Component Tests

Component tests should cover UI behavior without a real chain.

Required component tests:

- onboarding shows correct actions;
- onboarding is skipped when a wallet is already connected;
- wallet screen shows wrong network state;
- main menu shows wallet and network status;
- opponent selection shows `Play Against Friend`;
- create match screen validates friend address;
- join match screen handles wrong wallet;
- fleet placement disables `Confirm Fleet` when invalid;
- battle HUD disables `Fire` when it is not the player's turn;
- resolving screen shows pending Fhenix state;
- field loading screen hides the gameplay board until required models are ready;
- game over screen shows `Victory` or `Defeat`.

Component tests should use English copy from `docs/copy-deck.md` or the implementation copy module.

## 3D Rendering Smoke Tests

The 3D scene needs smoke tests, not exhaustive visual testing at first.

Required checks:

- canvas mounts without crashing;
- gameplay field stays hidden until required models are loaded;
- target board renders 100 cells;
- fleet board renders 100 cells;
- selected cell state is visible;
- touch or click selection emits a cell index;
- battle effects can mount for `Miss`, `Hit`, `Sunk`, and `Win`;
- low graphics mode disables expensive effects;
- scene does not call contract writes directly.

If Playwright is used, add a canvas non-blank check for desktop and mobile viewports.

## Wallet Flow Tests

Wallet tests should cover expected mobile behavior.

Required checks:

- disconnected state shows `Connect Wallet`;
- connected state shows short address;
- wrong network shows `Switch to Arbitrum Sepolia`;
- rejected wallet connection is recoverable;
- rejected transaction is recoverable;
- account change clears plaintext placement;
- chain change reconnects or resets Fhenix client;
- returning from a mobile wallet refetches match state.

Mock wallet connectors can cover most cases locally.

## End-to-End Friend Match Test

The first full E2E test should follow the MVP user flow.

Required scripted flow:

1. Player A opens the app.
2. Player A connects wallet.
3. Player A creates a strict friend match for Player B.
4. Player A places and submits encrypted fleet.
5. Player A copies invite link.
6. Player B opens invite link.
7. Player B connects wallet.
8. Player B joins the match.
9. Player B places and submits encrypted fleet.
10. Match starts with Player B as first turn.
11. Player B attacks.
12. Shot resolves.
13. Player A attacks.
14. Moves continue until `Win`.
15. Winner screen appears.

This test can use mocked contract and Fhenix layers first, then a slower testnet version later.

## Security Regression Tests

Security tests should focus on preventing hidden-state leaks and invalid actions.

Required checks:

- no public read returns encrypted fleet internals;
- no frontend local persistence contains fleet cells;
- invite links contain only match id;
- non-player cannot read player-only view data if such data exists;
- non-current player cannot attack;
- repeated attack is rejected;
- stale decrypt result is rejected;
- invalid result enum is rejected;
- `ResolvingShot` blocks additional attacks;
- wrong invited wallet cannot join.

## English-only Tests

The project requires English-only documentation and player-facing UI.

Recommended checks:

- scan docs for non-ASCII characters unless a file intentionally allows them;
- scan UI copy files for non-English placeholder text;
- require all user-facing strings to come from the copy module;
- block raw error names from appearing directly in normal UI;
- verify accessibility labels are English.

The current docs can be checked with:

```sh
rg --pcre2 -n "\\p{Cyrillic}" README.md docs assets/3d-models
rg --pcre2 -n "[^\\x00-\\x7F]" README.md docs assets/3d-models
```

## Mobile Browser QA

Manual mobile QA should cover:

- iOS Safari;
- Android Chrome;
- wallet deep link return;
- portrait layout;
- safe areas;
- touch targets;
- board selection accuracy;
- wallet modal overlap;
- page refresh during placement;
- page refresh during `ResolvingShot`;
- slow network behavior.

Minimum mobile acceptance:

- primary actions are reachable with one thumb;
- no text overlaps critical controls;
- board cells can be selected reliably;
- wallet and network status are always visible;
- pending transaction state is obvious.

## Performance Tests

Performance tests should track:

- first screen load time;
- 3D scene mount time;
- average FPS in battle;
- memory usage during long match;
- fleet encryption time;
- transaction state latency;
- Fhenix resolution latency;
- model loading time.

Initial performance targets can be refined later in `docs/mobile-performance-budget.md`.

MVP target:

- stable 30 FPS minimum on common mobile devices;
- no main-thread freeze during fleet encryption when workers are available;
- 3D scene remains responsive while a transaction is pending.

## Test Data

Create deterministic test fixtures:

- valid fleet A;
- valid fleet B;
- invalid overlapping fleet;
- invalid out-of-bounds fleet;
- scripted move list ending in win;
- all miss script;
- mixed hit and sunk script;
- strict friend addresses;
- wrong wallet address;
- expired match timestamps.

Deterministic fixtures make contract, frontend, and E2E tests easier to align.

## CI Expectations

Recommended CI stages:

1. Lint.
2. Typecheck.
3. Contract unit tests.
4. Fhenix mock tests.
5. Frontend unit tests.
6. Frontend component tests.
7. English-only docs and copy scan.
8. Playwright smoke tests.

Arbitrum Sepolia tests should be manual or scheduled at first because they require funded wallets and external network availability.

## Definition of Done

Before the MVP is considered test-ready:

- contract tests cover the full friend match lifecycle;
- Fhenix mock tests cover encrypted fleet and shot resolution;
- frontend tests cover match phase resolution;
- E2E test covers the friend flow with mocked chain or local chain;
- mobile smoke test passes on at least two viewport sizes;
- English-only scan passes;
- no known plaintext fleet persistence exists;
- manual Arbitrum Sepolia run is documented.

## Related Documents

- `docs/project-description.md`
- `docs/game-mechanics.md`
- `docs/smart-contract-design.md`
- `docs/fhenix-integration-plan.md`
- `docs/contract-data-model.md`
- `docs/contract-api.md`
- `docs/frontend-architecture.md`
- `docs/security-and-fair-play.md`
- `docs/user-flows.md`
