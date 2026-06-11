# Phase 9 Release QA

## Status

Phase 9 (`GAME-901` through `GAME-910`) completed on June 12, 2026.

This phase proves the local release candidate and installs hard gates for the
external staging work. It does not claim that a public contract already
exists: `src/onchain/deploymentManifest.json` still marks
`arb-sepolia-v1` as `pending`.

## Evidence

| Task | Evidence |
| --- | --- |
| GAME-901 | `contracts/test/lifecycleCoverage.test.ts` plus the existing lifecycle, encrypted-rule, and full-match suites |
| GAME-902 | Seeded contract fuzz/property coverage in `contracts/test/propertyFuzz.test.ts` and frontend mask/encoding properties in `src/onchain/propertyFuzz.test.ts` |
| GAME-903 | `contracts/test/securityAdversarial.test.ts` covers unauthorized writes, phase abuse, replay, timeout abuse, result-neutral finalizers, and cross-match isolation |
| GAME-904 | `contracts/test/fleetPrivacy.test.ts`, `src/onchain/placement/fleetLeakage.test.tsx`, and the existing CoFHE privacy scans |
| GAME-905 | `tests/e2e/friend-match.spec.ts` drives creator and invited-wallet pages against one shared browser mock |
| GAME-906 | `contracts/scripts/testnet-regression.ts` verifies and executes funded create, join, and cancel transactions with two wallets |
| GAME-907 | `scripts/verify-release.mjs`, `contracts/scripts/validate-deployment.ts`, generated ABI hash, JSON frontend manifest, and bytecode checks |
| GAME-908 | `scripts/check-release-config.mjs`, public `VITE_*` allowlist, no runtime app logging, no app analytics integration, gitignored local env files |
| GAME-909 | npm audits, Solhint release-contract gate, adversarial tests, and manual review recorded below |
| GAME-910 | README and architecture/security/testing/deployment status sections reconciled with the actual code |

## Release Commands

```bash
npm run build
npm test
npm run test:e2e
npm run verify:release
npm audit --audit-level=high

npm --prefix contracts run compile
npm --prefix contracts run lint:sol
npm --prefix contracts test
npm --prefix contracts audit --audit-level=moderate
```

Funded Arbitrum Sepolia regression:

```bash
cd contracts
ARBITRUM_SEPOLIA_RPC_URL=... \
CREATOR_PRIVATE_KEY=... \
OPPONENT_PRIVATE_KEY=... \
DEPLOYMENT_RECORD=deployments/421614/arb-sepolia-v1.json \
npm run regression:arb-sepolia
```

The command refuses to run when the RPC is on the wrong chain, runtime
bytecode disagrees with the record, the wallets are identical, or either
wallet has less than `0.0001 ETH`.

## Manual Security Review

Reviewed surfaces:

- contract authorization uses `msg.sender`; no write accepts a player identity
  supplied by the frontend;
- strict friend joins, turn ownership, one-pending-shot, repeated-cell, replay,
  and timeout-claim rules are contract-enforced;
- permissionless finalizers can trigger decrypt completion but cannot supply
  fleet validity or shot results;
- the ABI exposes no fleet mapping, encrypted fleet handle, ship-health value,
  or plaintext placement read;
- browser plaintext placement exists only in the scoped transient store, is
  passed only to the encryptor, and is cleared after receipt, account/chain
  changes, route changes, disconnect, and unmount;
- pending transaction storage contains only public deployment, match, wallet,
  write-kind, and transaction-hash data;
- runtime source contains no direct console logging or application analytics
  calls;
- the frontend manifest, committed ABI, generated ABI module, deployment
  record, and compiled/runtime bytecode are checked before release.

No P0 security issue remains open.

## Accepted P1 Limitations

- The CoFHE-compatible Hardhat 2 development toolchain retains low-severity
  advisories through legacy `ethers` v5 transitive packages. High and moderate
  advisories were removed with narrow overrides. Moving to Hardhat 3 is blocked
  until `cofhe-hardhat-plugin` supports it; these packages are development
  tooling and are not shipped in the browser bundle.
- Privy allowed origins are dashboard state. Code verifies wallet-only,
  external-EVM, embedded-wallet-off, and Arbitrum-Sepolia-only configuration;
  Phase 10 must confirm the exact staging HTTPS origin and must not use a broad
  `*.vercel.app` allowlist.
- The live funded regression was not executed on June 12, 2026 because no
  active deployment record or test-wallet keys are committed or available to
  the release process. Phase 10 cannot promote while the manifest is pending;
  run with `REQUIRE_ACTIVE_DEPLOYMENT=1 npm run verify:release`.
- Physical iOS Safari and Android Chrome acceptance remains a staging hardware
  check. Desktop and Pixel 5 Chromium projects run automatically.

## Phase 10 Gate

Before staging promotion:

1. Deploy and commit an immutable `421614` record.
2. Change the matching frontend manifest entry to `active`.
3. Run `REQUIRE_ACTIVE_DEPLOYMENT=1 npm run verify:release`.
4. Validate the record with the staging RPC.
5. Run the funded two-wallet regression.
6. Confirm the exact Privy staging origin.
7. Complete the full fleet/battle/recovery flow on desktop and physical mobile
   browsers.
