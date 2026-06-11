/**
 * Wallet / RPC / contract error decoding (GAME-503).
 *
 * viem wraps failures in nested error chains (e.g. `ContractFunctionExecutionError`
 * → `ContractFunctionRevertedError` with the decoded custom error name). This
 * module walks that chain structurally — no instanceof, so fake errors in tests
 * and slightly different viem versions both decode — and maps everything onto
 * the player-facing `ErrorCode` set. Raw provider errors never reach the UI.
 */

import { mapContractError, type ErrorCode } from '../../copy/errors'

interface ErrorishData {
  errorName?: unknown
}

interface Errorish {
  code?: unknown
  name?: unknown
  data?: ErrorishData
  cause?: unknown
}

function* causeChain(err: unknown): Generator<Errorish> {
  const seen = new Set<unknown>()
  let current = err
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    yield current as Errorish
    current = (current as Errorish).cause
  }
}

/** Decoded Solidity custom-error name anywhere in the cause chain, or null. */
export function findRevertErrorName(err: unknown): string | null {
  for (const node of causeChain(err)) {
    const name = node.data?.errorName
    if (typeof name === 'string' && name.length > 0) return name
  }
  return null
}

/** True when the user rejected the request in the wallet (EIP-1193 4001). */
export function isUserRejection(err: unknown): boolean {
  for (const node of causeChain(err)) {
    if (node.code === 4001 || node.name === 'UserRejectedRequestError') return true
  }
  return false
}

/** Map a write-path failure (simulate, send, or wait) onto a player-facing code. */
export function decodeTxError(err: unknown): ErrorCode {
  if (isUserRejection(err)) return 'transaction-rejected'
  const revertName = findRevertErrorName(err)
  if (revertName) {
    const mapped = mapContractError(revertName)
    return mapped === 'unknown' ? 'transaction-reverted' : mapped
  }
  for (const node of causeChain(err)) {
    if (
      node.name === 'WaitForTransactionReceiptTimeoutError' ||
      node.name === 'TransactionNotFoundError' ||
      node.name === 'TransactionReceiptNotFoundError'
    ) {
      return 'transaction-dropped'
    }
  }
  if (isRpcTransportError(err)) return 'rpc-unreachable'
  return 'unknown'
}

/** True when the failure is the RPC transport itself (offline, down, timeout). */
export function isRpcTransportError(err: unknown): boolean {
  for (const node of causeChain(err)) {
    if (
      node.name === 'HttpRequestError' ||
      node.name === 'TimeoutError' ||
      node.name === 'WebSocketRequestError' ||
      // fetch() network failures surface as TypeError("Failed to fetch" / "Load failed")
      (node.name === 'TypeError' &&
        typeof (node as { message?: unknown }).message === 'string' &&
        /fetch|load failed|network/i.test((node as { message: string }).message))
    ) {
      return true
    }
  }
  return false
}

/** Map a read-path failure onto `match-not-found` or a recoverable load error. */
export function decodeReadError(err: unknown): ErrorCode {
  const revertName = findRevertErrorName(err)
  if (revertName && mapContractError(revertName) === 'match-not-found') {
    return 'match-not-found'
  }
  if (isRpcTransportError(err)) return 'rpc-unreachable'
  return 'match-load-failed'
}
