# Documentation Roadmap

## Purpose

This document records the documentation work created after the repository moved
beyond planning into a playable local practice build, plus the implementation
triggers for the next refresh.

The documentation should keep two realities clear:

- the current implementation is a local browser practice game against a bot;
- the product direction is still mobile-first 3D on-chain PvP with Fhenix/CoFHE
  privacy on Arbitrum Sepolia.

## Completion Status

Status as of June 10, 2026:

| Task | Status | Result |
| --- | --- | --- |
| Phase 0 reality check | Complete | README and audit match the playable repository |
| Current playable build | Complete | `docs/current-playable-build.md` |
| Local game engine | Complete | `docs/local-game-engine.md` |
| Practice mode and bot AI | Complete | `docs/practice-mode-and-bot-ai.md` |
| Runtime asset pipeline | Complete | `docs/runtime-asset-pipeline.md` |
| VFX Forge workflow | Complete | `docs/vfx-forge-workflow.md` |
| Mobile performance budget | Complete | `docs/mobile-performance-budget.md` |
| Local prototype test plan | Complete | `docs/local-prototype-test-plan.md` |
| Copy and UI sync | Complete | `docs/copy-implementation-sync.md` |
| Network and wallet requirements | Complete | `docs/network-and-wallet-requirements.md` |
| Frontend contract-state migration | Complete | `docs/frontend-architecture.md` |
| Deployment plan | Complete | `docs/deployment-plan.md` |

The detailed sections below are retained as the specifications that guided each
completed task. Phase 5 remains pending until on-chain code exists.

## Current Implementation Snapshot

Implemented in the repository now:

- Vite React TypeScript app;
- React Three Fiber and Three.js 3D scene;
- local Zustand game state;
- home, placement, battle, and game-over screens;
- manual and automatic fleet placement;
- classic no-touch placement rule;
- local player-versus-bot practice loop;
- bot difficulties: `Easy`, `Normal`, and `Hard`;
- attack projectile, miss, hit, and sunk visual effects;
- runtime FBX and GLB model loading;
- sound effects and mute persistence;
- standalone `vfx-app` used to generate the three `vfx-*` GLB assets.

Not implemented yet:

- wallet connection;
- Arbitrum Sepolia network guard;
- smart contract package;
- Fhenix/CoFHE client layer;
- encrypted fleet submission;
- on-chain friend match lifecycle;
- contract event sync;
- test suite;
- production deployment workflow.

## Documentation Coverage

The current documentation covers the original product and architecture well:

- product vision and scope;
- mobile browser target;
- English-only project rule;
- base Battleship rules;
- smart contract design;
- Fhenix integration plan;
- contract data model;
- contract API;
- frontend architecture;
- security and fair play;
- testing strategy;
- copy deck;
- user flows;
- visual style;
- interface and button language;
- computer opponent concept;
- 3D model prompts and catalog.

The implementation-specific layer now also covers the playable build, local
rules, bot, assets, VFX, performance, tests, copy, Privy requirements,
frontend migration, and deployment.

## Completed Documentation Task Specifications

## 1. Current Playable Build README

Recommended file:

- `docs/current-playable-build.md`

Why it matters:

The repository now has a real playable slice, but there is no single document
that explains what the current game actually does.

This document should cover:

- how to run the app locally;
- current screen flow;
- practice-versus-bot scope;
- what is simulated locally;
- what is intentionally disabled;
- key controls;
- known limitations;
- how this prototype maps to the future on-chain version.

Priority:

- P0.

## 2. Local Game Engine Specification

Recommended file:

- `docs/local-game-engine.md`

Why it matters:

The local engine now contains concrete rule decisions that should be documented
before they drift from the on-chain design.

This document should cover:

- board indexing and coordinate labels;
- fleet definition and model mapping;
- placement validation;
- no-touch rule;
- attack resolution;
- turn passing after every valid attack;
- sunk-ship halo deduction;
- game-over summary calculations;
- which logic is production game logic and which logic is prototype-only.

Priority:

- P0.

## 3. Bot Difficulty and Practice Mode

Recommended file:

- `docs/practice-mode-and-bot-ai.md`

Why it matters:

The current game already has bot difficulties, but the existing
`docs/computer-opponent-design.md` focuses on a future backendless on-chain bot.
The current frontend bot is a local practice feature and must be documented as
such.

This document should cover:

- practice mode status and limitations;
- `Easy`, `Normal`, and `Hard` behavior;
- public-information-only targeting rule;
- why the local bot is not production-authoritative;
- migration options toward an on-chain bot or pure PvP MVP.

Priority:

- P0.

## 4. Runtime Asset Pipeline

Recommended file:

- `docs/runtime-asset-pipeline.md`

Why it matters:

The asset docs still speak mostly in terms of prompts and future GLB output, but
runtime assets now exist in `public/models`, `public/textures`,
`assets/3d-models/fbx`, `assets/3d-models/glb`, and `vfx-app`.

This document should cover:

- source asset locations;
- runtime asset locations;
- FBX versus GLB usage;
- naming rules;
- texture pairing;
- normalization and scale expectations;
- asset preload strategy;
- where VFX assets come from;
- how to replace or regenerate a model safely;
- mobile budget checks before adding heavier assets.

Priority:

- P0.

## 5. VFX Forge Workflow

Recommended file:

- `docs/vfx-forge-workflow.md`

Why it matters:

`vfx-app/README.md` explains the standalone VFX studio, but the main docs do not
yet connect that tool to the game asset pipeline.

This document should cover:

- how to run `vfx-app`;
- what assets it owns;
- export steps;
- expected GLB animation clips;
- runtime opacity fade limitation;
- how exported files move into `public/models`;
- verification checklist after export.

Priority:

- P1.

## 6. Mobile Performance Budget

Recommended file:

- `docs/mobile-performance-budget.md`

Why it matters:

The game is mobile-first and uses WebGL, model loading, shadows, ocean effects,
animated VFX, and later wallet/Fhenix flows. The docs need explicit budgets
before more visuals are added.

This document should define:

- FPS targets;
- initial load target;
- total model and texture budget;
- per-model triangle targets;
- texture size limits;
- shadow and lighting budget;
- low/medium/high graphics modes;
- battery and thermal expectations;
- Playwright or manual mobile verification procedure.

Priority:

- P1.

## 7. Test Plan for the Current Prototype

Recommended file:

- `docs/local-prototype-test-plan.md`

Why it matters:

`docs/testing-strategy.md` is oriented toward the future on-chain MVP. The
current local game has no focused test plan for the code that exists now.

This document should cover:

- unit tests for `src/game/board.ts`;
- unit tests for `src/game/engine.ts`;
- deterministic bot tests for `src/game/bot.ts`;
- smoke tests for React screens;
- 3D canvas non-blank checks;
- mobile viewport checks;
- local regression scripts for placement, attack, sunk, win, forfeit, and
  rematch flows.

Priority:

- P1.

## 8. Copy and UI Implementation Sync

Recommended file:

- `docs/copy-implementation-sync.md`

Why it matters:

The copy deck describes the target on-chain UI, while the current app contains
practice-mode labels such as `Practice vs Bot`, disabled PvP actions, and local
build helper copy.

This document should cover:

- which current strings intentionally differ from the on-chain copy deck;
- temporary practice-mode copy;
- disabled-mode copy;
- labels that need to move into a future copy module;
- English-only checks for UI and docs.

Priority:

- P2.

## 9. Network and Wallet Requirements

Recommended file:

- `docs/network-and-wallet-requirements.md`

Why it matters:

Wallet and chain behavior are required for the on-chain milestone and should be
settled before web3 packages are added.

This document should cover:

- Arbitrum Sepolia chain id `421614`;
- supported wallet types;
- WalletConnect/mobile wallet behavior;
- wrong-network recovery;
- funded test wallet expectations;
- transaction rejection and retry behavior;
- account-switch recovery.

Priority:

- P2.

## 10. Deployment Plan

Recommended file:

- `docs/deployment-plan.md`

Why it matters:

The repository needs a clean path from local playable prototype to public
testnet demo.

This document should cover:

- local development commands;
- preview build workflow;
- static hosting plan;
- contract deployment workflow;
- ABI and contract address versioning;
- environment variables;
- Arbitrum Sepolia deployment checklist;
- rollback and redeploy rules.

Priority:

- P2.

## Updated Existing Documentation

These files were revised so they no longer imply that implementation has not
started:

- `README.md` - add a short current-build status section and run commands.
- `docs/documentation-audit.md` - update from pre-implementation audit to
  current implementation audit.
- `docs/game-mechanics.md` - note that manual placement now exists in the local
  build.
- `docs/frontend-architecture.md` - separate current prototype structure from
  target on-chain structure.
- `docs/interface-and-buttons-guide.md` - document current practice-mode entry
  screen and disabled on-chain actions.
- `assets/3d-models/README.md` - reflect actual generated FBX/GLB/runtime
  assets, not only planned prompt outputs.
- `docs/computer-opponent-design.md` - explicitly distinguish local frontend bot
  from future backendless on-chain bot.
- `docs/testing-strategy.md` - add current local prototype testing as the first
  milestone before contract/Fhenix testing.

## Roadmap

## Phase 0: Documentation Reality Check

Status:

- complete.

Goal:

- make the docs match the current repository state.

Tasks:

- update `docs/documentation-audit.md`;
- add a current status section to `README.md`;
- clarify that the current build is local practice versus bot;
- mark wallet, Fhenix, contracts, and on-chain PvP as future milestones.

Exit criteria:

- a new developer can tell what is playable now within five minutes.

## Phase 1: Local Prototype Documentation

Status:

- complete.

Goal:

- document the implemented game loop before expanding it.

Tasks:

- write `docs/current-playable-build.md`;
- write `docs/local-game-engine.md`;
- write `docs/practice-mode-and-bot-ai.md`;
- update `docs/game-mechanics.md` with implemented manual placement and bot
  practice notes.

Exit criteria:

- the local rules, bot behavior, and prototype limitations are explicit.

## Phase 2: Asset and VFX Documentation

Status:

- complete.

Goal:

- make the 3D asset workflow repeatable.

Tasks:

- write `docs/runtime-asset-pipeline.md`;
- write `docs/vfx-forge-workflow.md`;
- update `assets/3d-models/README.md` with current asset inventory;
- define replacement and verification steps for runtime models.

Exit criteria:

- another contributor can regenerate or replace an asset without guessing where
  it belongs.

## Phase 3: Quality and Mobile Readiness

Status:

- documentation complete;
- automated test implementation remains pending.

Goal:

- add the documentation needed to stabilize the playable prototype.

Tasks:

- write `docs/mobile-performance-budget.md`;
- write `docs/local-prototype-test-plan.md`;
- add browser/mobile smoke-test expectations;
- define graphics quality levels before more effects are added.

Exit criteria:

- performance and regression expectations are measurable.

## Phase 4: On-chain Integration Preparation

Status:

- documentation complete;
- implementation has not started.

Goal:

- prepare docs for wallet, contract, and Fhenix implementation.

Tasks:

- write `docs/network-and-wallet-requirements.md`;
- write `docs/deployment-plan.md`;
- update `docs/frontend-architecture.md` with a migration plan from local store
  to contract-derived state;
- define how local prototype state maps to contract state and events.

Exit criteria:

- web3 implementation can start without re-litigating network, wallet, ABI,
  deploy, and recovery basics.

## Phase 5: On-chain MVP Documentation Refresh

Status:

- pending on-chain implementation.

Goal:

- update the target MVP docs after the first wallet/contract/Fhenix slice is
  implemented.

Tasks:

- revise `docs/smart-contract-design.md` against actual contract code;
- revise `docs/contract-api.md` against generated ABI;
- revise `docs/contract-data-model.md` against real storage structures;
- revise `docs/fhenix-integration-plan.md` against the actual SDK version and
  integration code;
- revise `docs/testing-strategy.md` with contract and testnet results.

Exit criteria:

- docs describe the implemented on-chain system, not only the intended one.

## Next Documentation Trigger

Do not start Phase 5 as speculative rewriting. Refresh the on-chain documents
against real artifacts when implementation produces:

- a contract package and storage layout;
- generated ABI and TypeScript types;
- pinned Privy and CoFHE package versions;
- the first encrypted fleet submission;
- a versioned Arbitrum Sepolia deployment record;
- test and deployment results.

The immediate engineering work enabled by this roadmap is:

1. implement the local automated test milestone;
2. introduce the explicit practice/on-chain frontend boundary;
3. integrate Privy and the Arbitrum Sepolia guard;
4. build and test the contract package with CoFHE mocks;
5. replace design assumptions with measured implementation notes as each slice
   lands.

The task-level implementation sequence, dependencies, priorities, and release
criteria are tracked in `docs/game-implementation-roadmap.md`.
