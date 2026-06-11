/**
 * Deployment record schema shared by deploy.ts and validate-deployment.ts
 * (GAME-311). The schema is a superset of the frontend manifest record in
 * `src/onchain/deployments.ts` and of the minimum record in
 * `docs/deployment-plan.md`: extra fields here (schemaVersion, cofheVersions,
 * deployedBytecodeKeccak256) tighten contracts-side validation without
 * breaking the frontend reader.
 */

import { createHash } from 'node:crypto'

export interface DeploymentRecord {
  schemaVersion: 1
  deploymentId: string
  chainId: number
  contractName: string
  address: string
  status: 'active'
  deploymentTx: string
  deploymentBlock: number
  sourceCommit: string
  compilerVersion: string
  cofheVersions: Record<string, string>
  abiSha256: string
  deployedBytecodeKeccak256: string
  deployedAt: string
  deploymentGasUsed?: string
  deploymentGasPriceWei?: string
  deploymentFeeWei?: string
}

const DEPLOYMENT_ID_RE = /^[a-z0-9][a-z0-9-]*$/
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/
const SHA256_RE = /^sha256:[0-9a-f]{64}$/
const KECCAK256_RE = /^keccak256:0x[0-9a-f]{64}$/

/**
 * Canonical ABI hash: sha256 over the compact JSON serialization of the ABI
 * array, exactly as stored in the compiled artifact.
 */
export function computeAbiSha256(abi: unknown[]): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(abi)).digest('hex')}`
}

/**
 * Validate a parsed record, returning human-readable problems. Empty result
 * means the record is structurally valid.
 */
export function validateRecordSchema(record: unknown): string[] {
  const problems: string[] = []
  if (typeof record !== 'object' || record === null) {
    return ['record is not an object']
  }
  const r = record as Record<string, unknown>

  if (r.schemaVersion !== 1) problems.push('schemaVersion must be 1')
  if (typeof r.deploymentId !== 'string' || !DEPLOYMENT_ID_RE.test(r.deploymentId)) {
    problems.push('deploymentId must be a non-empty lowercase kebab-case string')
  }
  if (typeof r.chainId !== 'number' || !Number.isInteger(r.chainId) || r.chainId <= 0) {
    problems.push('chainId must be a positive integer')
  }
  if (typeof r.contractName !== 'string' || r.contractName.length === 0) {
    problems.push('contractName must be a non-empty string')
  }
  if (typeof r.address !== 'string' || !ADDRESS_RE.test(r.address)) {
    problems.push('address must be a 20-byte hex address')
  }
  if (r.status !== 'active') {
    problems.push("status must be 'active' for a deployed record")
  }
  if (typeof r.deploymentTx !== 'string' || !TX_HASH_RE.test(r.deploymentTx)) {
    problems.push('deploymentTx must be a 32-byte hex transaction hash')
  }
  if (
    typeof r.deploymentBlock !== 'number' ||
    !Number.isInteger(r.deploymentBlock) ||
    r.deploymentBlock < 0
  ) {
    problems.push('deploymentBlock must be a non-negative integer')
  }
  if (typeof r.sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(r.sourceCommit)) {
    problems.push('sourceCommit must be a 40-character git commit sha')
  }
  if (typeof r.compilerVersion !== 'string' || r.compilerVersion.length === 0) {
    problems.push('compilerVersion must be a non-empty string')
  }
  if (
    typeof r.cofheVersions !== 'object' ||
    r.cofheVersions === null ||
    Object.values(r.cofheVersions as Record<string, unknown>).some(
      (v) => typeof v !== 'string' || v.length === 0,
    )
  ) {
    problems.push('cofheVersions must map package names to version strings')
  }
  if (typeof r.abiSha256 !== 'string' || !SHA256_RE.test(r.abiSha256)) {
    problems.push('abiSha256 must look like sha256:<64 hex chars>')
  }
  if (
    typeof r.deployedBytecodeKeccak256 !== 'string' ||
    !KECCAK256_RE.test(r.deployedBytecodeKeccak256)
  ) {
    problems.push('deployedBytecodeKeccak256 must look like keccak256:0x<64 hex chars>')
  }
  if (typeof r.deployedAt !== 'string' || Number.isNaN(Date.parse(r.deployedAt))) {
    problems.push('deployedAt must be an ISO-8601 timestamp')
  }
  for (const field of ['deploymentGasUsed', 'deploymentGasPriceWei', 'deploymentFeeWei']) {
    if (r[field] !== undefined && (typeof r[field] !== 'string' || !/^[0-9]+$/.test(r[field]))) {
      problems.push(`${field} must be a decimal integer string when present`)
    }
  }
  return problems
}
