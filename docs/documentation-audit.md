# Documentation Audit

## Purpose

This document summarizes the current documentation coverage and identifies what is missing before implementation should begin.

## Current State

The project already has a strong concept and planning base:

- high-level project direction;
- English-only rule;
- mobile-first browser requirement;
- fully on-chain PvP requirement;
- Arbitrum Sepolia as the MVP network;
- Fhenix/CoFHE as the privacy layer;
- Fhenix SDK and decrypt-flow integration plan;
- technical architecture;
- frontend architecture;
- security and fair play model;
- testing strategy;
- copy deck;
- contract data model;
- contract API;
- core Battleship mechanics;
- smart contract behavior outline;
- backendless computer opponent concept;
- friend-match user flows;
- visual style direction;
- UI and button guide;
- 3D model catalog and generation prompts.

This is enough to understand the product vision, system shape, frontend structure, security boundaries, test expectations, and player-facing copy.

## Main Missing Layer

The biggest missing layer is now asset production workflow and final implementation decisions.

The docs describe the destination, system shape, contract API, frontend structure, security model, testing strategy, and UI copy. They do not yet define exact details for:

- mobile performance budgets;
- asset production workflow;
- deployment workflow.

## Critical Gaps

## 1. Asset Production Pipeline

Missing file:

- `docs/asset-production-pipeline.md`

Why it matters:

The project has prompts, but not a production workflow for turning generated models into runtime assets:

- generation;
- review;
- cleanup;
- retopology;
- material setup;
- texture compression;
- `.glb` export;
- LOD creation;
- import validation;
- mobile performance checks.

Ownership:

- user-owned.

## 2. Mobile Performance Budget

Recommended file:

- `docs/mobile-performance-budget.md`

Why it matters:

The game must run in a mobile browser with 3D rendering, wallet flows, and Fhenix encryption. A budget should define:

- FPS target;
- model polygon limits;
- texture limits;
- shader limits;
- initial load budget;
- battery and thermal expectations;
- fallback graphics modes.

## 3. Network and Wallet Requirements

Recommended file:

- `docs/network-and-wallet-requirements.md`

Why it matters:

Wallet and network behavior are core gameplay dependencies. This file should define:

- Arbitrum Sepolia configuration;
- required chain id `421614`;
- supported wallet types;
- WalletConnect behavior;
- mobile wallet app switching;
- wrong-network recovery;
- funded test wallet expectations.

## 4. Deployment Plan

Recommended file:

- `docs/deployment-plan.md`

Why it matters:

The project needs a clean path from local prototype to testnet demo:

- local frontend;
- local contract tests;
- Fhenix mock environment;
- Arbitrum Sepolia deployment;
- frontend contract address configuration;
- preview deployment;
- versioned ABI handling.

## Important Missing Decisions

These decisions should be made soon:

- exact contract development stack;
- exact encrypted fleet encoding;
- whether MVP uses manual placement, auto placement, or both;
- whether classic no-touch placement is enforced in MVP;
- whether backendless bot mode is included in MVP or phase two;
- whether an indexer is included in MVP or deferred;
- whether the first build uses PWA support;
- how Fhenix pending states are represented in UI;
- how many transactions are acceptable per turn;
- what gas and latency are acceptable on Arbitrum Sepolia.

## Lower Priority Gaps

These are useful but should wait until the technical path is clearer:

- sound and music direction;
- animation timing bible;
- mobile app wrapper plan;
- ranking design;
- tournament design;
- NFT ship design;
- marketplace design;
- social sharing design;
- brand and logo guide;
- public website or landing page copy.

## Recommended Next Documents

Write these in order:

1. `docs/asset-production-pipeline.md` - user-owned.
2. `docs/mobile-performance-budget.md`
3. `docs/network-and-wallet-requirements.md`
4. `docs/deployment-plan.md`

The first item is the remaining high-value planning document before art assets move into runtime production. The other documents can be added as implementation begins.

## Readiness Assessment

Current documentation readiness:

- product vision: strong;
- gameplay concept: good;
- visual direction: strong;
- interface direction: good;
- user flows: good;
- technical architecture: good;
- contract data model: good;
- contract API: good;
- smart contract behavior: medium;
- Fhenix implementation detail: good;
- frontend implementation detail: good;
- testing plan: good;
- security model: good;
- copy deck: good;
- asset production workflow: missing.

The project is ready to start implementation planning. The main documentation task left outside engineering is the user-owned asset production pipeline.
