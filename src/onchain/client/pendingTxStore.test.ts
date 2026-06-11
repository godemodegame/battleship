/**
 * Pending-transaction persistence tests (GAME-802).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PENDING_TX_MAX_AGE_MS,
  clearAllPendingTx,
  clearPendingTx,
  listPendingTx,
  pendingTxScope,
  recordPendingTx,
} from './pendingTxStore'

const HASH_A = '0xaaa1000000000000000000000000000000000000000000000000000000000001' as const
const HASH_B = '0xbbb2000000000000000000000000000000000000000000000000000000000002' as const

const SCOPE = pendingTxScope({
  deploymentId: 'arb-sepolia-v1',
  matchId: 1n,
  address: '0xAAAA000000000000000000000000000000000001',
  kind: 'attack',
})

beforeEach(() => {
  sessionStorage.clear()
})

describe('pendingTxScope', () => {
  it('lowercases the address and joins identity parts', () => {
    expect(SCOPE).toBe('arb-sepolia-v1|1|0xaaaa000000000000000000000000000000000001|attack')
  })
})

describe('pendingTxStore', () => {
  it('records, lists, and clears one write scope', () => {
    recordPendingTx(SCOPE, HASH_A)
    expect(listPendingTx('arb-sepolia-v1|1|0xaaaa')).toHaveLength(1)
    expect(listPendingTx('arb-sepolia-v1|1|0xaaaa')[0].hash).toBe(HASH_A)

    clearPendingTx(SCOPE)
    expect(listPendingTx('arb-sepolia-v1|1|')).toHaveLength(0)
  })

  it('replaces the hash for the same scope (speed-up keeps one record)', () => {
    recordPendingTx(SCOPE, HASH_A)
    recordPendingTx(SCOPE, HASH_B)
    const records = listPendingTx(SCOPE)
    expect(records).toHaveLength(1)
    expect(records[0].hash).toBe(HASH_B)
  })

  it('scopes listing by prefix so another match or account never matches', () => {
    recordPendingTx(SCOPE, HASH_A)
    expect(listPendingTx('arb-sepolia-v1|2|')).toHaveLength(0)
    expect(listPendingTx('arb-sepolia-v1|1|0xbbbb')).toHaveLength(0)
  })

  it('drops stale records instead of re-attaching them', () => {
    vi.useFakeTimers()
    try {
      recordPendingTx(SCOPE, HASH_A)
      vi.advanceTimersByTime(PENDING_TX_MAX_AGE_MS + 1)
      expect(listPendingTx(SCOPE, Date.now())).toHaveLength(0)
      // The stale record was pruned from storage, not only filtered.
      expect(sessionStorage.getItem('onchain:pending-tx:v1')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('survives corrupted storage payloads', () => {
    sessionStorage.setItem('onchain:pending-tx:v1', '{not json')
    expect(listPendingTx(SCOPE)).toHaveLength(0)
    recordPendingTx(SCOPE, HASH_A)
    expect(listPendingTx(SCOPE)).toHaveLength(1)
  })

  it('clearAllPendingTx wipes everything (disconnect hygiene)', () => {
    recordPendingTx(SCOPE, HASH_A)
    clearAllPendingTx()
    expect(listPendingTx('')).toHaveLength(0)
  })

  it('never stores anything beyond scope, hash, and timestamp', () => {
    recordPendingTx(SCOPE, HASH_A)
    const raw = JSON.parse(sessionStorage.getItem('onchain:pending-tx:v1')!) as unknown[]
    expect(Object.keys(raw[0] as object).sort()).toEqual(['hash', 'scope', 'ts'])
  })
})
