import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const problems = []
const env = { ...loadEnv('production', root, ''), ...process.env }
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const compactHash = (value) =>
  `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`

const committedAbiPath = join(root, 'contracts/abi/BattleshipGame.json')
const frontendAbiPath = join(root, 'src/onchain/abi/battleshipGame.ts')
const manifestPath = join(root, 'src/onchain/deploymentManifest.json')
const artifactPath = join(
  root,
  'contracts/artifacts/contracts/BattleshipGame.sol/BattleshipGame.json',
)

const committedAbi = readJson(committedAbiPath)
const frontendSource = readFileSync(frontendAbiPath, 'utf8')
const frontendHash = frontendSource.match(
  /BATTLESHIP_GAME_ABI_SHA256 = '([^']+)'/,
)?.[1]
const frontendName = frontendSource.match(
  /BATTLESHIP_GAME_CONTRACT_NAME = '([^']+)'/,
)?.[1]
const frontendAbiText = frontendSource.match(
  /export const battleshipGameAbi = ([\s\S]+) as const\s*$/,
)?.[1]

if (!frontendAbiText) {
  problems.push('frontend ABI module could not be parsed')
} else if (JSON.stringify(JSON.parse(frontendAbiText)) !== JSON.stringify(committedAbi)) {
  problems.push('frontend ABI differs from contracts/abi/BattleshipGame.json')
}

const abiSha256 = compactHash(committedAbi)
if (frontendHash !== abiSha256) {
  problems.push(`frontend ABI hash ${frontendHash ?? 'missing'} does not equal ${abiSha256}`)
}
if (frontendName !== 'BattleshipGame') {
  problems.push(`frontend contract name is ${frontendName ?? 'missing'}`)
}

if (existsSync(artifactPath)) {
  const artifact = readJson(artifactPath)
  if (JSON.stringify(artifact.abi) !== JSON.stringify(committedAbi)) {
    problems.push('compiled artifact ABI differs from the committed ABI')
  }
  if (!artifact.deployedBytecode || artifact.deployedBytecode === '0x') {
    problems.push('compiled artifact has no deployed bytecode')
  }
}

const manifest = readJson(manifestPath)
const activeId = env.VITE_ACTIVE_DEPLOYMENT_ID || 'arb-sepolia-v1'
const selected = manifest.find((record) => record.deploymentId === activeId)
if (!selected) {
  problems.push(`active deployment id ${activeId} is absent from the frontend manifest`)
}

for (const record of manifest) {
  if (record.chainId !== 421614) {
    problems.push(`${record.deploymentId} has unsupported chain id ${record.chainId}`)
  }
  if (record.contractName !== 'BattleshipGame') {
    problems.push(`${record.deploymentId} has unexpected contract name ${record.contractName}`)
  }

  const recordPath = join(
    root,
    'contracts/deployments',
    String(record.chainId),
    `${record.deploymentId}.json`,
  )
  if (record.status === 'pending') {
    if (record.address !== null) {
      problems.push(`${record.deploymentId} is pending but has an address`)
    }
    if (existsSync(recordPath)) {
      problems.push(`${record.deploymentId} is pending but an active contract record exists`)
    }
    continue
  }

  if (!existsSync(recordPath)) {
    problems.push(`${record.deploymentId} is active but its contract record is missing`)
    continue
  }
  const contractRecord = readJson(recordPath)
  if (contractRecord.address?.toLowerCase() !== record.address?.toLowerCase()) {
    problems.push(`${record.deploymentId} frontend and contract addresses differ`)
  }
  if (contractRecord.abiSha256 !== abiSha256) {
    problems.push(`${record.deploymentId} deployment ABI hash differs from committed ABI`)
  }
  if (!/^keccak256:0x[0-9a-f]{64}$/.test(contractRecord.deployedBytecodeKeccak256)) {
    problems.push(`${record.deploymentId} has no valid deployed bytecode hash`)
  }
  for (const field of [
    'deploymentTx',
    'deploymentBlock',
    'sourceCommit',
    'compilerVersion',
    'abiSha256',
    'deployedAt',
  ]) {
    if (record[field] !== contractRecord[field]) {
      problems.push(`${record.deploymentId} frontend field ${field} differs from contract record`)
    }
  }
}

if (selected) {
  const assertedAddress = env.VITE_BATTLESHIP_CONTRACT_ADDRESS
  if (
    assertedAddress &&
    assertedAddress.toLowerCase() !== (selected.address ?? '').toLowerCase()
  ) {
    problems.push('VITE_BATTLESHIP_CONTRACT_ADDRESS does not match the selected record')
  }
  if (env.REQUIRE_ACTIVE_DEPLOYMENT === '1' && selected.status !== 'active') {
    problems.push(`release requires an active deployment; ${activeId} is still pending`)
  }
  if (env.REQUIRE_ACTIVE_DEPLOYMENT === '1') {
    for (const name of [
      'VITE_PRIVY_APP_ID',
      'VITE_ARBITRUM_SEPOLIA_RPC_URL',
      'VITE_ACTIVE_DEPLOYMENT_ID',
      'VITE_BATTLESHIP_CONTRACT_ADDRESS',
    ]) {
      if (!env[name]) problems.push(`release requires ${name}`)
    }
  }
}

const deploymentRoot = join(root, 'contracts/deployments/421614')
if (existsSync(deploymentRoot)) {
  const known = new Set(manifest.map((record) => `${record.deploymentId}.json`))
  for (const filename of readdirSync(deploymentRoot)) {
    if (filename.endsWith('.json') && !known.has(filename)) {
      problems.push(`contract deployment ${filename} is missing from the frontend manifest`)
    }
  }
}

if (problems.length) {
  console.error('Release artifact verification failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exitCode = 1
} else {
  console.log(`Release artifacts agree for ${activeId} (${selected.status})`)
  console.log(`ABI ${abiSha256}`)
}
