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
  const t0 = ac.currentTime + 0.003

  /**
   * Play a short, low-frequency transient using a pre-generated AudioBuffer.
   * This style of sharp decaying impulse is significantly more reliable at
   * triggering the Taptic Engine on iPhone Safari than live oscillators.
   */
  const play = (freq: number, dur: number, gain: number, delay = 0) => {
    try {
      const sampleRate = ac!.sampleRate
      const length = Math.max(2, Math.floor(sampleRate * dur))
      const buffer = ac!.createBuffer(1, length, sampleRate)
      const data = buffer.getChannelData(0)

      // Low-frequency thump / click using a quick sine-ish wave with strong decay.
      // A bit of noise gives it edge so the haptic actuator fires.
      const omega = (2 * Math.PI * freq) / sampleRate
      for (let i = 0; i < length; i++) {
        const t = i / length
        // Main low-freq energy with quadratic decay (feels like a soft "tick").
        const s = Math.sin(omega * i) * (1 - t) * (1 - t)
        // Tiny high-freq noise for transient "click" character (filtered by lowpass later).
        const noise = (Math.random() - 0.5) * 0.6 * (1 - t * 1.2)
        data[i] = s + noise
      }

      const src = ac!.createBufferSource()
      src.buffer = buffer

      const lp = ac!.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 180

      const g = ac!.createGain()
      const start = t0 + delay
      g.gain.value = 0
      // Fast attack + quick release. Higher peak gain than before for reliable haptics.
      g.gain.linearRampToValueAtTime(gain, start + 0.001)
      g.gain.linearRampToValueAtTime(0.00001, start + dur)

      src.connect(lp).connect(g).connect(ac!.destination)
      src.start(start)
    } catch {
      // jsdom or broken AudioContext in test env — silently ignore
    }
  }

  // Tuned for tactile feel on iPhone Taptic (and subtle thump elsewhere).
  // Using buffer-source impulses + these gains so the burst reliably engages
  // the Taptic Engine on modern iOS Safari.
  switch (style) {
    case 'light':
    case 'tap':
      play(58, 0.016, 0.13)
      break
    case 'medium':
    case 'select':
      play(46, 0.028, 0.18)
      break
    case 'heavy':
    case 'impact':
      play(36, 0.040, 0.26)
      break
    case 'double':
      play(50, 0.020, 0.15)
      play(42, 0.024, 0.13, 0.028)
      break
    case 'error':
      play(55, 0.014, 0.14)
      play(48, 0.016, 0.12, 0.018)
      break
    case 'win':
      play(52, 0.018, 0.15)
      play(60, 0.020, 0.16, 0.024)
      play(44, 0.028, 0.18, 0.048)
      break
    case 'lose':
      play(34, 0.044, 0.24)
      play(28, 0.030, 0.17, 0.048)
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

  /**
   * Force an attempt to prime/unlock the AudioContext.
   * Call this as early as possible inside real user gesture handlers
   * (especially r3f onPointerDown on the 3D board) to maximize the chance
   * that the subsequent haptic burst is allowed to trigger Taptic on iOS Safari.
   */
  prime: () => {
    try {
      ensureAudio()
    } catch {
      // ignore
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
