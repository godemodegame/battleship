# Battleship Contracts

Smart contract package for the encrypted Battleship MVP on Arbitrum Sepolia
(chain id `421614`). Phase 3 of `docs/game-implementation-roadmap.md`
implemented the public match lifecycle; Phase 4 implemented the encrypted
fleet and battle rules over CoFHE. The frontend battle integration arrives
with Phases 6 and 7.

## Scope

Implemented (`contracts/BattleshipGame.sol`):

- strict invited friend matches: `createMatch(invitedOpponent)`;
- invited-wallet joining: `joinMatch(matchId)`;
- encrypted fleet submission: `submitFleet(matchId, InEuint8[20])` ship
  segments (encoding decision in `docs/cofhe-feasibility-results.md`), with
  full encrypted placement validation (range, straightness, contiguity, row
  bounds);
- encrypted battle: `attack(matchId, cellIndex)` computes hit/sunk/win with
  FHE operations; permissionless `finalizeFleetValidation` /
  `finalizeAttack` read the decrypt results the CoFHE network posts
  on-chain (no client ever supplies a result); permissionless
  `retryFleetValidation` / `retryShotResolution` recover stuck decryptions;
- `cancelMatch`, `forfeit`, and `claimTimeoutWin` timeout hooks;
- public reads: `getMatch`, `getPlayers`, `getPlayerMatches`,
  `getPlayerMatchCount`, `getMove`, `getMoveHistory`, `getPendingShot`,
  `getShipLengths`;
- events: the lifecycle set (`MatchCreated`, `MatchJoined`,
  `MatchCancelled`, `MatchForfeited`, `TimeoutWinClaimed`) plus the
  encrypted-flow set (`FleetSubmitted`, `FleetValidationRequested`,
  `FleetValidated`, `MatchStarted`, `ShotSubmitted`,
  `ShotResolutionRequested`, `ShotResolved`, `TurnChanged`,
  `MatchFinished`).

Deliberately absent:

- plaintext fleet input of any kind, full stop;
- open matches and bot matches (post-MVP).

## Toolchain

Pinned in `package.json` (exact versions, no ranges) and `.nvmrc`:

- Node `20.19.5`, npm lockfile v3;
- Hardhat `2.28.6`, solc `0.8.25` (Cancun EVM target), ethers `6.16.0`;
- CoFHE set: `@fhenixprotocol/cofhe-contracts` `0.0.13`,
  `@fhenixprotocol/cofhe-mock-contracts` `0.3.1`, `cofhe-hardhat-plugin`
  `0.3.1`, `cofhejs` `0.3.1`.

`cofhe-hardhat-plugin` is loaded in `hardhat.config.ts` and etches the mock
CoFHE environment (task manager, ACL, zk verifier, query decrypter) onto the
in-process hardhat network before tests. The hardhat network pins
`hardfork: cancun`: newer hardforks enable the EIP-7951 P256VERIFY
precompile at `0x...0100`, the exact address the plugin uses for the mock
zk verifier. `@fhenixprotocol/cofhe-contracts` is pinned to `0.0.13`
because the `0.3.1` plugin/mocks/cofhejs line targets it exclusively (see
`docs/cofhe-feasibility-results.md`).

## Commands

```bash
npm ci             # install with the lockfile
npm run compile    # hardhat compile
npm test           # lifecycle + encrypted-rules + benchmark suites on the hardhat network
npm run generate:abi        # write abi/BattleshipGame.json + src/onchain/abi/battleshipGame.ts
npm run deploy:local        # deploy to a running `npx hardhat node`
npm run deploy:arb-sepolia  # deploy to Arbitrum Sepolia (see below)
npm run validate:deployment -- deployments/<chainId>/<id>.json [--rpc <url>]
```

Focused suites:

```bash
npx hardhat test test/battleshipGame.test.ts      # public lifecycle (47 tests)
npx hardhat test test/encryptedRules.test.ts      # encrypted rules (33 tests)
npx hardhat test test/encodingBenchmarks.test.ts  # GAME-402..404 encoding table
npx hardhat test test/fullMatchBenchmark.test.ts  # GAME-411 gas budget table
```

## Deployment records

`scripts/deploy.ts` writes a committed record to
`deployments/<chainId>/<deploymentId>.json` (schema in
`scripts/deploymentRecord.ts`, superset of `docs/deployment-plan.md`). Rules:

- deployment ids are immutable; the script refuses to overwrite a record;
- the contract has no constructor args or immutables, so on-chain runtime
  bytecode must equal the artifact byte for byte (checked at deploy time);
- `scripts/validate-deployment.ts` re-checks the schema, the committed ABI
  hash, and (with `--rpc`) the live chain id and bytecode hash;
- local hardhat-node records (`deployments/31337/`) are gitignored.

Arbitrum Sepolia deployment expects `DEPLOYMENT_ID`, `DEPLOYER_PRIVATE_KEY`,
and optionally `ARBITRUM_SEPOLIA_RPC_URL` in the environment. Frontend wiring
of a live record into `src/onchain/deployments.ts` happens in Phase 5/10.

## Test harness and prototypes

`contracts/test/BattleshipGameHarness.sol` is a test-only subclass that
forces states (fleet submitted, match in progress) directly, keeping the
timeout-claim tests fast and independent of the encrypted flow. It must
never be deployed.

`contracts/prototypes/FleetEncodingPrototypes.sol` holds the
measurement-only encoding candidates behind the GAME-405 decision; they are
exercised by the benchmark suite and are never deployed.
