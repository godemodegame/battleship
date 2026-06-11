# On-chain 3D Battleship

## Overview

This project is a mobile-first 3D PvP Battleship-style browser game. Players connect wallets, create or join matches, place fleets, and take turns attacking the opponent's board.

The game must be fully on-chain for match state and rules, use Fhenix/CoFHE for private encrypted gameplay state, and run on Arbitrum Sepolia for the MVP.

All project documentation, game UI text, player-facing copy, errors, labels, and prompts must be written in English.

## Current Build Status

The repository contains the complete local practice game and the implemented
on-chain friend-match client/contract stack through Phase 9. Practice remains
wallet-free. On-chain routes support Privy external wallets, Arbitrum Sepolia,
strict friend invites, encrypted fleet submission, contract-derived battle
results, recovery, and terminal states.

Playable now:

- mobile-first 3D scene (React Three Fiber and Three.js) with home, placement,
  battle, and game-over screens;
- manual and automatic fleet placement with the classic no-touch rule;
- practice match against a local bot with `Easy`, `Normal`, and `Hard`
  difficulties;
- attack projectile, miss, hit, and sunk effects with synthesized sound;
- wallet-aware `/match/new` and `/match/:deploymentId/:matchId` routes;
- typed contract clients and a Hardhat `BattleshipGame` package with CoFHE
  encrypted fleet validation and shot resolution;
- pending transaction recovery, mobile handoff recovery, reduced-motion and
  graphics controls, adversarial/property/privacy tests, and two-wallet E2E.

Still pending:

- an immutable active Arbitrum Sepolia deployment record;
- a stable Vercel staging origin and matching Privy origin allowlist;
- funded two-wallet staging execution and physical iOS/Android acceptance;
- the Phase 10 public testnet demo.

### Run Locally

```bash
npm install
npm run dev
```

Vite prints a local URL (the dev server also listens on the LAN so a phone on
the same network can open it). `npm run build` type-checks and produces a
production bundle; `npm run preview` serves that bundle. Copy `.env.example`
to `.env.local` to enable wallet routes. Without `VITE_PRIVY_APP_ID`, practice
mode still works and on-chain routes show a configuration message.

## Documentation

Current build documentation:

- [Game Implementation Roadmap](docs/game-implementation-roadmap.md) - active engineering sequence from the local practice build to the public Privy/CoFHE friend-match MVP.
- [Phase 9 Release QA](docs/phase-9-release-qa.md) - security evidence, release commands, accepted limitations, and Phase 10 gates.
- [Current Playable Build](docs/current-playable-build.md) - what the game does today, how to run it, and how the prototype maps to the on-chain target.
- [Local Game Engine](docs/local-game-engine.md) - exact rules implemented by the local engine: board indexing, fleet, placement, attacks, and turn passing.
- [Practice Mode and Bot AI](docs/practice-mode-and-bot-ai.md) - the local practice bot: difficulty behavior, public-information targeting, and migration paths.
- [Runtime Asset Pipeline](docs/runtime-asset-pipeline.md) - how 3D assets flow from sources to the running game: locations, formats, normalization, preload, and replacement steps.
- [VFX Forge Workflow](docs/vfx-forge-workflow.md) - producing the animated `vfx-*` GLB effects with the standalone studio in `vfx-app/`.
- [Mobile Performance Budget](docs/mobile-performance-budget.md) - measured baseline plus frame-rate, load, asset, shadow, and lighting budgets new work must fit.
- [Local Prototype Test Plan](docs/local-prototype-test-plan.md) - milestone 0 testing for the current build: engine units, deterministic bot tests, screen smoke, and Playwright flows.
- [Copy and UI Implementation Sync](docs/copy-implementation-sync.md) - exact practice-build strings, intentional differences from the target copy deck, and migration rules.

For the target on-chain product, read the documents in this order:

1. [Project Description](docs/project-description.md) - high-level product direction.
2. [Game Mechanics](docs/game-mechanics.md) - base Battleship rules and gameplay loop.
3. [Smart Contract Design](docs/smart-contract-design.md) - on-chain PvP flow, Fhenix usage, and contract responsibilities.
4. [Fhenix Integration Plan](docs/fhenix-integration-plan.md) - concrete SDK, encryption, permit, and decrypt flows.
5. [Technical Architecture](docs/technical-architecture.md) - full system shape and implementation boundaries.
6. [Contract Data Model](docs/contract-data-model.md) - storage structures, enums, public fields, and encrypted fields.
7. [Contract API Specification](docs/contract-api.md) - functions, events, errors, access rules, and frontend expectations.
8. [Frontend Architecture](docs/frontend-architecture.md) - mobile web app layers, routes, stores, wallet, Fhenix, and 3D boundaries.
9. [Network and Wallet Requirements](docs/network-and-wallet-requirements.md) - Privy wallet scope, Arbitrum Sepolia guard, mobile return, funding, and recovery rules.
10. [Deployment Plan](docs/deployment-plan.md) - Vercel hosting, Privy origins, contract records, release checks, rollback, and redeploy rules.
11. [Security and Fair Play](docs/security-and-fair-play.md) - hidden-state threat model, trust boundaries, and fair-play controls.
12. [Testing Strategy](docs/testing-strategy.md) - contract, Fhenix, frontend, mobile, and end-to-end test plan.
13. [Copy Deck](docs/copy-deck.md) - centralized English UI labels, states, errors, and accessibility copy.
14. [Backendless Computer Opponent Design](docs/computer-opponent-design.md) - optional on-chain bot mode without a gameplay backend.
15. [Visual Style Guide](docs/visual-style-guide.md) - overall art direction and rendering language.
16. [Interface and Buttons Guide](docs/interface-and-buttons-guide.md) - menu, opponent selection, HUD, and button system.
17. [User Flows](docs/user-flows.md) - player journeys for the friend-match MVP.
18. [Documentation Audit](docs/documentation-audit.md) - current coverage, readiness, and remaining drift risks.
19. [Documentation Roadmap](docs/documentation-roadmap.md) - completed documentation phases and the triggers for the implementation refresh.

## Asset Planning

3D model planning lives in:

- [3D Model Catalog](assets/3d-models/README.md)
- [3D Model Prompts](assets/3d-models/prompts)

## MVP Focus

The first version should prioritize:

- mobile browser gameplay;
- wallet connection;
- Arbitrum Sepolia support;
- private friend PvP matches;
- encrypted fleet placement through Fhenix/CoFHE;
- on-chain turn system;
- on-chain hit, miss, sunk, and win resolution;
- 3D tactical ocean board;
- English-only interface.

## Not in MVP

The first version does not need:

- solo campaign;
- AI opponent as a primary product mode;
- ranking;
- tournaments;
- NFT ships;
- marketplace;
- chat;
- clans;
- full native mobile app.
