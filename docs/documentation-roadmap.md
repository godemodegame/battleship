# Documentation Roadmap

## Purpose

This document audits the current documentation set and defines what should be added next before implementation begins.

The current documentation already covers the project idea, gameplay mechanics, smart contract behavior, frontend architecture, security model, testing strategy, copy deck, visual style, interface structure, and 3D asset prompts. The next step is to complete the user-owned asset production pipeline and then move toward implementation.

## Current Documentation Coverage

Existing project documents:

- `README.md` - project entry point and documentation index.
- `docs/project-description.md` - high-level product requirements.
- `docs/game-mechanics.md` - base gameplay rules.
- `docs/smart-contract-design.md` - contract responsibilities and PvP on-chain flow.
- `docs/fhenix-integration-plan.md` - concrete SDK, encryption, permit, and decrypt flows.
- `docs/technical-architecture.md` - full system shape and implementation boundaries.
- `docs/contract-data-model.md` - storage structures, enums, public fields, and encrypted fields.
- `docs/contract-api.md` - functions, events, errors, access rules, and frontend expectations.
- `docs/frontend-architecture.md` - mobile web app layers, routes, stores, wallet, Fhenix, and 3D boundaries.
- `docs/security-and-fair-play.md` - hidden-state threat model, trust boundaries, and fair-play controls.
- `docs/testing-strategy.md` - contract, Fhenix, frontend, mobile, and end-to-end test plan.
- `docs/copy-deck.md` - centralized English UI labels, states, errors, and accessibility copy.
- `docs/computer-opponent-design.md` - backendless on-chain bot mode design.
- `docs/visual-style-guide.md` - art direction and rendering language.
- `docs/interface-and-buttons-guide.md` - menu, opponent selection, HUD, and button system.
- `docs/user-flows.md` - player journeys for the friend-match MVP.
- `docs/documentation-audit.md` - current coverage and missing implementation docs.
- `assets/3d-models/README.md` - 3D model catalog.
- `assets/3d-models/prompts/*.md` - per-model generation prompts.

The documentation is now aligned around these core decisions:

- English-only documentation and game UI.
- Mobile browser as the required first platform.
- PvP as the main game mode.
- Friend invite matches as the priority PvP flow.
- Backendless bot mode as an optional practice mode, not the primary MVP mode.
- Fully on-chain state and rules.
- Fhenix/CoFHE under the hood for encrypted game state.
- Arbitrum Sepolia as the MVP blockchain network.
- Stylized neo-noir graphic 3D visual direction.
- Vite React as the recommended first frontend implementation path.
- Explicit hidden-state trust boundaries.
- Test coverage expectations before MVP implementation.
- Centralized English-only player-facing copy.

## Consistency Fixes Already Applied

The early mechanics document previously mentioned a simple computer opponent for local prototyping. That has been adjusted so the first product version is clearly human versus human PvP. Development-only simulation tools can still exist later, but they should not be presented as the core MVP mode.

## User-owned Document to Add

The user plans to create this document manually:

- `docs/asset-production-pipeline.md`

The visual style and prompt files describe what to make. This file should define how assets move into the game:

- generation;
- review;
- cleanup;
- retopology if needed;
- material setup;
- `.glb` export;
- texture compression;
- LOD creation;
- naming rules;
- import validation;
- mobile performance budgets.

## Medium Priority Documents

Add these after the implementation scaffold starts, or when a specific implementation risk needs more detail:

- `docs/mobile-performance-budget.md` - FPS target, polygon budgets, texture budgets, loading budget.
- `docs/network-and-wallet-requirements.md` - Arbitrum Sepolia, wallet support, WalletConnect behavior, network switching.
- `docs/indexer-read-model.md` - optional read-only indexing and what it is allowed to cache.
- `docs/deployment-plan.md` - local, testnet, preview, and production deployment flows.
- `docs/game-economy-placeholder.md` - explicitly states that wagers, NFT ships, and marketplace are out of MVP.
- `docs/accessibility-checklist.md` - mobile readability, touch targets, color contrast, non-color state indicators.

## Low Priority Documents

These can wait until after a playable prototype:

- ranking design;
- tournament design;
- native mobile app plan;
- NFT ship design;
- marketplace design;
- social sharing design;
- animation timing bible;
- sound and music direction.

## Recommended Next Step

The next documentation task is user-owned:

- `docs/asset-production-pipeline.md`

Reason: the engineering-side planning documents now cover product, mechanics, contract behavior, Fhenix, frontend architecture, security, testing, copy, UI, and user flow. The remaining high-value documentation gap is the asset production workflow.

Engineering can proceed in parallel with:

1. frontend and contract scaffold planning;
2. package and toolchain setup;
3. Fhenix package version confirmation;
4. contract prototype for match creation and joining;
5. frontend prototype for wallet connection and route flow.

If more documentation is needed before implementation, write `docs/mobile-performance-budget.md` next.
