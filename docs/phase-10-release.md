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

**Contract-side migration completed June 12, 2026.** `BattleshipGame.sol`,
the deploy/validation tooling, and the full test suite (128 passing) now run
on `cofhe-contracts` 0.1.4 with the `@cofhe/hardhat-plugin` mock
environment. The retry entrypoints were replaced by permissionless
`finalizeFleetValidationWithProof` / `finalizeAttackWithProof`, which verify
the threshold-network signature on-chain via `publishDecryptResult` — the
frontend still never supplies result authority. The migrated contract is
deployed as `arb-sepolia-staging-v2` and a funded two-wallet **full
encrypted match** (create, join, both encrypted fleets, CoFHE validation,
22 shots including misses/turn handoffs, win) **passed live** (see Staging
Contract and Funded Staging Regression below).

**Frontend migration completed June 12, 2026.** The browser stack moved
from `cofhejs` 0.3.1 (hand-rolled encryption worker, since deleted) to
`@cofhe/sdk/web` 0.6.0, which manages its own zk-prove Web Worker and
IndexedDB key cache. The match flow now performs the proof-publish step
itself: the client reads the pending `validityCtHash` /
`resultCtHash`+`sunkShipCtHash` handles, fetches threshold-network decrypt
proofs via `decryptForTx(...).withoutPermit()`, and publishes them through
`finalizeFleetValidationWithProof` / `finalizeAttackWithProof`. The legacy
decrypt re-request retry buttons were removed; recovery is re-running the
re-entrant fetch-and-publish action, with proof-fetch status and a
retryable `proof-unavailable` error surfaced in both panels. Full suite
(build, 336 unit, 40 screen, release scripts, 12 e2e) passes. Remaining:
staging frontend promotion to an `arb-sepolia-staging-v2` build, and
physical mobile acceptance.

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

Active staging contract (migrated `cofhe-contracts` 0.1.4 decrypt model),
deployed and validated June 12, 2026:

- deployment id: `arb-sepolia-staging-v2`;
- address:
  [`0xe1C0D99d2e8b410538710C902CbD3Ee6637e9D94`](https://sepolia.arbiscan.io/address/0xe1C0D99d2e8b410538710C902CbD3Ee6637e9D94);
- deployment transaction:
  [`0x0721f91e3469d7375b3c7b326735d564e259bf0386740080d447f0d7a0e304a1`](https://sepolia.arbiscan.io/tx/0x0721f91e3469d7375b3c7b326735d564e259bf0386740080d447f0d7a0e304a1);
- deployment block: `276375706`;
- source commit: `6771dd09be68c37e6b34d38da1ddecc8f088daa1`;
- deployment gas: `4,628,667`;
- deployment fee: `0.000093119522706 ETH`;
- ABI SHA-256:
  `sha256:14c061d46cea4971fec557c8d025536d778e6d048afa7b1492367b33fb4f1bd7`.

Runtime bytecode validation passed against the compiled release artifact.

The superseded `arb-sepolia-staging-v1`
(`0xEEdadE604431277779e5B8C58b390795eef0486b`, source commit `b6d92b2`) is
permanently broken for encrypted play by the June 2026 CoFHE TaskManager
upgrade (its `FHE.decrypt` entrypoint was removed upstream); its record
stays committed per the immutable-record rule. Its funded create/join/cancel
evidence is preserved in `phase-10-staging-testnet-evidence.json`.

## Funded Staging Regression (Full Encrypted Match)

Match `1` on `arb-sepolia-staging-v2` completed the entire encrypted
lifecycle live on June 12, 2026: create, invited join, both encrypted fleet
submissions, threshold-network placement validation, and a 22-move battle
(one miss per side exercising turn handoff, then a full sink-out) ending in
a win for the invited opponent. Every shot result matched the plaintext
rules.

| Phase | Gas | Latency |
| --- | ---: | ---: |
| createMatch / joinMatch | 236,176 / 132,236 | — |
| Fleet encryption (zk prove + verify, off-chain) | — | 8,606 / 7,219 ms |
| submitFleet (per player) | 5,286,853 / 5,207,553 | — |
| Validation proof fetch (threshold network) | — | 1,074 / 996 ms |
| finalizeFleetValidationWithProof | 159,335 / 197,994 | — |
| attack (min/avg/max of 22) | 4,121,438 / 4,134,770 / 4,141,982 | — |
| Shot proof fetch (min/median/max of 22) | — | 1,268 / 1,576 / 10,710 ms |
| finalizeAttackWithProof (min/avg/max of 22) | 223,846 / 257,548 / 287,155 | — |
| Whole 22-move match | 107,856,450 (0.002162 ETH) | — |

Machine-readable evidence is committed in
`phase-10-staging-full-match-evidence.json`. The run is reproducible with
`npm --prefix contracts run match:arb-sepolia` given the funded wallet keys,
RPC URL, and `DEPLOYMENT_RECORD`.

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

- The frontend's browser-side encrypted flow (`@cofhe/sdk/web` encryption,
  threshold-network decrypt-proof fetches, `finalizeFleetValidationWithProof`
  / `finalizeAttackWithProof` publishing) has passed the full local suite but
  has not yet run against the live testnet from a real browser/wallet; that
  is exercised by the staging promotion and physical mobile acceptance.
- The deployed staging/production frontends still embed the superseded
  `arb-sepolia-staging-v1` / pending `arb-sepolia-v1` ids; the staging
  origin must be promoted to a migrated build configured for
  `arb-sepolia-staging-v2`.
- The production origin remains practice-only until its separate immutable
  contract is deployed after staging acceptance.
- Physical iOS Safari and Android Chrome acceptance requires real devices.
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
