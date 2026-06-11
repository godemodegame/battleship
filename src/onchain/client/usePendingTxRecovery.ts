/**
 * Pending-receipt recovery after browser suspension (GAME-802).
 *
 * On mount and on every resume signal (focus / visibility return), the hook
 * looks up persisted pending transactions for the current match + account
 * scope and re-attaches to their receipts through the public client. When a
 * receipt settles (confirmed, reverted, or dropped), the record is cleared
 * and the caller refetches the authoritative contract phase — recovery never
 * derives match state from the receipt itself.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PublicClientLike } from './battleshipClient'
import { clearPendingTx, listPendingTx, type PendingTxRecord } from './pendingTxStore'

export interface PendingTxRecoveryParams {
  publicClient: PublicClientLike | null
  /** Match-scope prefix from `pendingTxScope` parts (deployment|match|address). */
  scopePrefix: string | null
  /** Re-read the contract phase after a recovered receipt settles. */
  onSettled: () => void
}

export interface PendingTxRecovery {
  /** Hashes currently being re-attached, for a visible recovery state. */
  recovering: ReadonlyArray<`0x${string}`>
}

export function usePendingTxRecovery(params: PendingTxRecoveryParams): PendingTxRecovery {
  const { publicClient, scopePrefix, onSettled } = params
  const [recovering, setRecovering] = useState<ReadonlyArray<`0x${string}`>>([])
  const inFlightRef = useRef<Set<string>>(new Set())
  const onSettledRef = useRef(onSettled)
  onSettledRef.current = onSettled

  const attach = useCallback(
    (record: PendingTxRecord, client: PublicClientLike) => {
      if (inFlightRef.current.has(record.scope)) return
      inFlightRef.current.add(record.scope)
      setRecovering((current) =>
        current.includes(record.hash) ? current : [...current, record.hash],
      )
      const settle = () => {
        // Settled in any direction: the contract read is authoritative now.
        clearPendingTx(record.scope)
        inFlightRef.current.delete(record.scope)
        setRecovering((current) => current.filter((hash) => hash !== record.hash))
        onSettledRef.current()
      }
      client.waitForTransactionReceipt({ hash: record.hash }).then(settle, settle)
    },
    [],
  )

  const scan = useCallback(() => {
    if (!publicClient || !scopePrefix) return
    for (const record of listPendingTx(scopePrefix)) {
      attach(record, publicClient)
    }
  }, [publicClient, scopePrefix, attach])

  useEffect(() => {
    scan()
    const onVisible = () => {
      if (document.visibilityState === 'visible') scan()
    }
    window.addEventListener('focus', scan)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', scan)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [scan])

  return { recovering }
}
