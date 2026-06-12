import assert from 'node:assert/strict'
import test from 'node:test'

import {
  frontendRecordFromContract,
  syncManifest,
} from './sync-deployment-manifest.mjs'

const contractRecord = {
  schemaVersion: 1,
  deploymentId: 'arb-sepolia-staging-v1',
  chainId: 421614,
  contractName: 'BattleshipGame',
  address: `0x${'12'.repeat(20)}`,
  status: 'active',
  deploymentTx: `0x${'34'.repeat(32)}`,
  deploymentBlock: 123,
  sourceCommit: 'ab'.repeat(20),
  compilerVersion: '0.8.25+commit.b61c2a91',
  abiSha256: `sha256:${'56'.repeat(32)}`,
  deployedAt: '2026-06-12T00:00:00.000Z',
}

test('converts a contract record to the public frontend fields', () => {
  const frontend = frontendRecordFromContract(contractRecord)
  assert.equal(frontend.deploymentId, contractRecord.deploymentId)
  assert.equal(frontend.address, contractRecord.address)
  assert.equal(frontend.status, 'active')
  assert.equal('cofheVersions' in frontend, false)
})

test('replaces a pending reservation with the immutable active record', () => {
  const pending = [
    {
      deploymentId: contractRecord.deploymentId,
      chainId: 421614,
      contractName: 'BattleshipGame',
      address: null,
      status: 'pending',
    },
  ]
  const synced = syncManifest(pending, contractRecord)
  assert.equal(synced.length, 1)
  assert.equal(synced[0].address, contractRecord.address)
  assert.equal(synced[0].status, 'active')
})

test('refuses to rewrite an active deployment address', () => {
  const active = [
    {
      ...frontendRecordFromContract(contractRecord),
      address: `0x${'99'.repeat(20)}`,
    },
  ]
  assert.throws(() => syncManifest(active, contractRecord), /Refusing to change immutable/)
})

test('rejects a record for any chain other than Arbitrum Sepolia', () => {
  assert.throws(
    () => frontendRecordFromContract({ ...contractRecord, chainId: 1 }),
    /chainId must be 421614/,
  )
})
