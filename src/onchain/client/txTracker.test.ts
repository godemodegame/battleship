import { describe, expect, it, vi } from 'vitest'
import {
  IDLE_TX_STATE,
  isTxBusy,
  trackTransaction,
  type Hash,
  type TrackedReceipt,
  type TxState,
} from './txTracker'

const HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001' as Hash
const HASH2 = '0xbbbb000000000000000000000000000000000000000000000000000000000002' as Hash

function receipt(status: 'success' | 'reverted', hash: Hash = HASH): TrackedReceipt {
  return { status, transactionHash: hash }
}

function collect(): { states: TxState[]; onState: (s: TxState) => void } {
  const states: TxState[] = []
  return { states, onState: (s) => states.push(s) }
}

describe('trackTransaction (GAME-503/511)', () => {
  it('walks wallet → pending → success for a confirmed write', async () => {
    const { states, onState } = collect()
    const outcome = await trackTransaction({
      send: async () => HASH,
      wait: async () => receipt('success'),
      onState,
    })
    expect(outcome.ok).toBe(true)
    expect(states.map((s) => s.phase)).toEqual(['wallet', 'pending', 'success'])
    expect(states.at(-1)!.hash).toBe(HASH)
  })

  it('maps a wallet rejection during send to a terminal error', async () => {
    const { states, onState } = collect()
    const outcome = await trackTransaction({
      send: async () => {
        throw Object.assign(new Error('denied'), { code: 4001 })
      },
      wait: async () => receipt('success'),
      onState,
    })
    expect(outcome.ok).toBe(false)
    expect(states.map((s) => s.phase)).toEqual(['wallet', 'error'])
    expect(states.at(-1)!.error).toBe('transaction-rejected')
  })

  it('marks a reverted receipt as transaction-reverted', async () => {
    const { states, onState } = collect()
    const outcome = await trackTransaction({
      send: async () => HASH,
      wait: async () => receipt('reverted'),
      onState,
    })
    expect(outcome.ok).toBe(false)
    expect(states.at(-1)!.error).toBe('transaction-reverted')
  })

  it('tracks a repriced (sped up) transaction to success under the new hash', async () => {
    const { states, onState } = collect()
    const outcome = await trackTransaction({
      send: async () => HASH,
      wait: async (_hash, onReplaced) => {
        onReplaced({ reason: 'repriced', hash: HASH2 })
        return receipt('success', HASH2)
      },
      onState,
    })
    expect(outcome.ok).toBe(true)
    const final = states.at(-1)!
    expect(final.phase).toBe('success')
    expect(final.hash).toBe(HASH2)
    expect(states.some((s) => s.replaced)).toBe(true)
  })

  it('treats a wallet-cancelled replacement as a terminal cancellation', async () => {
    const { states, onState } = collect()
    const outcome = await trackTransaction({
      send: async () => HASH,
      wait: async (_hash, onReplaced) => {
        onReplaced({ reason: 'cancelled', hash: HASH2 })
        // viem resolves with the replacement (cancellation) receipt.
        return receipt('success', HASH2)
      },
      onState,
    })
    expect(outcome.ok).toBe(false)
    expect(states.at(-1)!.error).toBe('transaction-cancelled')
  })

  it('maps a receipt timeout to transaction-dropped', async () => {
    const { states, onState } = collect()
    const outcome = await trackTransaction({
      send: async () => HASH,
      wait: async () => {
        throw Object.assign(new Error('timeout'), {
          name: 'WaitForTransactionReceiptTimeoutError',
        })
      },
      onState,
    })
    expect(outcome.ok).toBe(false)
    expect(states.at(-1)!.error).toBe('transaction-dropped')
  })

  it('never throws; unknown send failures end in an unknown error state', async () => {
    const onState = vi.fn()
    const outcome = await trackTransaction({
      send: async () => {
        throw new Error('boom')
      },
      wait: async () => receipt('success'),
      onState,
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.state.error).toBe('unknown')
  })
})

describe('isTxBusy', () => {
  it('is busy only while in wallet or pending phases', () => {
    expect(isTxBusy(IDLE_TX_STATE)).toBe(false)
    expect(isTxBusy({ ...IDLE_TX_STATE, phase: 'wallet' })).toBe(true)
    expect(isTxBusy({ ...IDLE_TX_STATE, phase: 'pending' })).toBe(true)
    expect(isTxBusy({ ...IDLE_TX_STATE, phase: 'success' })).toBe(false)
    expect(isTxBusy({ ...IDLE_TX_STATE, phase: 'error' })).toBe(false)
  })
})
