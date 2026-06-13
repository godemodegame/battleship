# Deployment Plan

## Purpose

This document defines the path from the implemented Phase 9 release candidate
to a public Arbitrum Sepolia demo.

It covers frontend hosting, contract deployment, Privy origins, environment
variables, deployment records, release checks, rollback, and contract
redeployment.

## Current State

The repository currently has:

- routed Vite React practice and on-chain applications;
- Privy external-wallet configuration and public environment variables;
- Hardhat/CoFHE contract package, generated ABI, deploy/validate scripts, and a
  pending immutable deployment id;
- Vercel SPA rewrite configuration and GitHub Actions CI;
- release artifact/config verification and a funded two-wallet testnet
  regression command;
- stable public staging and production Vercel origins serving the practice
  release-controls candidate with environment-specific pending deployment ids;
- build-embedded `/release.json`, public deployment smoke tests, immutable
  manifest sync tooling, and a manual GitHub release gate;
- an active, immutable Arbitrum Sepolia staging contract and funded
  create/join/cancel evidence;
- no production-demo contract deployment yet.

## Deployment Decisions

- Host the frontend as a static Vite application on Vercel.
- Use Vercel Git integration for preview builds and explicit stable-domain
  promotion for staging and production.
- Keep gameplay authority in Arbitrum Sepolia contracts, not Vercel Functions.
- Use a stable staging domain for wallet and on-chain testing.
- Use Privy app ids and allowed origins scoped by environment.
- Deploy contracts explicitly before deploying a frontend that references them.
- Treat every contract deployment as immutable and give it a unique
  `deploymentId`.
- Include `deploymentId` in match routes so old invite links continue pointing
  to the correct contract.
- Do not use an upgradeable proxy in the first MVP unless a separate security
  review approves it.

## Environments

| Environment | Frontend | Wallet/on-chain scope | Contract |
| --- | --- | --- | --- |
| Local | Vite dev server | Practice; optional Privy development app; browser/CoFHE mocks | Local Hardhat/CoFHE mock |
| PR preview | Vercel preview URL | Practice and visual review by default | None or read-only configured test contract |
| Staging | Stable owned staging domain | Full Privy and funded two-wallet E2E | Dedicated Arbitrum Sepolia staging deployment |
| Production demo | Production custom domain | Public testnet demo | Versioned Arbitrum Sepolia release deployment |

Generic `*.vercel.app` preview origins must not be broadly allowlisted in the
production Privy app. If an individual preview needs wallet testing, use an
exact allowlisted origin or a controlled custom preview domain. Routine PR
previews should keep on-chain actions disabled and remain useful for practice,
layout, asset, and copy review.

## Local Development

Current frontend:

```bash
npm ci
npm run dev
```

Production-equivalent local frontend:

```bash
npm run build
npm run preview
```

When the contract package exists, it should expose stable scripts:

```bash
npm --prefix contracts ci
npm --prefix contracts test
npm --prefix contracts run node
npm --prefix contracts run deploy:arb-sepolia
```

The exact underlying Hardhat commands may change. Release documentation and CI
should call package scripts rather than duplicating long CLI commands.

## Frontend Hosting

Connect the GitHub repository to one Vercel project.

Required project settings:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Production branch | `main` |
| Node.js | `20.x`, matching the current local and CoFHE baseline |
| Automatic custom-domain assignment | Disabled |

Vercel copies Vite's `dist` output and the assets brought in from `public/`.
No server runtime is required for the current app.

When client-side match routes are introduced, add a version-controlled
`vercel.json` SPA rewrite:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Verify direct navigation and refresh for every route after adding this rewrite.

Git deployments may create branch and production deployment URLs, but they
must not automatically move the stable staging or production domains. Promote
or roll back a release by explicitly assigning the appropriate stable alias to
an exact, already-verified Vercel deployment:

```bash
vercel alias set <deployment-hostname> <stable-domain>
```

Do not add a gameplay API or authoritative move resolver as a Vercel Function.
Optional future metadata or read-only indexing services must remain
non-authoritative.

## Privy Deployment Configuration

Use separate Privy app clients or app ids for staging and the production demo
when possible.

Allowed origins:

- local development: exact localhost origins used by the team;
- staging: the exact stable staging origin or a controlled owned-domain
  wildcard;
- production: the exact production origin;
- PR previews: exact origins only when wallet testing is required.

Do not allowlist a generic `https://*.vercel.app` pattern. Privy documents this
as unsafe because unrelated Vercel accounts can create matching domains.

Before a release:

1. Add the target HTTPS origin in the Privy dashboard.
2. Confirm wallet login plus the intended social/email methods are enabled
   (each social provider has working dashboard credentials).
3. Confirm embedded wallets are enabled (`createOnLogin: 'users-without-wallets'`).
4. Confirm gas sponsorship is set to "App pays" for Arbitrum Sepolia (`421614`).
5. Confirm Arbitrum Sepolia is the only supported application chain.
6. Test wallet login, social/email login, an embedded-wallet gasless write,
   chain switching, sign-out, and mobile-wallet return from the deployed origin.

The Privy app id is public client configuration. Origin restrictions and
dashboard settings still need production review.

## Environment Variables

All `VITE_*` variables are embedded into the browser bundle and must be treated
as public.

Frontend variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_PRIVY_APP_ID` | On-chain builds | Environment-specific Privy application |
| `VITE_ARBITRUM_SEPOLIA_RPC_URL` | On-chain builds | Browser public RPC |
| `VITE_ACTIVE_DEPLOYMENT_ID` | On-chain builds | Selects the committed deployment record |
| `VITE_BATTLESHIP_CONTRACT_ADDRESS` | On-chain builds | Build-time assertion against the selected record |
| `VITE_INDEXER_URL` | Optional | Read-only indexer endpoint |

The chain id is a code constant (`421614`), not a configurable deployment
choice.

Contract deployment variables:

| Variable | Scope | Purpose |
| --- | --- | --- |
| `PRIVATE_KEY` | Local secret or protected CI secret | Dedicated funded deployer |
| `ARBITRUM_SEPOLIA_RPC_URL` | Contract deploy environment | Deployment RPC |
| `ARBISCAN_API_KEY` | Optional protected secret | Source verification |

Rules:

- never prefix a private key or deploy credential with `VITE_`;
- never store the deployer key in Vercel frontend environment variables;
- never commit `.env`, `.env.local`, Vercel link state, seed phrases, or keystore
  passwords;
- use separate deployer and gameplay test wallets;
- rotate a compromised deployer instead of reusing it.

Vercel Preview and Production environment variables are separate. Changing an
environment variable affects only new deployments, so redeploy after any
configuration change.

## Contract Package Target

Create a dedicated `contracts/` package using Hardhat and the CoFHE Hardhat
plugin.

The plugin currently provides the `arb-sepolia` network for chain id `421614`.
Pin compatible versions of:

- `@cofhe/hardhat-plugin`;
- `cofhejs 0.3.1`;
- `@cofhe/mock-contracts`;
- `@fhenixprotocol/cofhe-contracts`;
- Solidity compiler and Hardhat.

Do not combine a dependency upgrade with a release deployment unless both mock
and testnet regression tests pass.

Required contract scripts:

```json
{
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test",
    "deploy:arb-sepolia": "hardhat run scripts/deploy.ts --network arb-sepolia",
    "verify:arb-sepolia": "hardhat run scripts/verify.ts --network arb-sepolia"
  }
}
```

Script names are the stable project interface. Implementation may use a Hardhat
task instead of `hardhat run` if the result is deterministic and documented.

## Contract Deployment Workflow

Before deployment:

1. Start from a clean tagged or release-candidate commit.
2. Install dependencies from lockfiles.
3. Run contract formatting, compile, unit, mock CoFHE, and security tests.
4. Run frontend type-check/build against generated types.
5. Record exact CoFHE package and compiler versions.
6. Confirm the deployer is funded with Arbitrum Sepolia ETH.
7. Confirm `ARBITRUM_SEPOLIA_RPC_URL` reports chain id `421614`.
8. Estimate deployment gas and keep a buffer for verification or recovery.

Deploy:

1. Run the versioned `deploy:arb-sepolia` script.
2. Wait for the deployment receipt.
3. Check that runtime bytecode exists at the address.
4. Run read-only deployment sanity calls.
5. Verify source on Arbiscan when supported.
6. Run a minimal two-wallet encrypted happy path before marking the deployment
   usable.

Never deploy contracts as a side effect of a Vercel frontend build.

## Deployment Records

Every deployment must create a committed record:

```txt
contracts/
  deployments/
    421614/
      arb-sepolia-v1.json
```

Minimum record:

```json
{
  "deploymentId": "arb-sepolia-v1",
  "chainId": 421614,
  "contractName": "BattleshipGame",
  "address": "0x...",
  "deploymentTx": "0x...",
  "deploymentBlock": 0,
  "sourceCommit": "git-sha",
  "compilerVersion": "exact-version",
  "cofheVersions": {},
  "abiSha256": "sha256:...",
  "deployedAt": "ISO-8601 timestamp"
}
```

Realized in Phase 3 (`contracts/scripts/deploymentRecord.ts`): the committed
record is a superset of the minimum above, adding `schemaVersion: 1`,
`status: "active"`, a populated `cofheVersions` map, and
`deployedBytecodeKeccak256` (hash of the on-chain runtime code, which must
equal the compiled artifact because the contract has no constructor arguments
or immutables). Phase 10 also records deployment gas, gas price, and fee as
decimal strings. `contracts/scripts/deploy.ts` writes records and refuses to
reuse a `deploymentId`; `contracts/scripts/validate-deployment.ts` validates
schema, ABI hash, chain id, and bytecode against an RPC. Local hardhat-node
records under `contracts/deployments/31337/` are not committed.

`npm run release:sync-manifest -- <record>` copies the public fields from a
generated contract record into the frontend manifest. It can replace a pending
reservation, but refuses to change the address of an active deployment id.
Every Vite build emits `/release.json`, allowing a deployed URL to prove its
source commit, deployment id/status, chain, address, deployment transaction,
and ABI hash before promotion or rollback.

Rules:

- never edit the address of an existing `deploymentId`;
- create a new record for every redeployment, even when bytecode is unchanged;
- generate frontend ABI/types from the same compiled artifact;
- commit the deployment record, ABI, generated type, and release note together;
- validate that `VITE_BATTLESHIP_CONTRACT_ADDRESS` matches the selected record
  during the frontend build;
- validate that bytecode exists before enabling on-chain actions.

## Match Link Versioning

Use:

```txt
/match/:deploymentId/:matchId
```

Example:

```txt
https://game.example/match/arb-sepolia-v1/123
```

The frontend resolves `deploymentId` through the committed deployment
manifest. It must reject:

- unknown deployment ids;
- records whose chain id is not `421614`;
- environment-address mismatches;
- records with no runtime bytecode at the configured address.

This keeps old invite links valid after a new contract is deployed and prevents
match id `123` from being interpreted against the wrong contract.

## Preview Workflow

For every feature branch or pull request:

1. Run `npm ci`.
2. Run `npm run build`.
3. Run available unit and smoke tests.
4. Let Vercel create a preview deployment through Git integration.
5. Verify the home, placement, battle, game-over, asset-loading, and mobile
   layout paths.
6. Keep on-chain actions disabled unless the exact preview origin and a safe
   test deployment are configured.

When automated Playwright tests exist, run them against the preview URL before
merge.

## Staging Release Workflow

Staging is the required full wallet and contract gate:

1. Deploy or select a dedicated staging contract record.
2. Set staging Vercel variables to that `deploymentId`.
3. Configure the stable staging origin in the staging Privy app.
4. Deploy the release-candidate commit.
5. Verify direct SPA route refresh.
6. Connect two funded external wallets.
7. Complete create, invite, join, fleet submit, validation, attack, resolve,
   forfeit, timeout, and terminal-state recovery checks.
8. Repeat connection and one transaction on iOS Safari and Android Chrome.
9. Reload during placement validation and shot resolution.
10. Confirm no plaintext fleet data appears in storage, logs, URLs, analytics,
    or errors.

Do not promote a release that has only been tested in local CoFHE mocks.

## Production Demo Checklist

Contract:

- release deployment record is committed;
- source commit and ABI hash match;
- bytecode and chain id are verified;
- Arbiscan link works;
- testnet happy path completed;
- known limitations are documented;
- pause/recovery authority, if any, is identified.

Frontend:

- `npm ci` and `npm run build` pass from a clean checkout;
- production environment points to the intended immutable deployment record;
- production Privy origin is configured;
- SPA route refresh works;
- required models and textures return `200`;
- no source maps or logs reveal sensitive values;
- practice mode remains available without a wallet;
- mobile performance remains inside `docs/mobile-performance-budget.md`.

Operational:

- two funded regression wallets are available;
- deployer key is stored outside the repository and frontend host;
- contract and frontend release commits are recorded;
- rollback owner is known;
- release notes include contract address, deployment id, and explorer link.

Automated release gate:

```bash
REQUIRE_ACTIVE_DEPLOYMENT=1 npm run verify:release
PUBLIC_DEMO_URL=https://stable.example \
  VITE_ACTIVE_DEPLOYMENT_ID=arb-sepolia-v1 \
  REQUIRE_ACTIVE_DEPLOYMENT=1 \
  npm run release:verify-public
PUBLIC_DEMO_URL=https://stable.example \
  VITE_ACTIVE_DEPLOYMENT_ID=arb-sepolia-v1 \
  REQUIRE_ACTIVE_DEPLOYMENT=1 \
  npm run test:public
```

The manual `Phase 10 Release Gate` GitHub workflow runs those checks together
with live record validation and the funded two-wallet regression. Its GitHub
environment must contain the public Vite variables as environment variables
and RPC/test-wallet credentials as secrets.

## Frontend Rollback

For a frontend-only regression:

1. Stop further production deployments.
2. Roll Vercel production back to the last known-good deployment.
3. Confirm its environment variables still reference a compatible deployment
   record.
4. Smoke-test practice mode, wallet connection, and a read-only match route.
5. Fix forward on a new branch.

A frontend rollback does not revert transactions or contract state.

Do not roll back to a frontend that cannot understand the currently active
contract ABI or deployment manifest.

## Contract Redeploy Rules

Contracts are immutable for the MVP:

- never overwrite an old deployment record;
- never reuse a `deploymentId`;
- deploy a new contract for bytecode or constructor changes;
- keep old deployment records and ABIs so existing match links can resolve;
- direct new match creation to the new active deployment only after staging
  validation;
- allow existing matches to finish on the old contract when safe;
- if the old contract is unsafe and supports pause, pause it through the
  documented authority;
- do not claim that a frontend button can disable direct contract calls.

There is no automatic state migration between contract deployments. Any future
proxy, migration, or cross-contract registry requires its own design and
security review.

## Failure Scenarios

| Failure | Response |
| --- | --- |
| Vercel build fails | Keep previous production deployment; fix build |
| Privy `invalid_origin` | Correct exact allowed origin; redeploy only if app id changed |
| RPC rate limit | Switch configured public RPC and redeploy frontend |
| Wrong contract address | Disable writes, restore correct deployment variables, redeploy |
| Contract deploy receipt fails | Do not create deployment record; investigate and redeploy with a new transaction |
| Contract deploy succeeds but smoke test fails | Record as rejected deployment; do not make active |
| ABI mismatch | Block release; regenerate from the deployed source commit |
| Mobile wallet return loses UI state | Refetch wallet, receipt, and contract state; do not resubmit blindly |
| Fhenix finalization stalls | Use documented permissionless recovery/timeout path; do not fabricate a result |

## Acceptance Criteria

Deployment preparation is complete when:

- a clean checkout builds reproducibly;
- Vercel preview and production settings are documented;
- Privy origins are separated by environment;
- no deploy secret can enter the Vite bundle;
- the future contract package has stable compile/test/deploy script contracts;
- deployment records and match-link versioning prevent address ambiguity;
- staging requires a real two-wallet Arbitrum Sepolia test;
- frontend rollback and contract redeploy are separate procedures.

## Official References

Verified on June 10, 2026:

- Vite on Vercel:
  https://vercel.com/docs/frameworks/frontend/vite
- Vercel environments:
  https://vercel.com/docs/deployments/environments
- Vercel environment variables:
  https://vercel.com/docs/environment-variables
- Vercel supported Node.js versions:
  https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Privy allowed domains:
  https://docs.privy.io/recipes/react/allowed-domains
- Privy app clients and allowed origins:
  https://docs.privy.io/basics/get-started/dashboard/app-clients
- CoFHE Hardhat quick start:
  https://cofhe-docs.fhenix.zone/fhe-library/introduction/quick-start
- CoFHE Hardhat plugin networks:
  https://cofhe-docs.fhenix.zone/client-sdk/hardhat-plugin/getting-started
- Arbitrum Solidity deployment quick start:
  https://docs.arbitrum.io/build-decentralized-apps/quickstart-solidity-remix

Recheck provider and SDK release notes before the first public deployment.
