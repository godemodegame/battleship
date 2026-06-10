# On-chain 3D Battleship

## Overview

This project is a mobile-first 3D PvP Battleship-style browser game. Players connect wallets, create or join matches, place fleets, and take turns attacking the opponent's board.

The game must be fully on-chain for match state and rules, use Fhenix/CoFHE for private encrypted gameplay state, and run on Arbitrum Sepolia for the MVP.

All project documentation, game UI text, player-facing copy, errors, labels, and prompts must be written in English.

## Current Build Status

The repository contains a playable local practice build. It is a complete
player-versus-bot slice of the game running entirely in the browser with no
backend, wallet, or chain interaction.

Playable now:

- mobile-first 3D scene (React Three Fiber and Three.js) with home, placement,
  battle, and game-over screens;
- manual and automatic fleet placement with the classic no-touch rule;
- practice match against a local bot with `Easy`, `Normal`, and `Hard`
  difficulties;
- attack projectile, miss, hit, and sunk effects with synthesized sound.

Future milestones (designed in the docs, not implemented):

- wallet connection (Privy) and Arbitrum Sepolia network guard;
- smart contract package and on-chain friend matches;
- Fhenix/CoFHE encrypted fleet state;
- automated tests and production deployment.

### Run Locally

```bash
npm install
npm run dev
```

Vite prints a local URL (the dev server also listens on the LAN so a phone on
the same network can open it). `npm run build` type-checks and produces a
production bundle; `npm run preview` serves that bundle.

## Documentation

Current build documentation:

- [Current Playable Build](docs/current-playable-build.md) - what the game does today, how to run it, and how the prototype maps to the on-chain target.
- [Local Game Engine](docs/local-game-engine.md) - exact rules implemented by the local engine: board indexing, fleet, placement, attacks, and turn passing.
- [Practice Mode and Bot AI](docs/practice-mode-and-bot-ai.md) - the local practice bot: difficulty behavior, public-information targeting, and migration paths.
- [Runtime Asset Pipeline](docs/runtime-asset-pipeline.md) - how 3D assets flow from sources to the running game: locations, formats, normalization, preload, and replacement steps.

For the target on-chain product, read the documents in this order:

1. [Project Description](docs/project-description.md) - high-level product direction.
2. [Game Mechanics](docs/game-mechanics.md) - base Battleship rules and gameplay loop.
3. [Smart Contract Design](docs/smart-contract-design.md) - on-chain PvP flow, Fhenix usage, and contract responsibilities.
4. [Fhenix Integration Plan](docs/fhenix-integration-plan.md) - concrete SDK, encryption, permit, and decrypt flows.
5. [Technical Architecture](docs/technical-architecture.md) - full system shape and implementation boundaries.
6. [Contract Data Model](docs/contract-data-model.md) - storage structures, enums, public fields, and encrypted fields.
7. [Contract API Specification](docs/contract-api.md) - functions, events, errors, access rules, and frontend expectations.
8. [Frontend Architecture](docs/frontend-architecture.md) - mobile web app layers, routes, stores, wallet, Fhenix, and 3D boundaries.
9. [Security and Fair Play](docs/security-and-fair-play.md) - hidden-state threat model, trust boundaries, and fair-play controls.
10. [Testing Strategy](docs/testing-strategy.md) - contract, Fhenix, frontend, mobile, and end-to-end test plan.
11. [Copy Deck](docs/copy-deck.md) - centralized English UI labels, states, errors, and accessibility copy.
12. [Backendless Computer Opponent Design](docs/computer-opponent-design.md) - optional on-chain bot mode without a gameplay backend.
13. [Visual Style Guide](docs/visual-style-guide.md) - overall art direction and rendering language.
14. [Interface and Buttons Guide](docs/interface-and-buttons-guide.md) - menu, opponent selection, HUD, and button system.
15. [User Flows](docs/user-flows.md) - player journeys for the friend-match MVP.
16. [Documentation Audit](docs/documentation-audit.md) - current coverage and missing implementation docs.
17. [Documentation Roadmap](docs/documentation-roadmap.md) - what should be documented next.

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
