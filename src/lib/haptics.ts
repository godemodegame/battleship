/**
 * Haptic feedback.
 *
 * - Native: uses navigator.vibrate where supported (Android Chrome etc.).
 * - iOS Safari fallback: synthesizes short low-frequency audio bursts via the shared
 *   AudioContext. Modern iPhones map suitable transients to the Taptic Engine.
 *
 * Persisted mute toggle independent of sound. The sfx priming is now unconditional
 * (see sfx.ts) so haptics get a working context even when sound is muted.
 */
import { ensureAudio } from './sfx'

let muted = localStorage.getItem('eb-haptics-muted') === '1'

const hasVibrate =
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

function vibrate(pattern: number | number[]) {
  if (muted || !hasVibrate) return
  try {
    navigator.vibrate(pattern as any)
  } catch {
    // ignore
  }
}

/**
 * iOS Taptic / cross-platform audio haptic.
 * Short low-frequency bursts. Gains chosen to be strong enough to trigger
 * Taptic Engine on iPhone Safari while remaining subtle.
 */
function audioHaptic(
  style:
    | 'light'
    | 'medium'
    | 'heavy'
    | 'tap'
    | 'select'
    | 'impact'
    | 'double'
    | 'error'
    | 'win'
    | 'lose',
) {
  if (muted) return
  let ac: AudioContext | null = null
  try {
    ac = ensureAudio()
  } catch {
    return
  }
  if (!ac) return

  // On iOS Safari the context can auto-suspend between user gestures (e.g. during
  // flight/impact delays). Nudge resume right before we emit the transient.
  if (ac.state === 'suspended') {
    void ac.resume().catch(() => {})
  }

  // Small lead time helps after a resume() call and gives the scheduler headroom.
  const t0 = ac.currentTime + 0.005

  const play = (freq: number, dur: number, gain: number, delay = 0) => {
    try {
      const osc = ac!.createOscillator()
      const g = ac!.createGain()
      const lp = ac!.createBiquadFilter()

      osc.type = 'sine'
      osc.frequency.value = freq

      lp.type = 'lowpass'
      lp.frequency.value = 160

      const start = t0 + delay
      g.gain.value = 0
      g.gain.linearRampToValueAtTime(gain, start + 0.002)
      g.gain.linearRampToValueAtTime(0.00001, start + dur)

      osc.connect(lp).connect(g).connect(ac!.destination)
      osc.start(start)
      osc.stop(start + dur + 0.008)
    } catch {
      // jsdom or broken AudioContext in test env — silently ignore
    }
  }

  // Tuned for tactile feel on iPhone Taptic (and subtle thump elsewhere).
  // Gains are higher than before so the burst reliably engages the Taptic Engine.
  switch (style) {
    case 'light':
    case 'tap':
      play(62, 0.014, 0.07)
      break
    case 'medium':
    case 'select':
      play(48, 0.026, 0.1)
      break
    case 'heavy':
    case 'impact':
      play(38, 0.038, 0.14)
      break
    case 'double':
      play(52, 0.018, 0.08)
      play(44, 0.022, 0.07, 0.032)
      break
    case 'error':
      play(58, 0.012, 0.07)
      play(52, 0.014, 0.06, 0.022)
      break
    case 'win':
      play(55, 0.016, 0.08)
      play(62, 0.018, 0.09, 0.028)
      play(48, 0.026, 0.1, 0.055)
      break
    case 'lose':
      play(36, 0.042, 0.13)
      play(30, 0.028, 0.09, 0.055)
      break
  }
}

function haptic(
  style:
    | 'light'
    | 'medium'
    | 'heavy'
    | 'tap'
    | 'select'
    | 'impact'
    | 'double'
    | 'error'
    | 'win'
    | 'lose',
  vibPattern?: number | number[],
) {
  if (muted) return
  if (hasVibrate && vibPattern != null) {
    vibrate(vibPattern)
  } else {
    audioHaptic(style)
  }
}

export const haptics = {
  get muted() {
    return muted
  },
  setMuted(value: boolean) {
    muted = value
    localStorage.setItem('eb-haptics-muted', value ? '1' : '0')
    if (!value) {
      // Unmuting haptics: prime so the next haptic (possibly not on a fresh gesture)
      // can use an already-unlocked AudioContext on iOS Safari.
      try {
        ensureAudio()
      } catch {
        // ignore
      }
    }
  },

  // Low-level primitives
  light: () => haptic('light', 12),
  medium: () => haptic('medium', 28),
  heavy: () => haptic('heavy', 55),

  // Semantic actions
  tap: () => haptic('tap', 10),
  select: () => haptic('select', 20),
  confirm: () => haptic('impact', 38),
  place: () => haptic('medium', 24),
  deny: () => haptic('error', [10, 32, 10]),
  fire: () => haptic('medium', 30),

  // Shot results
  miss: () => haptic('light', 8),
  hit: () => haptic('medium', 30),
  sunk: () => haptic('impact', [42, 18, 78]),

  // End states
  win: () => haptic('win', [22, 48, 22, 85]),
  lose: () => haptic('lose', [65, 30, 105]),

  // UI
  success: () => haptic('win', [16, 42, 16]),
  error: () => haptic('error', [10, 28, 10]),
}
