/**
 * React binding for the transaction tracker (GAME-503 / GAME-506 / GAME-511).
 *
 * Holds one write's `TxState` for the UI and enforces single-flight: while a
 * write is in the wallet or pending, `run` refuses to start another, so a
 * double-tap can never submit a duplicate transaction (Phase 5 exit
 * criterion). `reset` returns to idle for an explicit retry.
 */

import { useCallback, useRef, useState } from 'react'
import { IDLE_TX_STATE, isTxBusy, type TxState } from './txTracker'

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

export function useTrackedWrite(): TrackedWrite {
  const [state, setState] = useState<TxState>(IDLE_TX_STATE)
  const inFlightRef = useRef(false)

  const run = useCallback(
    async <T,>(write: (onState: (state: TxState) => void) => Promise<T>): Promise<T | null> => {
      if (inFlightRef.current) return null
      inFlightRef.current = true
      try {
        return await write(setState)
      } finally {
        inFlightRef.current = false
      }
    },
    [],
  )

  const reset = useCallback(() => {
    if (!inFlightRef.current) setState(IDLE_TX_STATE)
  }, [])

  return { state, busy: isTxBusy(state) || inFlightRef.current, run, reset }
}
