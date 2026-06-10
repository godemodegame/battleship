/**
 * Haptic feedback via the Vibration API.
 * Works on Android (Chrome, etc). Safe no-op on iOS Safari and unsupported browsers.
 * Persisted mute toggle independent of sound (users often want haptics even with SFX off).
 * Follows the same priming/ergonomics spirit as sfx.ts but vibration needs no unlock gesture.
 */
let muted = localStorage.getItem('eb-haptics-muted') === '1'

function vibrate(pattern: number | number[]) {
  if (muted) return
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    // Some implementations return boolean; we ignore the result.
    // Arrays produce rhythmic feedback where supported; single number is widely supported.
    navigator.vibrate(pattern as any)
  } catch {
    // ignore
  }
}

export const haptics = {
  get muted() {
    return muted
  },
  setMuted(value: boolean) {
    muted = value
    localStorage.setItem('eb-haptics-muted', value ? '1' : '0')
  },

  // Low-level primitives (use semantic methods below in most cases)
  light: () => vibrate(12),
  medium: () => vibrate(28),
  heavy: () => vibrate(55),

  // Semantic actions — tuned for touch gameplay feel
  tap: () => vibrate(10), // very light selection / hover feedback
  select: () => vibrate(20), // deliberate cell/option pick
  confirm: () => vibrate(38), // commit action (confirm fleet, etc)
  place: () => vibrate(24), // successful ship placement
  deny: () => vibrate([10, 32, 10]), // invalid action / error wiggle
  fire: () => vibrate(30), // initiating a shot

  // Shot results — mirror the distinct sfx personalities
  miss: () => vibrate(8), // subtle, almost a tick
  hit: () => vibrate(30),
  sunk: () => vibrate([42, 18, 78]), // heavier, double-pulse "impact + crunch"

  // End states
  win: () => vibrate([22, 48, 22, 85]), // rising celebratory
  lose: () => vibrate([65, 30, 105]), // heavy, descending

  // Generic positive/negative for UI
  success: () => vibrate([16, 42, 16]),
  error: () => vibrate([10, 28, 10]),
}
