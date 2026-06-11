/**
 * Suspension-recovery hook tests (GAME-802): a persisted pending hash is
 * re-attached through the public client on mount and on visibility return,
 * then cleared with an authoritative refetch — regardless of how it settles.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicClientLike } from './battleshipClient'
import { listPendingTx, pendingTxScope, recordPendingTx } from './pendingTxStore'
import { usePendingTxRecovery } from './usePendingTxRecovery'

const HASH = '0xeeee000000000000000000000000000000000000000000000000000000000005' as const

const SCOPE = pendingTxScope({
  deploymentId: 'arb-sepolia-v1',
  matchId: 1n,
  address: '0xaaaa000000000000000000000000000000000001',
  kind: 'attack',
})
const PREFIX = 'arb-sepolia-v1|1|0xaaaa000000000000000000000000000000000001|'

interface Deferred {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

function makePublicClient() {
  const waits: Array<{ hash: string; deferred: Deferred }> = []
  const client = {
    waitForTransactionReceipt: vi.fn(({ hash }: { hash: string }) => {
      return new Promise((resolve, reject) => {
        waits.push({ hash, deferred: { resolve, reject } })
      })
    }),
  } as unknown as PublicClientLike
  return { client, waits }
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('usePendingTxRecovery', () => {
  it('re-attaches to a persisted hash on mount and refetches when it settles', async () => {
    recordPendingTx(SCOPE, HASH)
    const { client, waits } = makePublicClient()
    const onSettled = vi.fn()

    const { result } = renderHook(() =>
      usePendingTxRecovery({ publicClient: client, scopePrefix: PREFIX, onSettled }),
    )

    await waitFor(() => expect(result.current.recovering).toContain(HASH))
    expect(waits[0].hash).toBe(HASH)
    expect(onSettled).not.toHaveBeenCalled()

    await act(async () => {
      waits[0].deferred.resolve({ status: 'success', transactionHash: HASH, logs: [] })
    })

    await waitFor(() => expect(result.current.recovering).toHaveLength(0))
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(listPendingTx(PREFIX)).toHaveLength(0)
  })

  it('clears the record and refetches even when the receipt lookup fails', async () => {
    recordPendingTx(SCOPE, HASH)
    const { client, waits } = makePublicClient()
    const onSettled = vi.fn()

    const { result } = renderHook(() =>
      usePendingTxRecovery({ publicClient: client, scopePrefix: PREFIX, onSettled }),
    )

    await waitFor(() => expect(result.current.recovering).toContain(HASH))
    await act(async () => {
      waits[0].deferred.reject(new Error('dropped'))
    })

    await waitFor(() => expect(result.current.recovering).toHaveLength(0))
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(listPendingTx(PREFIX)).toHaveLength(0)
  })

  it('rescans when the page becomes visible again (suspension resume)', async () => {
    const { client, waits } = makePublicClient()
    const onSettled = vi.fn()

    const { result } = renderHook(() =>
      usePendingTxRecovery({ publicClient: client, scopePrefix: PREFIX, onSettled }),
    )
    expect(result.current.recovering).toHaveLength(0)

    // The hash lands while the tab is suspended; resume fires visibilitychange.
    recordPendingTx(SCOPE, HASH)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(result.current.recovering).toContain(HASH))
    expect(waits).toHaveLength(1)
  })

  it('never double-attaches the same scope across rescans', async () => {
    recordPendingTx(SCOPE, HASH)
    const { client, waits } = makePublicClient()

    const { result } = renderHook(() =>
      usePendingTxRecovery({ publicClient: client, scopePrefix: PREFIX, onSettled: vi.fn() }),
    )
    await waitFor(() => expect(result.current.recovering).toContain(HASH))

    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(waits).toHaveLength(1)
  })

  it('does nothing for another match or account scope', () => {
    recordPendingTx(SCOPE, HASH)
    const { client, waits } = makePublicClient()

    renderHook(() =>
      usePendingTxRecovery({
        publicClient: client,
        scopePrefix: 'arb-sepolia-v1|2|0xaaaa000000000000000000000000000000000001|',
        onSettled: vi.fn(),
      }),
    )

    expect(waits).toHaveLength(0)
  })
})
