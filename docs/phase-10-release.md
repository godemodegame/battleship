# Phase 10 Release Runbook and Notes

## Status

Phase 10 is in progress as of June 12, 2026.

The repository-side release controls, stable Vercel origins, public staging
contract, and funded two-wallet lifecycle exist. Privy origin confirmation,
the full encrypted match, production contract, and physical mobile acceptance
remain open.

**Upstream blocker discovered June 12, 2026.** The Fhenix CoFHE testnet was
upgraded in place (new `@cofhe/*` client stack released June 2, 2026, serving
tfhe-rs 1.x safe-serialized FHE keys). Live isolation against the deployed
TaskManager (`0xeA30…48D9`) with a `cofhe-contracts` 0.0.13 probe contract
shows encrypted input verification and FHE compute operations still pass, but
`FHE.decrypt` (`ITaskManager.createDecryptTask`) now reverts: the entrypoint
was removed. Consequences:

- the deployed `arb-sepolia-staging-v1` contract reverts on `submitFleet`
  and `attack`, so its encrypted fleet/battle flow is permanently broken;
- the frontend's pinned `cofhejs` 0.3.1 (latest on npm) can no longer parse
  the FHE public key or CRS served by the testnet, so browser-side
  encryption fails regardless of the contract;
- a funded create/join lifecycle still works (plaintext paths unaffected).

Unblocking GAME-1003/1004/1006/1009 requires migrating the contract to
`cofhe-contracts` 0.1.x (decrypt results are now published on-chain from
client-fetched threshold-network signatures instead of requested via
`FHE.decrypt`), migrating the frontend and tooling from `cofhejs` to
`@cofhe/sdk` 0.6.x, redeploying staging under a new deployment id, and
re-running the affected Phase 9 gates.

Stable origins:

- staging: `https://battleship-staging-godemodegame.vercel.app`;
- production demo: `https://battleship-blond.vercel.app`.

The staging release is being promoted to the active
`arb-sepolia-staging-v1` contract. Production remains practice-only because
`arb-sepolia-v1` is still pending in the committed manifest.

Current frontend deployments:

| Environment | Vercel deployment | Embedded deployment id | Public checks |
| --- | --- | --- | --- |
| Staging | `dpl_6FV7yLSaXuup9hRHDphGCitVjQxu` | `arb-sepolia-staging-v1` (active) | Pass |
| Production demo | `dpl_FQWmHFHpAAJNNer3N2TUksCFD3UD` | `arb-sepolia-v1` (pending) | Pass |

Vercel automatic custom-domain assignment is disabled. The stable staging and
production domains are explicitly aliased to the deployment ids above, so a
new Git deployment cannot silently move either release channel.

## Release Controls

Implemented for GAME-1001 and GAME-1005 through GAME-1009:

- Vercel project settings use Vite, Node 20.x, `npm ci`, `npm run build`, and
  `dist`;
- staging and production have exact, stable HTTPS project domains rather than
  a broad `*.vercel.app` origin;
- automatic custom-domain assignment is disabled; release promotion and
  rollback explicitly repoint each stable alias to a verified deployment;
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
- GitHub environments `staging` and `production-demo` exist with the public
  Privy app id and Arbitrum Sepolia RPC variables; private deployer/gameplay
  credentials remain local-only;
- contract deployment records now capture deployment gas and fee, while the
  funded regression can write transaction gas and wallet-to-receipt timings to
  `TESTNET_EVIDENCE_PATH`.

## Staging Contract

Deployed and validated June 12, 2026:

- deployment id: `arb-sepolia-staging-v1`;
- address:
  [`0xEEdadE604431277779e5B8C58b390795eef0486b`](https://sepolia.arbiscan.io/address/0xEEdadE604431277779e5B8C58b390795eef0486b);
- deployment transaction:
  [`0x17013c0acd433f0e3a02b39f7c59e7c80f1037293b60662f6093d8bbb9643050`](https://sepolia.arbiscan.io/tx/0x17013c0acd433f0e3a02b39f7c59e7c80f1037293b60662f6093d8bbb9643050);
- deployment block: `276345345`;
- source commit: `b6d92b2518e78266eef5c8ceb4ebc98139b642b7`;
- deployment gas: `6,452,880`;
- deployment fee: `0.000129702888 ETH`;
- ABI SHA-256:
  `sha256:283d4196c0f6421c3e712aaceb08c2f8c79f3ed8e8f4520f8dd443831e6d7484`.

Runtime bytecode validation passed against the compiled release artifact.

## Funded Staging Regression

Match `1` completed the real-chain create, invited join, and creator cancel
lifecycle:

| Action | Transaction | Gas | Wallet to receipt |
| --- | --- | ---: | ---: |
| Create | [`0xcf48…4fd0`](https://sepolia.arbiscan.io/tx/0xcf48e43efe4d625e91516e2bc366c308b7dfcba33d21d3fd416a6f15cd194fd0) | 268,080 | 6,974 ms |
| Join | [`0x7ad6…3c04`](https://sepolia.arbiscan.io/tx/0x7ad615572d25f6c303a9d189770d89184f3f21ae1ca8d552e41e055abee33c04) | 169,393 | 6,908 ms |
| Cancel | [`0xc3ca…797a`](https://sepolia.arbiscan.io/tx/0xc3ca788f98bf868198607bc4d3ede75b7e5bd7d483f0bb918bd2a490c2f8797a) | 74,910 | 7,037 ms |

Machine-readable evidence is committed in
`phase-10-staging-testnet-evidence.json`.

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
   Vercel deployment:

   ```bash
   vercel alias set <deployment-hostname> \
     battleship-staging-godemodegame.vercel.app
   ```

   Do not enable automatic custom-domain assignment.
9. Run the `Phase 10 Release Gate` workflow with the `staging` GitHub
   environment.
10. Complete the manual encrypted fleet/battle/recovery matrix and one wallet
    transaction each on physical iOS Safari and Android Chrome.

## Production Demo Procedure

Repeat the staging procedure with a new immutable
`arb-sepolia-v1` contract record and the `production-demo` GitHub environment.
Do not reuse the staging address. Promote only the exact artifact that passed
staging, explicitly alias the verified production deployment to
`battleship-blond.vercel.app`, then rerun public URL checks against the
production domain.

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

- The June 2026 CoFHE testnet upgrade removed `createDecryptTask`, breaking
  the encrypted flow of every `cofhe-contracts` 0.0.13 deployment including
  `arb-sepolia-staging-v1`, and the served FHE keys are no longer parseable
  by `cofhejs` 0.3.1. See the Status section for the required migration.
- The production origin remains practice-only until its separate immutable
  contract is deployed after staging acceptance.
- Privy allowed origins are dashboard state and are not yet confirmed for the
  staging and production domains.
- The funded staging regression covers create, join, and cancel only; the full
  encrypted fleet and battle flow still requires acceptance.
- Physical iOS Safari and Android Chrome acceptance requires real devices.
- CoFHE finalization latency cannot be represented by local mocks and must be
  measured on the deployed encrypted flow.
- The pinned CoFHE-compatible Hardhat 2 toolchain retains the accepted
  low-severity development-only advisories documented in Phase 9.

## Public Baseline

Measured June 12, 2026 from the release operator's network. These are smoke
latencies, not global performance claims:

| Probe | Staging | Production demo |
| --- | ---: | ---: |
| `/release.json` | 242 ms | 225 ms |
| `/` | 202 ms | 214 ms |
| `/practice` | 137 ms | 43 ms |
| Direct match route | 67 ms | 97 ms |
| Tactical board FBX (97,532 bytes) | 198 ms | 72 ms |
| Board texture JPG (388,288 bytes) | 266 ms | 435 ms |
| Hit-impact GLB (122,344 bytes) | 66 ms | 50 ms |

Desktop Chrome and Pixel 5 Chromium public suites both passed on staging and
production demo: release metadata, wallet-free practice entry, direct
versioned-match refresh, and critical asset delivery.
