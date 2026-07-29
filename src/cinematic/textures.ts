import * as THREE from 'three'

/**
 * Procedurally generated sprite maps for the cinematic. The game's VFX sheets
 * are deliberately comic-styled (flat green/blue flashes), which reads wrong in
 * a photographic night shot, so fire, smoke and the shockwave are built here as
 * plain radial fields instead. Everything is deterministic: same bytes on every
 * run, which the frame-accurate renderer depends on.
 */

/** Small xorshift so puff shapes are varied but reproducible. */
function rng(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 100000) / 100000
  }
}

function toTexture(data: Uint8Array<ArrayBuffer>, size: number): THREE.Texture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

let glow: THREE.Texture | null = null

/** Soft additive point of light — flame, fireball core, sparks. */
export function glowTexture(): THREE.Texture {
  if (glow) return glow
  const size = 128
  const data = new Uint8Array(new ArrayBuffer(size * size * 4))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5
      const dy = (y + 0.5) / size - 0.5
      const r = Math.min(1, Math.hypot(dx, dy) * 2)
      const falloff = Math.pow(1 - r, 2.6)
      const core = Math.pow(Math.max(0, 1 - r * 2.4), 3) * 0.9
      const i = (y * size + x) * 4
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = Math.round(Math.min(1, falloff + core) * 255)
    }
  }
  glow = toTexture(data, size)
  return glow
}

const puffCache = new Map<number, THREE.Texture>()

/** Billowing smoke blob: a handful of overlapping lobes under a radial mask. */
export function puffTexture(seed: number): THREE.Texture {
  const cached = puffCache.get(seed)
  if (cached) return cached

  const size = 128
  const random = rng(seed * 2654435761)
  const lobes = Array.from({ length: 11 }, () => ({
    x: 0.5 + (random() - 0.5) * 0.46,
    y: 0.5 + (random() - 0.5) * 0.46,
    r: 0.14 + random() * 0.2,
  }))

  const data = new Uint8Array(new ArrayBuffer(size * size * 4))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      let alpha = 0
      for (const lobe of lobes) {
        const d = Math.hypot(u - lobe.x, v - lobe.y) / lobe.r
        if (d < 1) alpha += Math.pow(1 - d, 2) * 0.42
      }
      // Trim to a circle so sprite corners never show a hard edge.
      const mask = Math.pow(Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) * 2), 1.5)
      const i = (y * size + x) * 4
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = Math.round(Math.min(1, alpha) * mask * 255)
    }
  }

  const texture = toTexture(data, size)
  puffCache.set(seed, texture)
  return texture
}

let ring: THREE.Texture | null = null

/** Thin expanding shockwave annulus with a soft inner wash. */
export function ringTexture(): THREE.Texture {
  if (ring) return ring
  const size = 256
  const data = new Uint8Array(new ArrayBuffer(size * size * 4))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5
      const dy = (y + 0.5) / size - 0.5
      const r = Math.hypot(dx, dy) * 2
      const band = Math.exp(-Math.pow((r - 0.82) / 0.052, 2))
      const wash = r < 0.82 ? Math.pow(r / 0.82, 5) * 0.22 : 0
      const i = (y * size + x) * 4
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = Math.round(Math.min(1, band + wash) * 255)
    }
  }
  ring = toTexture(data, size)
  return ring
}
