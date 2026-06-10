# Documentation Audit

## Purpose

This document summarizes documentation coverage after the local practice build
was implemented and the documentation roadmap through on-chain integration
preparation was completed.

Audit date:

- June 10, 2026.

## Repository Reality

Playable now:

- Vite React TypeScript frontend;
- React Three Fiber and Three.js scene;
- local Zustand state;
- home, placement, battle, and game-over screens;
- manual and automatic fleet placement;
- classic no-touch placement validation;
- local player-versus-bot practice match;
- `Easy`, `Normal`, and `Hard` bot difficulties;
- projectile, miss, hit, and sunk effects;
- runtime FBX/GLB models and JPG textures;
- synthesized sound and persisted mute state;
- standalone `vfx-app` for generating the runtime VFX GLBs.

Not implemented:

- Privy wallet connection;
- Arbitrum Sepolia network guard;
- smart contract package;
- Fhenix/CoFHE client integration;
- encrypted fleet submission;
- on-chain friend-match flow;
- contract event sync;
- automated tests;
- Vercel project and public deployment.

The docs distinguish these two states. Target architecture must not be read as
implemented behavior.

## Completed Current-Build Documentation

| Area | Document | Status |
| --- | --- | --- |
| Playable scope | `docs/current-playable-build.md` | Current |
| Local rules | `docs/local-game-engine.md` | Current |
| Practice bot | `docs/practice-mode-and-bot-ai.md` | Current |
| Runtime assets | `docs/runtime-asset-pipeline.md` | Current |
| VFX production | `docs/vfx-forge-workflow.md` | Current |
| Mobile budget | `docs/mobile-performance-budget.md` | Current |
| Prototype tests | `docs/local-prototype-test-plan.md` | Plan complete; tests not implemented |
| Shipped UI copy | `docs/copy-implementation-sync.md` | Current |

The README links these documents before the target on-chain design set.

## Updated Existing Documents

The following stale areas were revised:

- `README.md` now states what is playable and how to run it.
- `docs/game-mechanics.md` identifies manual placement and local bot practice as
  implemented.
- `docs/frontend-architecture.md` describes the current monolithic practice
  store and maps it to contract-derived state and events.
- `docs/interface-and-buttons-guide.md` documents the current practice-first
  entry before the target wallet-first flow.
- `assets/3d-models/README.md` records the generated source and runtime assets.
- `docs/computer-opponent-design.md` separates the local frontend bot from the
  future on-chain bot concept.
- `docs/testing-strategy.md` starts with the local prototype milestone.
- `docs/copy-deck.md` points to the current implementation copy map.
- `docs/technical-architecture.md`, `docs/fhenix-integration-plan.md`, and
  `docs/project-description.md` record Privy as the wallet connection layer.

## On-chain Preparation Coverage

| Area | Document | Decision captured |
| --- | --- | --- |
| Wallet and chain | `docs/network-and-wallet-requirements.md` | Privy wallet-only external wallets; Arbitrum Sepolia `421614`; recovery rules |
| Frontend migration | `docs/frontend-architecture.md` | Practice/on-chain separation; state and event mapping; public render model |
| Deployment | `docs/deployment-plan.md` | Vercel static host; Privy origins; immutable deployment records; rollback |
| Contract storage | `docs/contract-data-model.md` | Public and encrypted state model |
| Contract API | `docs/contract-api.md` | Writes, reads, events, errors, and finalization |
| Fhenix | `docs/fhenix-integration-plan.md` | CoFHE client and encrypted operation plan |
| Security | `docs/security-and-fair-play.md` | Hidden-state and trust boundaries |
| End-to-end flows | `docs/user-flows.md` | Friend match player journeys |

## Important Decisions Now Explicit

- Privy is the only wallet login and connection UI.
- The first wallet slice is wallet-only and uses external EVM wallets.
- Privy embedded wallets, social login, and smart wallets are deferred.
- Arbitrum Sepolia is the only MVP chain.
- The wallet address is the on-chain identity; the Privy user id is not a
  contract authorization identity.
- Local practice remains wallet-free and locally authoritative.
- On-chain friend matches must never use the local plaintext `MatchState` as
  authority.
- Contract events trigger refetches; contract reads remain the source of truth.
- Plaintext fleet state is cleared after encrypted submission.
- Exact owner-fleet rendering after submission is deferred until an authorized
  view design exists.
- Contract deployments are immutable and versioned by `deploymentId`.
- Match links include the deployment id to avoid address and match-id
  ambiguity.
- Vercel hosts the static frontend but does not own gameplay authority.

## Documentation Readiness

Current readiness:

- local practice onboarding for developers: strong;
- implemented game-rule reference: strong;
- current bot behavior: strong;
- asset and VFX workflow: strong;
- measurable mobile budget: strong;
- current test plan: strong, implementation pending;
- target product and contract design: strong but still hypothetical;
- Privy and network requirements: ready for implementation;
- frontend migration boundary: ready for implementation;
- deployment and rollback plan: ready for implementation;
- actual ABI and deployed-address documentation: blocked on contract code;
- actual Fhenix SDK integration notes: blocked on implementation;
- public testnet runbook evidence: blocked on deployment.

## Remaining Documentation Risks

## 1. Design-Code Drift

The contract, Fhenix, and on-chain frontend documents are pre-implementation
designs. Once code exists, generated ABI, storage, package versions, and SDK
behavior may differ.

Required response:

- update the design documents in the same pull request as implementation
  changes;
- cite generated artifacts and deployment records;
- do not preserve obsolete API names for historical consistency.

## 2. Test Plan Without Tests

`docs/local-prototype-test-plan.md` is complete, but the repository still has no
automated test suite.

Required response:

- implement engine and bot unit tests first;
- add store orchestration tests;
- add mobile and 3D browser smoke tests;
- record actual commands and results after the test tooling exists.

## 3. Owner Fleet Display

The local build renders the player's plaintext fleet for the whole match. The
on-chain privacy model clears plaintext placement after submission.

Required response:

- hide exact owner fleet geometry in the first on-chain slice; or
- design and review an authorized `decryptForView` flow before rendering it.

Do not retain plaintext merely to preserve the current visual behavior.

## 4. Provider and SDK Churn

Privy, Vercel, Arbitrum, and CoFHE documentation can change.

Required response:

- recheck official documentation before installing packages or deploying;
- pin compatible versions;
- record versions in deployment artifacts;
- update dated source references when behavior changes.

## 5. Documentation Navigation Growth

The documentation set is now large.

Required response:

- keep README ordering current;
- add links from implementation PRs to the owning specification;
- prefer updating an existing source of truth over creating overlapping notes.

## Next Audit Trigger

Run the next full documentation audit when any of these occurs:

- the automated test suite is added;
- Privy is integrated;
- the contract package is created;
- the first encrypted fleet reaches Arbitrum Sepolia;
- a contract ABI or storage layout is finalized;
- the first public Vercel deployment is released.

At that point, Phase 5 of `docs/documentation-roadmap.md` becomes active.
