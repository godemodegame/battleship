import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultManifestPath = resolve(root, 'src/onchain/deploymentManifest.json')

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const HASH_RE = /^0x[0-9a-fA-F]{64}$/
const SHA256_RE = /^sha256:[0-9a-f]{64}$/

export function frontendRecordFromContract(record) {
  const problems = []
  if (record?.schemaVersion !== 1) problems.push('schemaVersion must be 1')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(record?.deploymentId ?? '')) {
    problems.push('deploymentId must be lowercase kebab-case')
  }
  if (record?.chainId !== 421614) problems.push('chainId must be 421614')
  if (record?.contractName !== 'BattleshipGame') {
    problems.push('contractName must be BattleshipGame')
  }
  if (record?.status !== 'active') problems.push('status must be active')
  if (!ADDRESS_RE.test(record?.address ?? '')) problems.push('address is invalid')
  if (!HASH_RE.test(record?.deploymentTx ?? '')) problems.push('deploymentTx is invalid')
  if (!Number.isInteger(record?.deploymentBlock) || record.deploymentBlock < 0) {
    problems.push('deploymentBlock is invalid')
  }
  if (!/^[0-9a-f]{40}$/.test(record?.sourceCommit ?? '')) {
    problems.push('sourceCommit is invalid')
  }
  if (!SHA256_RE.test(record?.abiSha256 ?? '')) problems.push('abiSha256 is invalid')
  if (Number.isNaN(Date.parse(record?.deployedAt ?? ''))) problems.push('deployedAt is invalid')
  if (problems.length) throw new Error(`Invalid contract deployment record: ${problems.join('; ')}`)

  return {
    deploymentId: record.deploymentId,
    chainId: record.chainId,
    contractName: record.contractName,
    address: record.address,
    status: 'active',
    deploymentTx: record.deploymentTx,
    deploymentBlock: record.deploymentBlock,
    sourceCommit: record.sourceCommit,
    compilerVersion: record.compilerVersion,
    abiSha256: record.abiSha256,
    deployedAt: record.deployedAt,
  }
}

export function syncManifest(manifest, contractRecord) {
  const nextRecord = frontendRecordFromContract(contractRecord)
  const index = manifest.findIndex((record) => record.deploymentId === nextRecord.deploymentId)

  if (index < 0) return [...manifest, nextRecord]

  const existing = manifest[index]
  if (
    existing.status === 'active' &&
    existing.address?.toLowerCase() !== nextRecord.address.toLowerCase()
  ) {
    throw new Error(
      `Refusing to change immutable deployment ${nextRecord.deploymentId} from ` +
        `${existing.address} to ${nextRecord.address}`,
    )
  }

  const next = [...manifest]
  next[index] = nextRecord
  return next
}

function main() {
  const recordArg = process.argv[2]
  if (!recordArg) {
    throw new Error(
      'Usage: node scripts/sync-deployment-manifest.mjs ' +
        'contracts/deployments/421614/<deploymentId>.json [manifest.json]',
    )
  }

  const recordPath = resolve(process.cwd(), recordArg)
  const manifestPath = process.argv[3]
    ? resolve(process.cwd(), process.argv[3])
    : defaultManifestPath
  const contractRecord = JSON.parse(readFileSync(recordPath, 'utf8'))
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const next = syncManifest(manifest, contractRecord)
  const temporaryPath = `${manifestPath}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`)
  renameSync(temporaryPath, manifestPath)
  console.log(`Synced ${contractRecord.deploymentId} into ${manifestPath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
