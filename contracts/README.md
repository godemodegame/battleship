# Battleship Contracts

Smart contract package for the encrypted Battleship MVP on Arbitrum Sepolia
(chain id `421614`). Phase 3 of `docs/game-implementation-roadmap.md`
implements the public match lifecycle; encrypted fleets and battle arrive with
Phases 4 and 7.

## Scope

Implemented (`contracts/BattleshipGame.sol`):

- strict invited friend matches: `createMatch(invitedOpponent)`;
- invited-wallet joining: `joinMatch(matchId)`;
- `cancelMatch`, `forfeit`, and `claimTimeoutWin` timeout hooks;
- public reads: `getMatch`, `getPlayers`, `getPlayerMatches`,
  `getPlayerMatchCount`;
- lifecycle events: `MatchCreated`, `MatchJoined`, `MatchCancelled`,
  `MatchForfeited`, `TimeoutWinClaimed`.

Deliberately absent until the Phase 4 CoFHE feasibility results freeze the
encoding:

- fleet submission of any kind (plaintext fleet input is forbidden, full stop);
- attack and result finalization;
- open matches and bot matches.

## Toolchain

Pinned in `package.json` (exact versions, no ranges) and `.nvmrc`:

- Node `20.19.5`, npm lockfile v3;
- Hardhat `2.28.6`, solc `0.8.25` (Cancun EVM target), ethers `6.16.0`;
- CoFHE set: `@fhenixprotocol/cofhe-contracts` `0.1.4`,
  `@fhenixprotocol/cofhe-mock-contracts` `0.3.1`, `cofhe-hardhat-plugin`
  `0.3.1`, `cofhejs` `0.3.1`.

The CoFHE Hardhat plugin is installed and version-pinned but not yet loaded in
`hardhat.config.ts`: Phase 3 has no FHE operations, and tests must not depend
on the mock CoFHE environment. `contracts/test/CofheCompileCheck.sol` proves
the Solidity dependency compiles with these settings. Phase 4 (GAME-401)
enables the plugin.

## Commands

```bash
npm ci             # install with the lockfile
npm run compile    # hardhat compile
npm test           # 47 lifecycle/access/deadline tests on the hardhat network
npm run generate:abi        # write abi/BattleshipGame.json + src/onchain/abi/battleshipGame.ts
npm run deploy:local        # deploy to a running `npx hardhat node`
npm run deploy:arb-sepolia  # deploy to Arbitrum Sepolia (see below)
npm run validate:deployment -- deployments/<chainId>/<id>.json [--rpc <url>]
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

## Test harness

`contracts/test/BattleshipGameHarness.sol` is a test-only subclass that forces
states production code reaches only through Phase 4/7 (fleet submitted, match
in progress) so the timeout-win transitions are tested today. It must never be
deployed.
