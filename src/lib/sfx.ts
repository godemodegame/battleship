/**
 * Tiny synthesized sound effects — no audio assets needed.
 * On iOS Safari the AudioContext must be created + resumed from a user gesture.
 * We prime a context + silent buffer on first touch/click anywhere (unconditionally,
 * so haptics can share it), and also attempt resume on play. The sound mute only
 * suppresses sfx output; haptics use the same context independently.
 */
let ctx: AudioContext | null = null
let muted = localStorage.getItem('eb-muted') === '1'
let primed = false

function createCtx(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
  if (!Ctor) return null
  return new Ctor()
}

function primeAudio() {
  if (primed) return
  if (!ctx) ctx = createCtx()
  if (!ctx) return

  const resumeAndUnlock = () => {
    if (ctx!.state === 'suspended') {
      void ctx!.resume().catch(() => {})
    }
    // Play a silent buffer during the gesture — this is required to fully
    // unlock Web Audio on iOS Safari for subsequent async plays.
    // We prime regardless of the sound mute flag so that independent haptics
    // (and unmuting later) can use the context.
    try {
      const buf = ctx!.createBuffer(1, 1, 22050)
      const src = ctx!.createBufferSource()
      src.buffer = buf
      src.connect(ctx!.destination)
      src.start(0)
    } catch {
      // ignore
    }
    primed = true
  }

  resumeAndUnlock()
}

function installGestureUnlock() {
  if (typeof window === 'undefined' || primed) return

  const events = ['touchstart', 'touchend', 'pointerdown', 'click', 'mousedown'] as const
  // Use minimal options for reliable add/remove matching across browsers (esp. Safari).
  // Capture is critical so we run before r3f/canvas handlers.
  const addOpts: AddEventListenerOptions = { capture: true, passive: true }
  const removeOpts: AddEventListenerOptions = { capture: true }

  const handler = () => {
    // Always try to prime on any of these; the primed flag prevents repeated work.
    primeAudio()
    // Remove listeners for all event types so we don't keep them around.
    for (const type of events) {
      try {
        window.removeEventListener(type, handler, removeOpts)
      } catch {}
    }
  }

  for (const ev of events) {
    window.addEventListener(ev, handler, addOpts)
  }
}

// Install as early as possible (module eval time in browser)
installGestureUnlock()

function audio(): AudioContext | null {
  // Always return a ctx (if possible) even when sound is muted. The muted flag
  // only suppresses actual tone/noise output. This allows haptics to use the
  // shared AudioContext for iOS Safari Taptic fallback independently.
  if (!ctx) {
    ctx = createCtx()
    if (!ctx) return null
    // If we created it here (late), still try to resume — may work on desktop
    // but on iOS this usually only succeeds if a gesture already happened.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  } else if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {})
  }
  return ctx
}

/** Returns a primed AudioContext (or null). Used by haptics for iOS Safari Taptic fallback.
 * Priming is independent of the sound mute so haptics work when sound is off.
 */
export function ensureAudio(): AudioContext | null {
  primeAudio()
  return audio()
}

function tone(
  freq: number,
  opts: {
    to?: number
    type?: OscillatorType
    duration?: number
    gain?: number
    delay?: number
  } = {},
) {
  if (muted) return
  primeAudio() // ensure we are unlocked if this call is the first gesture
  const ac = audio()
  if (!ac) return
  const { to = freq, type = 'sine', duration = 0.18, gain = 0.12, delay = 0 } = opts
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration)
  amp.gain.setValueAtTime(0, t0)
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.012)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(amp).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function noise(opts: { duration?: number; gain?: number; from?: number; to?: number; delay?: number } = {}) {
  if (muted) return
  primeAudio() // ensure we are unlocked if this call is the first gesture
  const ac = audio()
  if (!ac) return
  const { duration = 0.3, gain = 0.1, from = 2400, to = 300, delay = 0 } = opts
  const t0 = ac.currentTime + delay
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.9
  filter.frequency.setValueAtTime(from, t0)
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + duration)
  const amp = ac.createGain()
  amp.gain.setValueAtTime(gain, t0)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  src.connect(filter).connect(amp).connect(ac.destination)
  src.start(t0)
}

export const sfx = {
  get muted() {
    return muted
  },
  setMuted(value: boolean) {
    muted = value
    localStorage.setItem('eb-muted', value ? '1' : '0')
    if (!value) {
      // Unmuting happens on a click — prime immediately so next sounds work.
      primeAudio()
    }
  },
  ui: () => tone(880, { to: 1320, duration: 0.07, gain: 0.05, type: 'triangle' }),
  deny: () => tone(220, { to: 160, duration: 0.12, gain: 0.07, type: 'square' }),
  place: () => tone(520, { to: 740, duration: 0.1, gain: 0.08, type: 'triangle' }),
  confirm: () => {
    tone(660, { to: 660, duration: 0.09, gain: 0.08, type: 'triangle' })
    tone(990, { to: 990, duration: 0.14, gain: 0.08, type: 'triangle', delay: 0.09 })
  },
  fire: () => noise({ duration: 0.45, gain: 0.09, from: 600, to: 3200 }),
  miss: () => {
    noise({ duration: 0.5, gain: 0.12, from: 1800, to: 250 })
    tone(180, { to: 60, duration: 0.4, gain: 0.06 })
  },
  hit: () => {
    noise({ duration: 0.3, gain: 0.16, from: 3000, to: 500 })
    tone(140, { to: 50, duration: 0.35, gain: 0.18 })
  },
  sunk: () => {
    noise({ duration: 0.7, gain: 0.18, from: 2400, to: 120 })
    tone(120, { to: 36, duration: 0.8, gain: 0.2 })
    tone(392, { to: 196, duration: 0.5, gain: 0.07, type: 'sawtooth', delay: 0.15 })
  },
  win: () => {
    tone(523, { duration: 0.16, gain: 0.09, type: 'triangle' })
    tone(659, { duration: 0.16, gain: 0.09, type: 'triangle', delay: 0.14 })
    tone(784, { duration: 0.3, gain: 0.1, type: 'triangle', delay: 0.28 })
  },
  lose: () => {
    tone(330, { to: 311, duration: 0.25, gain: 0.09, type: 'sawtooth' })
    tone(247, { to: 233, duration: 0.45, gain: 0.09, type: 'sawtooth', delay: 0.22 })
  },
}
