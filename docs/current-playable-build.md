# Current Playable Build

## Purpose

This document describes repository behavior after Phase 9. The codebase has
two deliberately separate modes:

- wallet-free local practice against a bot;
- wallet-backed encrypted friend matches whose state and results come from
  `BattleshipGame`.

The public Arbitrum Sepolia deployment is still pending Phase 10. Local mocks
and automated tests exercise the complete frontend flow without pretending
that a live contract already exists.

## Run Locally

```bash
npm install
npm run dev
```

Practice works with no environment variables. To load Privy and wallet routes,
copy `.env.example` to `.env.local` and set:

```txt
VITE_PRIVY_APP_ID=
VITE_ARBITRUM_SEPOLIA_RPC_URL=
VITE_ACTIVE_DEPLOYMENT_ID=
VITE_BATTLESHIP_CONTRACT_ADDRESS=
```

All `VITE_*` values are public browser configuration. Private keys belong only
in contract deployment or funded-regression environments.

Useful commands:

```bash
npm run build
npm test
npm run test:e2e
npm run verify:release
npm run test:contracts
```

## Routes

| Route | Behavior |
| --- | --- |
| `/` | Wallet-aware entry/onboarding |
| `/practice` | Local 3D practice game |
| `/match/new` | Strict friend-match creation |
| `/match/:deploymentId/:matchId` | Contract-derived join, placement, battle, recovery, and summary states |

Unknown deployments and missing contracts fail closed. The committed
`arb-sepolia-v1` record is currently `pending`, so real writes remain disabled
until Phase 10 commits an active record.

## Practice Mode

Practice is fully local and playable without a wallet:

- `Easy`, `Normal`, and `Hard` bot difficulties;
- manual or seeded automatic no-touch fleet placement;
- hit/sunk keeps the turn and miss passes it;
- projectile, hit, miss, sunk, sound, haptics, and summary effects;
- forfeit, rematch, reduced motion, and graphics quality controls.

The practice Zustand store is authoritative only for practice. It contains
both plaintext boards and calls the local engine directly.

## On-chain Friend Matches

The implemented friend flow supports:

- Privy wallet-only external EVM connection;
- Arbitrum Sepolia chain guard and balance guidance;
- immutable deployment-id match links;
- create, invite, join, cancel, forfeit, and timeout writes;
- transient local placement followed by CoFHE encryption;
- encrypted fleet validation and permissionless finalization/retry;
- contract-authoritative attacks, public move history, and terminal summaries;
- receipt replacement/drop handling and suspension recovery;
- account, chain, route, deployment, and disconnect private-state clearing.

The frontend never supplies hit, miss, sunk, win, fleet-validity, or winner
values. It refetches authoritative contract reads after receipts and events.

## Privacy

Plaintext fleet cells may exist only in the scoped placement store before
encryption. They are not written to localStorage, sessionStorage, URLs, logs,
analytics, contract calldata, or event payloads.

After a successful submission receipt, or when the account/chain/match scope
changes, the placement is cleared and the CoFHE client is disposed.

Allowed persistence is limited to device preferences and public recovery data:

- sound/haptic/display preferences in localStorage;
- public mobile-handoff intent in sessionStorage;
- public pending transaction hashes and scopes in sessionStorage.

## Contract Package

`contracts/` contains:

- Solidity `0.8.25`, Cancun EVM target, optimizer runs `800`;
- Hardhat `2.28.6`, ethers `6.16.0`, CoFHE packages pinned to the compatible
  Phase 4 versions;
- generated `contracts/abi/BattleshipGame.json` and
  `src/onchain/abi/battleshipGame.ts`;
- deterministic deployment records with ABI and runtime-bytecode hashes;
- lifecycle, encrypted rules, benchmarks, property/fuzz, adversarial, and
  privacy suites;
- a funded Arbitrum Sepolia create/join/cancel regression command.

## Known Limitations

- No active public contract or production demo is committed yet.
- Privy allowed-origin state must be checked in its dashboard for each deployed
  HTTPS origin.
- Physical iOS Safari and Android Chrome acceptance remains a Phase 10 staging
  check.
- Exact owner-fleet geometry after plaintext clearing is intentionally not
  rendered; adding it requires an authorized privacy-reviewed view flow.
- No PWA/offline gameplay, indexer, open matchmaking, rankings, wagers, NFTs,
  chat, account abstraction, or mainnet deployment.

## Release Evidence

See:

- `docs/phase-9-release-qa.md`;
- `docs/game-implementation-roadmap.md`;
- `docs/testing-strategy.md`;
- `docs/security-and-fair-play.md`;
- `docs/deployment-plan.md`.
