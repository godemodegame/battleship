/**
 * React binding for the transaction tracker (GAME-503 / GAME-506 / GAME-511).
 *
 * Holds one write's `TxState` for the UI and enforces single-flight: while a
 * write is in the wallet or pending, `run` refuses to start another, so a
 * double-tap can never submit a duplicate transaction (Phase 5 exit
 * criterion). `reset` returns to idle for an explicit retry.
 *
 * When a `persistScope` is given, the broadcast hash is mirrored into the
 * pending-tx store while the write is in flight and cleared on any terminal
 * state, so a suspended browser can re-attach to the receipt after resume
 * (GAME-802). The scope should come from `pendingTxScope`.
 */

import { useCallback, useRef, useState } from 'react'
import { perf } from '../../lib/perf'
import { clearPendingTx, recordPendingTx } from './pendingTxStore'
import { IDLE_TX_STATE, isTxBusy, type TxState } from './txTracker'

/** Perf label for one write: the kind suffix of its persist scope, or 'tx'. */
function txPerfLabel(scope: string | null): string {
  if (!scope) return 'tx'
  const kind = scope.split('|').pop()
  return kind ? `tx:${kind}` : 'tx'
}

export interface TrackedWrite {
  state: TxState
  busy: boolean
  /**
   * Run one write. The function receives the state observer to pass into a
   * `BattleshipWriteClient` method. Returns the write's result, or `null`
   * when a write is already in flight.
   */
  run: <T>(write: (onState: (state: TxState) => void) => Promise<T>) => Promise<T | null>
  /** Clear a terminal state (success or error) back to idle. */
  reset: () => void
}

export function useTrackedWrite(persistScope?: string | null): TrackedWrite {
  const [state, setState] = useState<TxState>(IDLE_TX_STATE)
  const [running, setRunning] = useState(false)
  const inFlightRef = useRef(false)
  const scopeRef = useRef(persistScope ?? null)
  scopeRef.current = persistScope ?? null

  const stopTimerRef = useRef<(() => number) | null>(null)

  const observe = useCallback((next: TxState) => {
    const scope = scopeRef.current
    if (scope) {
      if (next.phase === 'pending' && next.hash) recordPendingTx(scope, next.hash)
      else if (next.phase === 'success' || next.phase === 'error') clearPendingTx(scope)
    }
    // GAME-809: wallet-open → terminal latency, recorded locally only.
    if (next.phase === 'wallet' && !stopTimerRef.current) {
      stopTimerRef.current = perf.start(txPerfLabel(scope))
    } else if (next.phase === 'success' || next.phase === 'error') {
      stopTimerRef.current?.()
      stopTimerRef.current = null
    }
    setState(next)
  }, [])

  const run = useCallback(
    async <T,>(write: (onState: (state: TxState) => void) => Promise<T>): Promise<T | null> => {
      if (inFlightRef.current) return null
      inFlightRef.current = true
      setRunning(true)
      try {
        return await write(observe)
      } finally {
        inFlightRef.current = false
        setRunning(false)
      }
    },
    [observe],
  )

  const reset = useCallback(() => {
    if (!inFlightRef.current) setState(IDLE_TX_STATE)
  }, [])

  return { state, busy: isTxBusy(state) || running, run, reset }
}
