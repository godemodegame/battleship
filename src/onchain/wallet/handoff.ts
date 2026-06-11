/**
 * Mobile wallet handoff persistence (GAME-210).
 *
 * Before the browser yields to a mobile wallet app (MetaMask, Coinbase, etc.),
 * callers persist only the minimal route intent. On return (visibility/focus
 * after the wallet interaction), the app consumes the marker and can ensure
 * the user is on the intended match route and that state is re-synchronized.
 *
 * Persists in sessionStorage so a same-tab resume after wallet app returns
 * (or after a suspended tab wakes) can recover the target without leaking
 * into history or localStorage. Never stores plaintext fleets or secrets.
 *
 * Spec: docs/network-and-wallet-requirements.md (Mobile Wallet Return).
 */

const HANDOFF_KEY = 'onchain:handoff:intent:v1'

export interface HandoffIntent {
  /** The pathname (and optional search) to restore, e.g. "/match/arb-sepolia-v1/abc123" */
  target: string
  /** When the handoff was recorded (epoch ms). For staleness discard. */
  ts: number
}

/** Persist the intended on-chain route before yielding control to a mobile wallet. */
export function saveHandoffIntent(target: string): void {
  if (!target) return
  try {
    const intent: HandoffIntent = { target, ts: Date.now() }
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(intent))
  } catch {
    // sessionStorage may be unavailable (private mode, etc.). Non-fatal.
  }
}

/**
 * Consume and return a previously saved handoff target, if any and not stale.
 * Returns the target string (pathname[+search]) or null.
 * Always clears the marker when called.
 */
export function consumeHandoffIntent(maxAgeMs = 1000 * 60 * 10): string | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY)
    if (!raw) return null
    sessionStorage.removeItem(HANDOFF_KEY)
    const parsed = JSON.parse(raw) as Partial<HandoffIntent>
    if (!parsed || typeof parsed.target !== 'string' || !parsed.target) return null
    const age = Date.now() - (parsed.ts ?? 0)
    if (age > maxAgeMs) return null
    return parsed.target
  } catch {
    try {
      sessionStorage.removeItem(HANDOFF_KEY)
    } catch {}
    return null
  }
}

/** Clear any pending handoff marker without consuming (e.g. on explicit disconnect). */
export function clearHandoffIntent(): void {
  try {
    sessionStorage.removeItem(HANDOFF_KEY)
  } catch {}
}
