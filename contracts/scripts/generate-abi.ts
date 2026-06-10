/**
 * Deterministic ABI and frontend type generation (GAME-310).
 *
 * Reads the compiled BattleshipGame artifact and writes:
 *   - contracts/abi/BattleshipGame.json    (committed ABI snapshot)
 *   - src/onchain/abi/battleshipGame.ts    (viem `as const` ABI for the app)
 *
 * Output depends only on the compiled artifact, so re-running on the same
 * sources is a no-op diff. Run through `npm run generate:abi`, which compiles
 * first.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { computeAbiSha256 } from './deploymentRecord'

const contractsDir = join(__dirname, '..')
const artifactPath = join(
  contractsDir,
  'artifacts',
  'contracts',
  'BattleshipGame.sol',
  'BattleshipGame.json',
)

const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
  contractName: string
  abi: unknown[]
}

const abiSha256 = computeAbiSha256(artifact.abi)

const abiDir = join(contractsDir, 'abi')
mkdirSync(abiDir, { recursive: true })
const abiJsonPath = join(abiDir, 'BattleshipGame.json')
writeFileSync(abiJsonPath, `${JSON.stringify(artifact.abi, null, 2)}\n`)

const frontendAbiDir = join(contractsDir, '..', 'src', 'onchain', 'abi')
mkdirSync(frontendAbiDir, { recursive: true })
const frontendAbiPath = join(frontendAbiDir, 'battleshipGame.ts')
const frontendModule = `/**
 * GENERATED FILE - do not edit by hand.
 *
 * Source: contracts/artifacts/contracts/BattleshipGame.sol/BattleshipGame.json
 * Regenerate with: cd contracts && npm run generate:abi
 *
 * The \`as const\` assertion gives viem full ABI type inference for reads,
 * writes, and event decoding (wired in Phase 5, GAME-502/503).
 */

export const BATTLESHIP_GAME_CONTRACT_NAME = '${artifact.contractName}'

/** sha256 of the compact ABI JSON; must match \`abiSha256\` in the active deployment record. */
export const BATTLESHIP_GAME_ABI_SHA256 = '${abiSha256}'

export const battleshipGameAbi = ${JSON.stringify(artifact.abi, null, 2)} as const
`
writeFileSync(frontendAbiPath, frontendModule)

console.log(`ABI written to ${abiJsonPath}`)
console.log(`Frontend ABI module written to ${frontendAbiPath}`)
console.log(`abiSha256: ${abiSha256}`)
