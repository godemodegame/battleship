/**
 * Mobile wallet handoff persistence (GAME-210).
 *
 * Before opening a mobile wallet app, the UI persists only the intended
 * route, match id, and pending action type so the player returns to the right
 * screen (`docs/network-and-wallet-requirements.md`). Plaintext fleet cells,
 * encrypted input secrets, and transaction hashes for in-flight signatures are
 * never persisted here.
 *
 * Storage uses `sessionStorage` so the pending action does not outlive the
 * browser tab/session.
 */

const STORAGE_KEY = 'battleship.pendingWalletAction'

export interface PendingWalletAction {
  /** The app route to restore, e.g. "/match/arb-sepolia-v1/42". */
  route: string
  matchId: string | null
  /** Short identifier for the action awaiting confirmation, e.g. "create-match". */
  actionType: string
  startedAt: number
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Mark an action as waiting for wallet confirmation before redirecting to a wallet app. */
export function savePendingWalletAction(action: Omit<PendingWalletAction, 'startedAt'>): void {
  const storage = getStorage()
  if (!storage) return
  const record: PendingWalletAction = { ...action, startedAt: Date.now() }
  storage.setItem(STORAGE_KEY, JSON.stringify(record))
}

/** Read the pending action, or `null` if none is recorded or it is malformed. */
export function loadPendingWalletAction(): PendingWalletAction | null {
  const storage = getStorage()
  if (!storage) return null
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PendingWalletAction>
    if (
      typeof parsed.route === 'string' &&
      typeof parsed.actionType === 'string' &&
      typeof parsed.startedAt === 'number' &&
      (typeof parsed.matchId === 'string' || parsed.matchId === null)
    ) {
      return parsed as PendingWalletAction
    }
    return null
  } catch {
    return null
  }
}

export function clearPendingWalletAction(): void {
  const storage = getStorage()
  if (!storage) return
  storage.removeItem(STORAGE_KEY)
}
