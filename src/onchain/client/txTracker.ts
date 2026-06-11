/**
 * Transaction lifecycle tracker (GAME-503 / GAME-511).
 *
 * One state machine for every contract write: wallet confirmation → pending →
 * confirmed / failed, including replacement ("speed up"), cancellation, drop,
 * and revert outcomes. Pure orchestration over injected `send` / `wait`
 * functions so the full lifecycle is unit-testable without a network.
 *
 * Phases:
 * - `idle`    — nothing in flight (also the post-`reset` retry state).
 * - `wallet`  — waiting for the user to confirm in the wallet.
 * - `pending` — transaction broadcast; waiting for a receipt.
 * - `success` — receipt confirmed with `status: 'success'`.
 * - `error`   — rejected, reverted, dropped, cancelled, or unknown failure.
 */

import type { ErrorCode } from '../../copy/errors'
import { decodeTxError } from './decodeError'

export type TxPhase = 'idle' | 'wallet' | 'pending' | 'success' | 'error'

export type Hash = `0x${string}`

export interface TxState {
  phase: TxPhase
  /** Latest known transaction hash (updates if the wallet replaces the tx). */
  hash: Hash | null
  /** True when the original transaction was replaced or repriced (GAME-511). */
  replaced: boolean
  /** Player-facing failure code; set only in the `error` phase. */
  error: ErrorCode | null
}

export const IDLE_TX_STATE: TxState = {
  phase: 'idle',
  hash: null,
  replaced: false,
  error: null,
}

export type ReplacementReason = 'replaced' | 'repriced' | 'cancelled'

export interface ReplacementInfo {
  reason: ReplacementReason
  hash: Hash
}

/** Minimal receipt shape the tracker needs from viem. */
export interface TrackedReceipt {
  status: 'success' | 'reverted'
  transactionHash: Hash
}

export interface TrackTransactionParams<R extends TrackedReceipt> {
  /** Simulate + submit; resolves with the hash once the wallet confirms. */
  send: () => Promise<Hash>
  /** Wait for the receipt; must report replacements through `onReplaced`. */
  wait: (hash: Hash, onReplaced: (info: ReplacementInfo) => void) => Promise<R>
  /** Observer for every state transition (drives UI). */
  onState: (state: TxState) => void
}

export type TxOutcome<R extends TrackedReceipt> =
  | { ok: true; receipt: R; state: TxState }
  | { ok: false; state: TxState }

/**
 * Run one write through the full lifecycle. Never throws: every failure ends
 * in an `error` state with a mapped `ErrorCode`.
 */
export async function trackTransaction<R extends TrackedReceipt>(
  params: TrackTransactionParams<R>,
): Promise<TxOutcome<R>> {
  const { send, wait, onState } = params

  let state: TxState = { ...IDLE_TX_STATE, phase: 'wallet' }
  const emit = (next: TxState) => {
    state = next
    onState(next)
  }
  emit(state)

  let hash: Hash
  try {
    hash = await send()
  } catch (err) {
    emit({ ...state, phase: 'error', error: decodeTxError(err) })
    return { ok: false, state }
  }

  emit({ ...state, phase: 'pending', hash })

  let cancelled = false
  let receipt: R
  try {
    receipt = await wait(hash, (info) => {
      // A "speed up" lands the same intent under a new hash; a "cancel" lands
      // a replacement that voids the intent. Track the new hash either way so
      // explorer links stay correct (GAME-511/512).
      cancelled = info.reason === 'cancelled'
      emit({ ...state, hash: info.hash, replaced: true })
    })
  } catch (err) {
    emit({ ...state, phase: 'error', error: decodeTxError(err) })
    return { ok: false, state }
  }

  if (cancelled) {
    emit({ ...state, phase: 'error', error: 'transaction-cancelled' })
    return { ok: false, state }
  }

  if (receipt.status !== 'success') {
    emit({ ...state, hash: receipt.transactionHash, phase: 'error', error: 'transaction-reverted' })
    return { ok: false, state }
  }

  emit({ ...state, hash: receipt.transactionHash, phase: 'success' })
  return { ok: true, receipt, state }
}

/** True while a tracked write is in flight (used to block duplicate submits). */
export function isTxBusy(state: TxState): boolean {
  return state.phase === 'wallet' || state.phase === 'pending'
}
