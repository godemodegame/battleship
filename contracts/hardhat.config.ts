import '@nomicfoundation/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'
// GAME-401: the CoFHE Hardhat plugin deploys the mock CoFHE environment
// (task manager, ACL, zk verifier, threshold network) onto the in-process
// hardhat network before tests, so encrypted-rule tests run without live
// CoFHE infrastructure. @cofhe/hardhat-plugin is the post-June-2026 stack
// matching cofhe-contracts 0.1.x (see docs/phase-10-release.md).
import '@cofhe/hardhat-plugin'
import type { HardhatUserConfig } from 'hardhat/config'

const ARBITRUM_SEPOLIA_CHAIN_ID = 421614

const arbitrumSepoliaAccounts = process.env.DEPLOYER_PRIVATE_KEY
  ? [process.env.DEPLOYER_PRIVATE_KEY]
  : []

const config: HardhatUserConfig = {
  cofhe: {
    // Mock-operation console logging triples test runtime and drowns out
    // assertion output; benchmarks read gas receipts directly instead.
    logMocks: false,
    gasWarning: false,
  },
  solidity: {
    version: '0.8.25',
    settings: {
      // CoFHE's FHE.sol pulls in OpenZeppelin code that uses `mcopy`, which
      // needs the Cancun EVM target. Arbitrum Sepolia supports Cancun.
      evmVersion: 'cancun',
      optimizer: {
        // The on-chain hard-bot heatmap added enough bytecode to push the
        // contract toward the 24576-byte EIP-170 limit at runs: 800. 200 keeps
        // comfortable deploy headroom; the runtime-gas cost is negligible next
        // to the multi-million-gas FHE operations that dominate every call.
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      // Newer hardforks (osaka) enable the EIP-7951 P256VERIFY precompile at
      // 0x...0100, which shadows the CoFHE MockZkVerifier that
      // cofhe-hardhat-plugin etches at that address. Cancun matches the solc
      // evmVersion above and keeps the address free for the mock.
      hardfork: 'cancun',
      // The @cofhe/mock-contracts ops build log strings unconditionally
      // (gated only at emit time), so FHE-heavy calls like submitFleet
      // (~130 ops) blow the default 30M limit under mocks. Mock gas numbers
      // are not meaningful; live gas is measured on Arbitrum Sepolia.
      blockGasLimit: 1_000_000_000,
      gas: 500_000_000,
      // Test-only: the BattleshipGameHarness subclass (never deployed to a real
      // network) carries extra expose/forcing helpers and exceeds EIP-170. The
      // production BattleshipGame stays within the limit (validated at deploy).
      allowUnlimitedContractSize: true,
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL ?? 'https://sepolia-rollup.arbitrum.io/rpc',
      chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
      accounts: arbitrumSepoliaAccounts,
    },
  },
  paths: {
    sources: 'contracts',
    tests: 'test',
    cache: 'cache',
    artifacts: 'artifacts',
  },
  mocha: {
    timeout: 60_000,
    require: ['test/mochaRootHooks.ts'],
  },
}

export default config
