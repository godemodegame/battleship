/**
 * Pending-transaction persistence for browser suspension recovery (GAME-802).
 *
 * Mobile browsers freeze or discard the page while the user is inside their
 * wallet app. A write that already broadcast keeps confirming on-chain, but
 * the in-memory `TxState` is gone after the tab is reloaded or restored. This
 * store keeps the minimal public record of each in-flight write — the hash
 * and the route scope it belongs to — in sessionStorage, so the match route
 * can re-attach to the receipt after a resume instead of stranding the player
 * in a stale phase.
 *
 * Privacy: only transaction hashes and route identifiers are stored. Hashes
 * are public chain data; no plaintext fleet, ciphertext, key, or address
 * secret is ever written here (docs/security-and-fair-play.md).
 */

export interface PendingTxRecord {
  /** Scope key the write belongs to (see `pendingTxScope`). */
  scope: string
  hash: `0x${string}`
  /** When the hash was recorded (epoch ms), for staleness discard. */
  ts: number
}

const STORE_KEY = 'onchain:pending-tx:v1'

/** Pending hashes older than this are dropped instead of re-attached. */
export const PENDING_TX_MAX_AGE_MS = 1000 * 60 * 30

/**
 * Canonical scope for one write kind on one match as one account, e.g.
 * `arb-sepolia-v1|1|0xabc…|attack`. The address keeps another account in the
 * same browser session from resuming a write it did not send.
 */
export function pendingTxScope(parts: {
  deploymentId: string
  matchId: bigint | string
  address: string
  kind: string
}): string {
  return [
    parts.deploymentId,
    String(parts.matchId),
    parts.address.toLowerCase(),
    parts.kind,
  ].join('|')
}

function readAll(): PendingTxRecord[] {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is PendingTxRecord =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as PendingTxRecord).scope === 'string' &&
        typeof (entry as PendingTxRecord).hash === 'string' &&
        (entry as PendingTxRecord).hash.startsWith('0x') &&
        typeof (entry as PendingTxRecord).ts === 'number',
    )
  } catch {
    return []
  }
}

function writeAll(records: PendingTxRecord[]): void {
  try {
    if (records.length === 0) sessionStorage.removeItem(STORE_KEY)
    else sessionStorage.setItem(STORE_KEY, JSON.stringify(records))
  } catch {
    // sessionStorage unavailable (private mode, quota): recovery degrades to
    // the contract-phase refetch, which is still authoritative.
  }
}

/** Record (or replace) the in-flight hash for one write scope. */
export function recordPendingTx(scope: string, hash: `0x${string}`): void {
  const rest = readAll().filter((entry) => entry.scope !== scope)
  rest.push({ scope, hash, ts: Date.now() })
  writeAll(rest)
}

/** Drop the record for one write scope (terminal state reached). */
export function clearPendingTx(scope: string): void {
  const all = readAll()
  const rest = all.filter((entry) => entry.scope !== scope)
  if (rest.length !== all.length) writeAll(rest)
}

/**
 * Fresh records whose scope starts with `scopePrefix` (e.g. one match's
 * deployment + match id + address). Stale records are pruned as a side effect.
 */
export function listPendingTx(scopePrefix: string, now = Date.now()): PendingTxRecord[] {
  const all = readAll()
  const fresh = all.filter((entry) => now - entry.ts <= PENDING_TX_MAX_AGE_MS)
  if (fresh.length !== all.length) writeAll(fresh)
  return fresh.filter((entry) => entry.scope.startsWith(scopePrefix))
}

/** Wipe every pending record (disconnect / session teardown hygiene). */
export function clearAllPendingTx(): void {
  try {
    sessionStorage.removeItem(STORE_KEY)
  } catch {}
}
