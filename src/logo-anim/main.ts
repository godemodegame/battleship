import { ASTERISK, BASELINE, LETTERS, LETTER_COLOR, LOGO_VIEWBOX, PARENS } from './logo'

/**
 * Slot-machine reveal of the Fhenix wordmark, built as a pure function of the
 * clip time `t`: nothing here reads a wall clock, so scripts/render-logo.mjs can
 * seek to any frame and get the same picture every run.
 *
 * Every reel is a vertical strip of Geist Mono glyphs ending in the real
 * wordmark path, clipped to the letter band and slid upward. The strip only
 * ever stops on the brand geometry, so the final frame is the official logo.
 */

const DURATION = 6.0
/** Vertical pitch between two symbols on a reel, in logo units. */
const CELL = 430
/** Symbols in one loop of a reel; index 0 is the brand glyph it lands on. */
const STRIP = 10
/** Full loops each reel makes before locking. */
const TURNS = 4
/** Reel glyph pool — mono characters that read as "spinning machine". */
const POOL = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#@$%&*+=<>/\\{}[]?!'

const SVG_NS = 'http://www.w3.org/2000/svg'
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, x: number) => a + (b - a) * x
const smooth = (x: number) => {
  const k = clamp01(x)
  return k * k * (3 - 2 * k)
}
const easeOutBack = (x: number) => {
  const c1 = 1.9
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

/**
 * Slot velocity profile: wind up, hold a flat spin, brake into the stop, then
 * a small settle bounce past the detent. Expressed as travelled fraction of the
 * total spin so it stays a closed form (no integration between frames).
 */
const ACCEL = 0.12
const BRAKE = 0.36
const PEAK = 1 / (1 - ACCEL / 2 - BRAKE / 2)
const SETTLE = 0.26

function spinTravel(t: number, lock: number): number {
  const x = (t - SPIN_START) / (lock - SPIN_START)
  if (x <= 0) return 0
  if (x >= 1) {
    const s = (t - lock) / SETTLE
    if (s >= 1) return 1
    return 1 + 0.02 * Math.sin(Math.PI * s) * (1 - s)
  }
  if (x < ACCEL) return (PEAK * x * x) / (2 * ACCEL)
  if (x < 1 - BRAKE) return PEAK * (ACCEL / 2 + (x - ACCEL))
  const u = (x - (1 - BRAKE)) / BRAKE
  return PEAK * (ACCEL / 2 + (1 - BRAKE - ACCEL) + BRAKE * (u - (u * u) / 2))
}

function rng(seed: number) {
  let state = seed >>> 0 || 7
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 100000) / 100000
  }
}

/** Reel i starts spinning immediately and locks left to right. */
const SPIN_START = 0.18
const LOCK_FIRST = 1.55
const LOCK_STEP = 0.34
const lockTime = (i: number) => LOCK_FIRST + i * LOCK_STEP
const LAST_LOCK = lockTime(LETTERS.length - 1)

const ASTERISK_IN = LAST_LOCK + 0.18
const PARENS_IN = LAST_LOCK + 0.42
const SHINE_START = LAST_LOCK + 0.75

interface Reel {
  group: SVGGElement
  blur: SVGFEGaussianBlurElement
  lock: number
}

const reels: Reel[] = []
let asterisk: SVGGElement
let parenLeft: SVGGElement
let parenRight: SVGGElement
let shine: SVGGElement
let shineBand: SVGGElement
let glow: SVGCircleElement
let stage: HTMLElement

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  return node
}

function build() {
  stage = document.getElementById('stage')!
  const random = rng(20260728)

  const svg = el('svg', {
    // Padded so reel overshoot and the glow never clip at the frame edge.
    viewBox: `-120 -220 ${LOGO_VIEWBOX.width + 240} ${LOGO_VIEWBOX.height + 440}`,
    width: '100%',
    height: '100%',
  })

  const defs = el('defs')
  glow = el('circle', {
    cx: LOGO_VIEWBOX.width / 2,
    cy: LOGO_VIEWBOX.height / 2,
    r: 780,
    fill: 'url(#bg-glow)',
    opacity: 0,
  })

  const radial = el('radialGradient', { id: 'bg-glow' })
  radial.append(
    el('stop', { offset: '0%', 'stop-color': '#0AD9DC', 'stop-opacity': '0.07' }),
    el('stop', { offset: '100%', 'stop-color': '#0AD9DC', 'stop-opacity': '0' }),
  )
  defs.append(radial)

  // One clip + one motion-blur filter per reel.
  LETTERS.forEach((glyph, i) => {
    const clip = el('clipPath', { id: `clip-${i}` })
    clip.append(
      el('rect', {
        x: glyph.center - 105,
        y: -8,
        width: 210,
        height: 262,
      }),
    )
    defs.append(clip)

    const filter = el('filter', {
      id: `blur-${i}`,
      x: '-60%',
      y: '-60%',
      width: '220%',
      height: '220%',
    })
    const blur = el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '0 0' })
    filter.append(blur)
    defs.append(filter)
  })
  svg.append(defs, glow)

  // Reels.
  LETTERS.forEach((glyph, i) => {
    const holder = el('g', { 'clip-path': `url(#clip-${i})` })
    const group = el('g', { filter: `url(#blur-${i})` })

    const loop = Array.from({ length: STRIP }, () => POOL[Math.floor(random() * POOL.length)])
    for (let k = 0; k < STRIP * 2; k++) {
      const slot = k % STRIP
      const offset = k * CELL
      if (slot === 0) {
        // Detent symbol: the real wordmark path, so the reel can only ever
        // come to rest on the brand geometry.
        const final = el('g', { transform: `translate(0 ${offset})` })
        final.append(el('path', { d: glyph.d, fill: LETTER_COLOR }))
        group.append(final)
        continue
      }
      const text = el('text', {
        x: glyph.center,
        y: BASELINE + offset,
        fill: LETTER_COLOR,
        'text-anchor': 'middle',
        'font-family': 'GeistMono',
        'font-weight': '700',
        'font-size': '296',
      })
      text.textContent = loop[slot]
      group.append(text)
    }

    holder.append(group)
    svg.append(holder)
    reels.push({
      group,
      blur: defs.querySelector(`#blur-${i} feGaussianBlur`) as SVGFEGaussianBlurElement,
      lock: lockTime(i),
    })
  })

  asterisk = el('g', { opacity: 0 })
  asterisk.append(el('path', { d: ASTERISK.d, fill: ASTERISK.color }))
  svg.append(asterisk)

  parenLeft = el('g', { opacity: 0 })
  parenLeft.append(el('path', { d: PARENS.left, fill: PARENS.color }))
  parenRight = el('g', { opacity: 0 })
  parenRight.append(el('path', { d: PARENS.right, fill: PARENS.color }))
  svg.append(parenLeft, parenRight)

  // Specular sweep, masked to the wordmark so it only lights the glyphs.
  const mask = el('mask', {
    id: 'word-mask',
    maskUnits: 'userSpaceOnUse',
    x: -200,
    y: -200,
    width: LOGO_VIEWBOX.width + 400,
    height: LOGO_VIEWBOX.height + 400,
  })
  for (const glyph of LETTERS) mask.append(el('path', { d: glyph.d, fill: '#fff' }))
  mask.append(el('path', { d: ASTERISK.d, fill: '#fff' }))
  defs.append(mask)

  const shineGradient = el('linearGradient', {
    id: 'shine',
    x1: '0',
    y1: '0',
    x2: '1',
    y2: '0',
  })
  shineGradient.append(
    el('stop', { offset: '0%', 'stop-color': '#0AD9DC', 'stop-opacity': '0' }),
    el('stop', { offset: '42%', 'stop-color': '#0AD9DC', 'stop-opacity': '0.95' }),
    el('stop', { offset: '58%', 'stop-color': '#0AD9DC', 'stop-opacity': '0.95' }),
    el('stop', { offset: '100%', 'stop-color': '#0AD9DC', 'stop-opacity': '0' }),
  )
  defs.append(shineGradient)

  // The mask lives on the outer group and must stay untransformed: a mask is
  // resolved in the element's own coordinate system, so moving the masked group
  // would drag the mask along with it. Only the inner band travels.
  shine = el('g', { mask: 'url(#word-mask)', opacity: 0 })
  shineBand = el('g')
  shineBand.append(
    el('rect', {
      x: -520,
      y: -60,
      width: 440,
      height: LOGO_VIEWBOX.height + 120,
      fill: 'url(#shine)',
    }),
  )
  shine.append(shineBand)
  svg.append(shine)

  stage.append(svg)
}

/** Reel offset in logo units, wrapped into one loop of the strip. */
const LOOP = STRIP * CELL
function reelOffset(t: number, lock: number): number {
  const travelled = spinTravel(t, lock) * TURNS * LOOP
  return travelled - Math.floor(travelled / LOOP) * LOOP
}

function seek(t: number) {
  const time = Math.min(Math.max(t, 0), DURATION)

  for (const reel of reels) {
    const offset = reelOffset(time, reel.lock)
    reel.group.setAttribute('transform', `translate(0 ${-offset})`)
    // Shutter smear from the un-wrapped travel, so the seam never spikes it.
    const step = 1 / 90
    const speed =
      Math.abs(spinTravel(time, reel.lock) - spinTravel(time - step, reel.lock)) *
      TURNS *
      LOOP /
      step
    reel.blur.setAttribute('stdDeviation', `0 ${Math.min(22, speed * 0.0016).toFixed(2)}`)
    reel.group.setAttribute('opacity', String(time < SPIN_START ? smooth(time / SPIN_START) : 1))
  }

  // Asterisk spins in like the last reel snapping home.
  const aStep = smooth((time - ASTERISK_IN) / 0.42)
  const aScale = 0.25 + 0.75 * easeOutBack(clamp01((time - ASTERISK_IN) / 0.42))
  asterisk.setAttribute('opacity', String(aStep))
  asterisk.setAttribute(
    'transform',
    `translate(${ASTERISK.center.x} ${ASTERISK.center.y}) rotate(${lerp(-220, 0, aStep)}) scale(${aScale}) translate(${-ASTERISK.center.x} ${-ASTERISK.center.y})`,
  )

  // Brackets close in from the sides.
  const pStep = smooth((time - PARENS_IN) / 0.5)
  const slide = lerp(120, 0, easeOutBack(clamp01((time - PARENS_IN) / 0.5)))
  parenLeft.setAttribute('opacity', String(pStep))
  parenLeft.setAttribute('transform', `translate(${-slide} 0)`)
  parenRight.setAttribute('opacity', String(pStep))
  parenRight.setAttribute('transform', `translate(${slide} 0)`)

  // Specular sweep across the finished wordmark.
  const sStep = clamp01((time - SHINE_START) / 1.15)
  shine.setAttribute('opacity', String(sStep > 0 && sStep < 1 ? 1 : 0))
  shineBand.setAttribute('transform', `translate(${lerp(0, 2400, sStep)} 0)`)

  glow.setAttribute('opacity', String(smooth((time - PARENS_IN) / 1.2) * 0.9))

  // Short fade up from black at the head of the clip.
  stage.style.opacity = String(smooth(time / 0.22))
}

build()
window.__seek = seek
window.__duration = DURATION
seek(0)
window.__ready = true
