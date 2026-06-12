import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DEPLOYMENT_ID,
  MVP_CHAIN_ID,
  assertManifestValid,
  getActiveDeploymentId,
  getDeployment,
  isAddress,
  isDeploymentReady,
  isKnownDeployment,
  listDeploymentIds,
  resolveActiveDeployment,
  resolveDeployment,
  validateDeploymentRecord,
  type DeploymentRecord,
} from './deployments'

describe('deployment manifest reader (GAME-109)', () => {
  it('the committed manifest is valid', () => {
    expect(() => assertManifestValid()).not.toThrow()
  })

  it('resolves the default deployment id on chain 421614', () => {
    const record = getDeployment(DEFAULT_DEPLOYMENT_ID)
    expect(record).not.toBeNull()
    expect(record?.chainId).toBe(MVP_CHAIN_ID)
    expect(isKnownDeployment(DEFAULT_DEPLOYMENT_ID)).toBe(true)
    expect(listDeploymentIds()).toContain(DEFAULT_DEPLOYMENT_ID)
  })

  it('returns null for unknown or empty ids', () => {
    expect(getDeployment('does-not-exist')).toBeNull()
    expect(getDeployment(undefined)).toBeNull()
    expect(getDeployment('')).toBeNull()
    expect(isKnownDeployment('nope')).toBe(false)
  })

  it('treats a pending (undeployed) record as not ready', () => {
    expect(isDeploymentReady(getDeployment('arb-sepolia-v1'))).toBe(false)
    expect(isDeploymentReady(null)).toBe(false)
  })

  it('the default deployment is live and ready', () => {
    expect(isDeploymentReady(getDeployment(DEFAULT_DEPLOYMENT_ID))).toBe(true)
  })

  it('marks an active record with a valid address as ready', () => {
    const active: DeploymentRecord = {
      deploymentId: 'arb-sepolia-v2',
      chainId: MVP_CHAIN_ID,
      contractName: 'BattleshipGame',
      address: `0x${'12'.repeat(20)}`,
      status: 'active',
    }
    expect(validateDeploymentRecord(active)).toEqual([])
    expect(isDeploymentReady(active)).toBe(true)
  })

  it('rejects a record whose chain id is not 421614', () => {
    const wrong: DeploymentRecord = {
      deploymentId: 'eth-mainnet-v1',
      chainId: 1,
      contractName: 'BattleshipGame',
      address: null,
      status: 'pending',
    }
    expect(validateDeploymentRecord(wrong)).toContain('chainId 1 is not 421614')
    expect(() => assertManifestValid([wrong])).toThrow()
  })

  it('rejects an active record without a valid address', () => {
    const bad: DeploymentRecord = {
      deploymentId: 'arb-sepolia-bad',
      chainId: MVP_CHAIN_ID,
      contractName: 'BattleshipGame',
      address: null,
      status: 'active',
    }
    expect(validateDeploymentRecord(bad).length).toBeGreaterThan(0)
  })

  it('rejects duplicate deployment ids in a manifest', () => {
    const dup: DeploymentRecord = {
      deploymentId: 'dup',
      chainId: MVP_CHAIN_ID,
      contractName: 'BattleshipGame',
      address: null,
      status: 'pending',
    }
    expect(() => assertManifestValid([dup, { ...dup }])).toThrow(/Duplicate/)
  })

  it('validates address format', () => {
    expect(isAddress(`0x${'ab'.repeat(20)}`)).toBe(true)
    expect(isAddress('0x123')).toBe(false)
    expect(isAddress(null)).toBe(false)
  })

  it('falls back to the default active deployment id when env is unset', () => {
    expect(getActiveDeploymentId()).toBe(DEFAULT_DEPLOYMENT_ID)
  })
})

describe('resolveDeployment (GAME-501)', () => {
  it('resolves the reserved production id as known but not ready', () => {
    const res = resolveDeployment('arb-sepolia-v1')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.record.deploymentId).toBe('arb-sepolia-v1')
      expect(res.ready).toBe(false)
    }
  })

  it('resolves the default deployment as ready', () => {
    const res = resolveDeployment(DEFAULT_DEPLOYMENT_ID)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.ready).toBe(true)
  })

  it('reports unknown ids with a reason instead of throwing', () => {
    const res = resolveDeployment('retired-v0')
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe('unknown')
      expect(res.problems.length).toBeGreaterThan(0)
    }
  })

  it('treats empty / missing ids as unknown', () => {
    expect(resolveDeployment('').ok).toBe(false)
    expect(resolveDeployment(null).ok).toBe(false)
    expect(resolveDeployment(undefined).ok).toBe(false)
  })

  it('resolves the active deployment for this build', () => {
    const res = resolveActiveDeployment()
    expect(res.deploymentId).toBe(getActiveDeploymentId())
    expect(res.ok).toBe(true)
  })
})
