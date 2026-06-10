# Documentation Audit

## Purpose

This document summarizes the current documentation state after the repository
has moved from planning into an implemented local practice build.

## Current Repository State

The game currently includes:

- Vite React TypeScript frontend;
- React Three Fiber and Three.js scene;
- local state management with Zustand;
- home, placement, battle, and game-over screens;
- manual and automatic fleet placement;
- classic no-touch fleet validation;
- local player-versus-bot practice match;
- bot difficulties: `Easy`, `Normal`, and `Hard`;
- projectile, miss, hit, and sunk effects;
- runtime FBX/GLB model loading;
- sound effects and mute persistence;
- standalone `vfx-app` for generating VFX GLB assets.

The game does not yet include:

- wallet connection;
- Arbitrum Sepolia network switching;
- smart contracts;
- Fhenix/CoFHE client integration;
- encrypted fleet submission;
- on-chain friend-match flow;
- contract event sync;
- automated tests;
- deployment pipeline.

## Current Documentation Strengths

The documentation set already covers the intended on-chain product well:

- high-level project direction;
- English-only rule;
- mobile-first browser requirement;
- PvP-first product scope;
- Arbitrum Sepolia target;
- Fhenix/CoFHE privacy direction;
- smart contract behavior outline;
- Fhenix SDK and decrypt-flow plan;
- contract data model;
- contract API;
- frontend architecture;
- security and fair-play model;
- testing strategy;
- copy deck;
- friend-match user flows;
- visual style direction;
- interface and button guide;
- 3D model catalog and generation prompts;
- backendless on-chain computer opponent concept.

This is still valuable as target architecture, but the documentation no longer
fully describes what exists in the playable build today.

## Main Missing Layer

The biggest missing layer is current implementation documentation.

Earlier docs describe where the project is going. They do not yet explain the
implemented local practice game: its screens, rules, bot behavior, asset runtime
pipeline, VFX generation workflow, current limitations, and immediate test
needs.

## Critical Gaps

## 1. Current Playable Build

Missing file:

- `docs/current-playable-build.md`

Why it matters:

A contributor needs one document that explains the game as it exists now:

- local run command;
- current screen flow;
- practice-versus-bot scope;
- disabled PvP actions;
- what is simulated locally;
- known limitations;
- how the prototype maps to the future on-chain version.

Priority:

- P0.

## 2. Local Game Engine

Missing file:

- `docs/local-game-engine.md`

Why it matters:

The local engine now contains concrete decisions that should be kept aligned
with contract design:

- board indexing;
- fleet definition;
- placement validation;
- no-touch rule;
- attack resolution;
- turn passing;
- sunk-ship halo deduction;
- game-over summary logic.

Priority:

- P0.

## 3. Practice Mode and Bot AI

Missing file:

- `docs/practice-mode-and-bot-ai.md`

Why it matters:

The current bot is implemented in the frontend for local practice. The existing
computer-opponent doc describes a future backendless on-chain bot, which is a
different design.

The docs should distinguish:

- current local practice bot;
- future on-chain bot;
- PvP MVP path;
- difficulty behavior and limitations.

Priority:

- P0.

## 4. Runtime Asset Pipeline

Missing file:

- `docs/runtime-asset-pipeline.md`

Why it matters:

The repo now contains real runtime assets, but the docs mostly describe prompts
and planned outputs.

The docs should define:

- source asset folders;
- runtime asset folders;
- FBX versus GLB usage;
- texture pairing;
- model normalization and scale assumptions;
- preload behavior;
- replacement workflow;
- asset verification checklist.

Priority:

- P0.

## 5. VFX Forge Workflow

Missing file:

- `docs/vfx-forge-workflow.md`

Why it matters:

`vfx-app` is now part of the asset production workflow, but the main docs do not
explain how it connects to the game.

The docs should cover:

- running `vfx-app`;
- exporting the three VFX GLBs;
- runtime animation expectations;
- opacity fade limitation;
- copying assets into `public/models`;
- verification after export.

Priority:

- P1.

## 6. Mobile Performance Budget

Missing file:

- `docs/mobile-performance-budget.md`

Why it matters:

The game is mobile-first and already uses WebGL, shadows, ocean rendering,
model loading, and effects. A performance budget should be defined before
visual complexity grows.

Priority:

- P1.

## 7. Local Prototype Test Plan

Missing file:

- `docs/local-prototype-test-plan.md`

Why it matters:

The existing test strategy targets the future on-chain MVP. The current local
build needs its own focused test plan for board rules, engine behavior, bot
targeting, UI flows, and 3D smoke checks.

Priority:

- P1.

## Important Stale Areas

These existing documents need updates:

- `README.md` should mention the current local practice build and run commands.
- `docs/game-mechanics.md` still says automatic placement is enough for the
  first working version, but manual placement now exists.
- `docs/frontend-architecture.md` describes target architecture, not the current
  implementation structure.
- `docs/interface-and-buttons-guide.md` does not document the current
  practice-mode home screen and disabled PvP actions.
- `assets/3d-models/README.md` still reads like an asset planning document even
  though runtime assets now exist.
- `docs/computer-opponent-design.md` should clearly separate local frontend bot
  behavior from future backendless on-chain bot behavior.
- `docs/testing-strategy.md` needs a local prototype milestone before the
  contract/Fhenix milestones.

## Lower Priority Gaps

These remain useful but can wait until the local prototype docs are current:

- `docs/network-and-wallet-requirements.md`;
- `docs/deployment-plan.md`;
- `docs/copy-implementation-sync.md`;
- accessibility checklist;
- sound and music direction;
- animation timing guide;
- PWA plan;
- public website or landing page copy.

## Recommended Documentation Order

1. `docs/current-playable-build.md`
2. `docs/local-game-engine.md`
3. `docs/practice-mode-and-bot-ai.md`
4. `docs/runtime-asset-pipeline.md`
5. `docs/vfx-forge-workflow.md`
6. `docs/mobile-performance-budget.md`
7. `docs/local-prototype-test-plan.md`
8. `docs/network-and-wallet-requirements.md`
9. `docs/deployment-plan.md`

## Readiness Assessment

Current documentation readiness:

- product vision: strong;
- target on-chain architecture: strong;
- contract planning: good;
- Fhenix planning: good;
- frontend target architecture: good but stale against implementation;
- security model: good for target MVP;
- testing strategy: good for target MVP, missing local prototype tests;
- copy deck: good for target MVP, missing practice-build sync;
- visual style: strong;
- asset prompts: good;
- runtime asset workflow: missing;
- VFX workflow integration: missing;
- current playable build documentation: missing;
- local bot documentation: missing.

The project is ready to continue implementation, but the docs should now catch
up with the playable local build before major wallet, contract, or Fhenix work
starts.
