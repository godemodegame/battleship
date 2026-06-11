# Phase 10 Release Runbook and Notes

## Status

Phase 10 is in progress as of June 12, 2026.

The repository-side release controls and stable Vercel origins exist. The
public contract, funded two-wallet run, Privy origin confirmation, and physical
mobile acceptance cannot be marked complete until the release operator supplies
funded Arbitrum Sepolia credentials and confirms the dashboard/hardware checks.

Stable origins:

- staging: `https://battleship-staging-godemodegame.vercel.app`;
- production demo: `https://battleship-blond.vercel.app`.

Both currently serve the Phase 9 practice-capable release candidate. On-chain
writes remain disabled because `arb-sepolia-staging-v1` and
`arb-sepolia-v1` are still pending in the committed manifest.

## Release Controls

Implemented for GAME-1001 and GAME-1005 through GAME-1009:

- Vercel project settings use Vite, Node 20.x, `npm ci`, `npm run build`, and
  `dist`;
- staging and production have exact, stable HTTPS project domains rather than
  a broad `*.vercel.app` origin;
- every build emits `/release.json` with its source commit, deployment id,
  deployment status, chain id, address, deployment transaction, and ABI hash;
- `npm run release:sync-manifest -- <record>` promotes a pending manifest
  reservation from a generated contract record and refuses to change an active
  deployment's address;
- `npm run release:verify-public` checks release metadata, direct SPA routes,
  critical models/textures, response types, sizes, and request timing;
- `npm run test:public` repeats deployed desktop/mobile Chromium checks,
  including direct invite-link refresh;
- `.github/workflows/release-gate.yml` validates the exact contract bytecode,
  frontend config, public artifact, deployed routes, and funded two-wallet
  regression before promotion;
- contract deployment records now capture deployment gas and fee, while the
  funded regression can write transaction gas and wallet-to-receipt timings to
  `TESTNET_EVIDENCE_PATH`.

## Staging Procedure

1. Start from a clean release-candidate commit on Node `20.19.5`.
2. Set `DEPLOYMENT_ID=arb-sepolia-staging-v1`,
   `DEPLOYER_PRIVATE_KEY`, and `ARBITRUM_SEPOLIA_RPC_URL` outside the
   repository.
3. Run contract compile, lint, tests, and
   `npm --prefix contracts run deploy:arb-sepolia`.
4. Sync the generated record:

   ```bash
   npm run release:sync-manifest -- \
     contracts/deployments/421614/arb-sepolia-staging-v1.json
   ```

5. Commit the contract record and manifest together.
6. Set the staging Vercel public variables to the exact deployment id, RPC,
   address, and staging Privy app id. Never place the deployer or test-wallet
   keys in Vercel frontend variables.
7. Add the exact staging origin to the staging Privy app client. Confirm
   wallet-only login, external EVM wallets, embedded wallets off, and Arbitrum
   Sepolia only.
8. Deploy the committed candidate and point the staging domain at that exact
   Vercel deployment.
9. Run the `Phase 10 Release Gate` workflow with the `staging` GitHub
   environment.
10. Complete the manual encrypted fleet/battle/recovery matrix and one wallet
    transaction each on physical iOS Safari and Android Chrome.

## Production Demo Procedure

Repeat the staging procedure with a new immutable
`arb-sepolia-v1` contract record and the `production-demo` GitHub environment.
Do not reuse the staging address. Promote only the exact artifact that passed
staging, then rerun public URL checks against the production domain.

The production evidence must record:

- deployment id, address, transaction, block, ABI hash, source commit, and
  Arbiscan address/transaction links;
- Vercel deployment id and public URL;
- desktop two-wallet result and physical iOS/Android result;
- create/join/fleet/attack/finalization gas and latency;
- CoFHE fleet-validation and shot-finalization latency;
- rollback owner and acceptance timestamp.

## Rollback and Redeploy

Operational owner:

- Vercel/frontend rollback: GitHub and Vercel project owner `godemodegame`;
- contract redeploy: the holder of the dedicated release deployer key,
  coordinated by `godemodegame`.

Frontend rollback:

1. Stop promotion and identify the last deployment whose `/release.json`
   references a compatible committed deployment id.
2. Run `vercel rollback <deployment-url-or-id>` or repoint the stable alias to
   that exact deployment.
3. Verify `/release.json`, `/practice`, and one original versioned match link.
4. Fix forward. A frontend rollback never reverts contract state.

Contract redeploy:

1. Never edit or delete the old record.
2. Choose a new deployment id and deploy a new contract.
3. Sync and commit the new record.
4. Stage the new frontend/contract pairing and direct only new matches to it.
5. Keep old links resolved by their original deployment id.

## Known Limitations

- No public Arbitrum Sepolia contract exists yet, so the stable origins are
  practice-only.
- Privy allowed origins are dashboard state and are not yet confirmed for the
  staging and production domains.
- No funded deployer or creator/opponent test keys are available to the current
  release process.
- Physical iOS Safari and Android Chrome acceptance requires real devices.
- CoFHE finalization latency cannot be represented by local mocks and must be
  measured on the deployed encrypted flow.
- The pinned CoFHE-compatible Hardhat 2 toolchain retains the accepted
  low-severity development-only advisories documented in Phase 9.
