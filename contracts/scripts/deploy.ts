/**
 * Deterministic BattleshipGame deployment (GAME-310).
 *
 * The contract has no constructor arguments and all configuration is compiled
 * in as constants, so the deployed bytecode is byte-identical to the artifact.
 * The script verifies that before writing the deployment record, refuses to
 * reuse a deployment id, and records the exact toolchain versions.
 *
 * Usage:
 *   DEPLOYMENT_ID=local-dev       npm run deploy:local
 *   DEPLOYMENT_ID=arb-sepolia-v1  npm run deploy:arb-sepolia
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { artifacts, ethers, network } from 'hardhat'

import { computeAbiSha256, validateRecordSchema, type DeploymentRecord } from './deploymentRecord'

const CONTRACT_NAME = 'BattleshipGame'
const COFHE_PACKAGES = [
  '@fhenixprotocol/cofhe-contracts',
  '@fhenixprotocol/cofhe-mock-contracts',
  'cofhe-hardhat-plugin',
  'cofhejs',
] as const

async function main(): Promise<void> {
  const deploymentId =
    process.env.DEPLOYMENT_ID ?? (network.name === 'localhost' ? 'local-dev' : undefined)
  if (!deploymentId) {
    throw new Error('Set DEPLOYMENT_ID (e.g. arb-sepolia-v1) before deploying')
  }

  const contractsDir = join(__dirname, '..')
  const chainId = Number((await ethers.provider.getNetwork()).chainId)
  const recordDir = join(contractsDir, 'deployments', String(chainId))
  const recordPath = join(recordDir, `${deploymentId}.json`)
  if (existsSync(recordPath)) {
    throw new Error(
      `Deployment record ${recordPath} already exists. ` +
        'Deployment ids are immutable: pick a new id for a redeployment.',
    )
  }

  const factory = await ethers.getContractFactory(CONTRACT_NAME)
  const contract = await factory.deploy()
  const deployTx = contract.deploymentTransaction()
  if (!deployTx) throw new Error('Deployment transaction missing')
  const receipt = await deployTx.wait()
  if (!receipt) throw new Error('Deployment receipt missing')
  const address = await contract.getAddress()

  // The contract uses no immutables, so on-chain runtime code must equal the
  // artifact byte for byte. Fail the deployment record if it does not.
  const artifact = await artifacts.readArtifact(CONTRACT_NAME)
  const onchainCode = await ethers.provider.getCode(address)
  if (onchainCode.toLowerCase() !== artifact.deployedBytecode.toLowerCase()) {
    throw new Error('On-chain runtime bytecode does not match the compiled artifact')
  }

  const buildInfo = await artifacts.getBuildInfo(
    `contracts/${CONTRACT_NAME}.sol:${CONTRACT_NAME}`,
  )
  if (!buildInfo) throw new Error('Build info not found; run hardhat compile first')

  const packageJson = JSON.parse(
    readFileSync(join(contractsDir, 'package.json'), 'utf8'),
  ) as { devDependencies: Record<string, string> }
  const cofheVersions = Object.fromEntries(
    COFHE_PACKAGES.map((name) => [name, packageJson.devDependencies[name]]),
  )

  const sourceCommit =
    process.env.SOURCE_COMMIT ??
    execSync('git rev-parse HEAD', { cwd: contractsDir }).toString().trim()

  const record: DeploymentRecord = {
    schemaVersion: 1,
    deploymentId,
    chainId,
    contractName: CONTRACT_NAME,
    address,
    status: 'active',
    deploymentTx: receipt.hash,
    deploymentBlock: receipt.blockNumber,
    sourceCommit,
    compilerVersion: buildInfo.solcLongVersion,
    cofheVersions,
    abiSha256: computeAbiSha256(artifact.abi),
    deployedBytecodeKeccak256: `keccak256:${ethers.keccak256(onchainCode)}`,
    deployedAt: new Date().toISOString(),
  }

  const problems = validateRecordSchema(record)
  if (problems.length > 0) {
    throw new Error(`Generated record is invalid: ${problems.join('; ')}`)
  }

  mkdirSync(recordDir, { recursive: true })
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`)

  console.log(`${CONTRACT_NAME} deployed to ${address} (chain ${chainId})`)
  console.log(`Deployment record written to ${recordPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
