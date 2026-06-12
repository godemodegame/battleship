/**
 * Versioned deployment manifest reader (GAME-109).
 *
 * The frontend resolves a `deploymentId` from the `/match/:deploymentId/:matchId`
 * route through a committed manifest so old invite links keep pointing at the
 * contract they were created against (see `docs/deployment-plan.md`). It must
 * reject unknown deployment ids and any record whose chain id is not 421614.
 *
 * Real records are generated alongside the contract package in Phase 3
 * (GAME-310/311) at `contracts/deployments/421614/<deploymentId>.json` and will
 * be imported here. Until a contract is deployed, the manifest reserves the MVP
 * deployment id with `status: 'pending'` so the route shell resolves but no
 * on-chain action is offered.
 */

import { ARBITRUM_SEPOLIA_CHAIN_ID } from './wallet/network'
import deploymentManifest from './deploymentManifest.json'

export type Address = `0x${string}`

/** The only chain supported for the MVP. Single source: `wallet/network.ts`. */
export const MVP_CHAIN_ID = ARBITRUM_SEPOLIA_CHAIN_ID

/**
 * Deployment id selected when the build does not set one explicitly. Points at
 * the live staging contract so a plain `npm run dev` checkout can play
 * on-chain; production builds override it via `VITE_ACTIVE_DEPLOYMENT_ID`
 * (enforced by `check-release-config.mjs`).
 */
export const DEFAULT_DEPLOYMENT_ID = 'arb-sepolia-staging-v2'

/**
 * Committed deployment record. Mirrors the minimum record schema in
 * `docs/deployment-plan.md`. `address` is `null` while a reserved id has no
 * deployed contract yet (`status: 'pending'`).
 */
export interface DeploymentRecord {
  deploymentId: string
  chainId: number
  contractName: string
  address: Address | null
  /**
   * 'active' = deployed with a known address; 'pending' = id reserved, not
   * live; 'retired' = deployed but no longer playable (e.g. broken by an
   * upstream CoFHE upgrade) — old match links still resolve to it, but
   * writes stay disabled and its ABI is historical.
   */
  status: 'active' | 'pending' | 'retired'
  deploymentTx?: string
  deploymentBlock?: number
  sourceCommit?: string
  compilerVersion?: string
  abiSha256?: string
  deployedAt?: string
}

/**
 * The committed manifest. One reserved entry for the MVP until the contract is
 * deployed in Phase 3/10. New deployments append new records and never edit or
 * reuse an existing `deploymentId`.
 */
const MANIFEST = deploymentManifest as ReadonlyArray<DeploymentRecord>

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

export function isAddress(value: unknown): value is Address {
  return typeof value === 'string' && ADDRESS_RE.test(value)
}

/**
 * Validate a single record, returning a list of human-readable problems. An
 * empty list means the record is well-formed for the MVP.
 */
export function validateDeploymentRecord(record: DeploymentRecord): string[] {
  const problems: string[] = []
  if (!record.deploymentId) problems.push('deploymentId is empty')
  if (record.chainId !== MVP_CHAIN_ID) {
    problems.push(`chainId ${record.chainId} is not ${MVP_CHAIN_ID}`)
  }
  if (!record.contractName) problems.push('contractName is empty')
  if (record.status !== 'pending' && !isAddress(record.address)) {
    problems.push(`${record.status} deployment must have a valid contract address`)
  }
  if (record.address !== null && !isAddress(record.address)) {
    problems.push('address must be null or a 20-byte hex address')
  }
  return problems
}

/** Throws if any committed record is malformed (fails the build/tests early). */
export function assertManifestValid(
  manifest: ReadonlyArray<DeploymentRecord> = MANIFEST,
): void {
  const seen = new Set<string>()
  for (const record of manifest) {
    const problems = validateDeploymentRecord(record)
    if (problems.length > 0) {
      throw new Error(
        `Invalid deployment record "${record.deploymentId}": ${problems.join('; ')}`,
      )
    }
    if (seen.has(record.deploymentId)) {
      throw new Error(`Duplicate deploymentId in manifest: ${record.deploymentId}`)
    }
    seen.add(record.deploymentId)
  }
}

// Fail fast at module load if the committed manifest is malformed.
assertManifestValid()

/** Resolve a deployment record by id, or `null` for an unknown id. */
export function getDeployment(deploymentId: string | undefined | null): DeploymentRecord | null {
  if (!deploymentId) return null
  return MANIFEST.find((record) => record.deploymentId === deploymentId) ?? null
}

export function isKnownDeployment(deploymentId: string | undefined | null): boolean {
  return getDeployment(deploymentId) !== null
}

/** True once a deployment has a live contract (deployed address + active status). */
export function isDeploymentReady(record: DeploymentRecord | null): boolean {
  return record !== null && record.status === 'active' && isAddress(record.address)
}

export function listDeploymentIds(): string[] {
  return MANIFEST.map((record) => record.deploymentId)
}

/**
 * The active deployment id for this build. Reads `VITE_ACTIVE_DEPLOYMENT_ID`
 * when present (see `docs/deployment-plan.md`) and falls back to the default.
 */
export function getActiveDeploymentId(): string {
  const env =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_ACTIVE_DEPLOYMENT_ID as string | undefined)
      : undefined
  return env && env.length > 0 ? env : DEFAULT_DEPLOYMENT_ID
}

/**
 * Outcome of resolving + validating one deployment id (GAME-501).
 *
 * - `ok: false, reason: 'unknown'` — the id is not in the manifest (retired or
 *   foreign invite link).
 * - `ok: false, reason: 'invalid'` — the record exists but fails validation
 *   (wrong chain, malformed address); the build must not offer writes against it.
 * - `ok: true` — well-formed record; `ready` says whether a live contract
 *   address exists (`status: 'active'`), i.e. whether on-chain actions may be
 *   offered at all.
 */
export type DeploymentResolution =
  | { ok: true; deploymentId: string; record: DeploymentRecord; ready: boolean }
  | { ok: false; deploymentId: string; reason: 'unknown' | 'invalid'; problems: string[] }

/** Resolve and validate a deployment id from a route or invite link. */
export function resolveDeployment(deploymentId: string | undefined | null): DeploymentResolution {
  const id = deploymentId ?? ''
  const record = getDeployment(id)
  if (!record) {
    return { ok: false, deploymentId: id, reason: 'unknown', problems: ['deployment id not in manifest'] }
  }
  const problems = validateDeploymentRecord(record)
  if (problems.length > 0) {
    return { ok: false, deploymentId: id, reason: 'invalid', problems }
  }
  return { ok: true, deploymentId: id, record, ready: isDeploymentReady(record) }
}

/**
 * Resolve and validate the build's active deployment record (GAME-501). Menu
 * and create-match flows must call this before offering any on-chain action,
 * so an env-selected id that is unknown or malformed degrades to a visible
 * recoverable state instead of a phantom contract.
 */
export function resolveActiveDeployment(): DeploymentResolution {
  return resolveDeployment(getActiveDeploymentId())
}
