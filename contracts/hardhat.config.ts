import '@nomicfoundation/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'
import type { HardhatUserConfig } from 'hardhat/config'

// The CoFHE Hardhat plugin (`cofhe-hardhat-plugin`) is installed and pinned in
// package.json but is not loaded yet: Phase 3 contains no FHE operations, so
// tests must not depend on the mock CoFHE environment. Phase 4 (GAME-401)
// enables the plugin import here when encrypted rules land.

const ARBITRUM_SEPOLIA_CHAIN_ID = 421614

const arbitrumSepoliaAccounts = process.env.DEPLOYER_PRIVATE_KEY
  ? [process.env.DEPLOYER_PRIVATE_KEY]
  : []

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.25',
    settings: {
      // CoFHE's FHE.sol pulls in OpenZeppelin code that uses `mcopy`, which
      // needs the Cancun EVM target. Arbitrum Sepolia supports Cancun.
      evmVersion: 'cancun',
      optimizer: {
        enabled: true,
        runs: 800,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
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
  },
}

export default config
