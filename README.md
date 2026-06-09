# On-chain 3D Battleship

## Overview

This project is a mobile-first 3D PvP Battleship-style browser game. Players connect wallets, create or join matches, place fleets, and take turns attacking the opponent's board.

The game must be fully on-chain for match state and rules, use Fhenix/CoFHE for private encrypted gameplay state, and run on Arbitrum Sepolia for the MVP.

All project documentation, game UI text, player-facing copy, errors, labels, and prompts must be written in English.

## Playable Build

This repo contains a **playable mobile-first 3D Battleship game** built from the
specs below (Vite + React + React Three Fiber + Three.js + Zustand).

```bash
npm install
npm run dev      # http://localhost:5173  (assets are copied into public/ automatically)
npm run build    # type-check + production build into dist/
```

Flow: **Enter Battle → Choose Opponent (difficulty) → Place Fleet → Battle → Victory/Defeat.**

What is implemented:

- 10×10 board and the classic fleet (1×4, 2×3, 3×2, 4×1) with the classic
  non-touching placement rule (`docs/game-mechanics.md`);
- the real user-provided **FBX** ship/board/prop models (loaded at runtime —
  no GLB converter was available, and the files are small);
- **procedural VFX** for the projectile, miss plume, hit impact, and sunk wreck.
  These are built in code because the `vfx-*` 3D models were never produced
  (only the prompt files exist) — see `assets/3d-models/prompts/vfx-*.md`;
- neo-noir visual language, mobile-first portrait HUD, and English-only copy
  (`docs/visual-style-guide.md`, `docs/interface-and-buttons-guide.md`,
  `docs/copy-deck.md`);
- a local **Practice vs Bot** mode with easy / normal / hard strategies that
  mirror `docs/computer-opponent-design.md`.

What is scaffolded / deferred:

- the on-chain authority (Arbitrum Sepolia) and **Fhenix/CoFHE** encrypted
  gameplay. The game rules run through a single framework-agnostic engine
  (`src/game/`) deliberately shaped so an on-chain/FHE source of truth can
  replace it later. `Play Against Friend` and `Open Match` are shown as
  disabled because they require the deployed contract.

Source layout: `src/game/` (engine, fleet, bot, store), `src/three/`
(scene, board, ships, models, `vfx/`), `src/ui/` (screens + components),
`src/copy/en.ts` (all player-facing text).

## Documentation

Read the documents in this order:

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
