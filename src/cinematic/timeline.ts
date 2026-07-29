import * as THREE from 'three'
import type { ShipClassId } from '../game/types'

/**
 * Pure, time-addressable choreography for the missile-strike clip. Every value
 * is a function of the absolute clip time `t`, so the offline renderer can seek
 * to any frame and get a bit-identical result (see scripts/render-cinematic.mjs).
 */

export const DURATION = 5.0
/** Second at which the warhead reaches the hull. */
export const IMPACT_T = 3.5
const FADE_IN = 0.45
const FADE_OUT = 0.55

export const CINEMATIC_SHIPS = ['carrier', 'battleship', 'destroyer'] as const
export type CinematicShip = (typeof CINEMATIC_SHIPS)[number]

/** Hull footprint per class, tuned so all three read at the same camera distance. */
export const HULL_SIZE: Record<ShipClassId, { length: number; height: number }> = {
  'carrier': { length: 11.5, height: 2.9 },
  'battleship': { length: 9.2, height: 2.6 },
  'cruiser': { length: 8.2, height: 2.3 },
  'destroyer': { length: 7.6, height: 2.2 },
  'submarine': { length: 7.0, height: 1.6 },
  'patrol-boat': { length: 5.4, height: 1.5 },
}

/**
 * Formation slots in world space. Slot 0 always holds the ship being hit, so
 * the camera move is identical across the three renders; the other two hulls
 * only give the shot scale and depth.
 */
export const SHIP_SLOTS: { position: [number, number, number]; rotationY: number }[] = [
  { position: [0, -0.1, 0], rotationY: 0.16 },
  { position: [21, -0.1, -14], rotationY: -0.48 },
  { position: [-17, -0.1, 13.5], rotationY: 0.62 },
]

/** Where the warhead meets the hull (flank, just under the superstructure). */
export const IMPACT_POINT = new THREE.Vector3(0.8, 1.15, 0.55)

export const FLIGHT = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(-47, 9.6, -32),
    new THREE.Vector3(-35, 7.4, -24),
    new THREE.Vector3(-24.5, 5.6, -17),
    new THREE.Vector3(-15, 4.0, -10.6),
    new THREE.Vector3(-8.2, 2.8, -5.4),
    new THREE.Vector3(-3.4, 1.75, -1.7),
    IMPACT_POINT.clone(),
  ],
  false,
  'catmullrom',
  0.28,
)

const UP = new THREE.Vector3(0, 1, 0)
const smooth = (x: number, a: number, b: number) => THREE.MathUtils.smoothstep(x, a, b)

/** Normalized progress along the flight, eased so the missile bears down at the end. */
export function flightU(t: number): number {
  const x = THREE.MathUtils.clamp(t / IMPACT_T, 0, 1)
  return Math.pow(x, 1.26)
}

/** Clip time at which the missile passes arc-length position `u`. */
export function timeAtU(u: number): number {
  return IMPACT_T * Math.pow(THREE.MathUtils.clamp(u, 0, 1), 1 / 1.26)
}

export function missilePosition(t: number, out = new THREE.Vector3()): THREE.Vector3 {
  return FLIGHT.getPointAt(Math.min(flightU(t), 1), out)
}

export function missileTangent(t: number, out = new THREE.Vector3()): THREE.Vector3 {
  return FLIGHT.getTangentAt(Math.min(flightU(t), 0.999), out).normalize()
}

const scratch = {
  pos: new THREE.Vector3(),
  tan: new THREE.Vector3(),
  side: new THREE.Vector3(),
  ahead: new THREE.Vector3(),
}

export interface CameraPose {
  position: THREE.Vector3
  target: THREE.Vector3
  fov: number
  /** Damping constant for the rig; 0 means the pose is used as-is. */
  damping: number
}

const pose: CameraPose = {
  position: new THREE.Vector3(),
  target: new THREE.Vector3(),
  fov: 34,
  damping: 0.28,
}

/** Horizontal run-in direction and the axis perpendicular to it. */
const APPROACH = new THREE.Vector3()
  .subVectors(IMPACT_POINT, FLIGHT.getPointAt(0))
  .setY(0)
  .normalize()
const PERP = new THREE.Vector3(-APPROACH.z, 0, APPROACH.x)

export const CAMERA_ANGLES = ['chase', 'broadside', 'missilecam', 'deck'] as const
export type CameraAngle = (typeof CAMERA_ANGLES)[number]

/** How hard the impact kick hits, per angle — closer cameras get shaken more. */
export const SHAKE_GAIN: Record<CameraAngle, number> = {
  chase: 1,
  broadside: 0.45,
  missilecam: 0.9,
  deck: 1.8,
}

/**
 * Undamped chase pose: sits behind and slightly above the warhead, then slides
 * off-axis on the final approach so the hull and the missile share the frame.
 * The rig damps toward this, which is what gives the move its weight.
 */
function chaseCamera(t: number): CameraPose {
  const x = THREE.MathUtils.clamp(t / IMPACT_T, 0, 1)
  const pos = missilePosition(Math.min(t, IMPACT_T), scratch.pos)
  const tan = missileTangent(Math.min(t, IMPACT_T), scratch.tan)
  const side = scratch.side.crossVectors(tan, UP).normalize()

  const back = THREE.MathUtils.lerp(5.0, 5.4, smooth(x, 0.35, 1))
  const lift = THREE.MathUtils.lerp(1.5, 1.35, smooth(x, 0.2, 1))
  const lateral = smooth(x, 0.45, 1) * 4.4

  pose.position
    .copy(pos)
    .addScaledVector(tan, -back)
    .addScaledVector(UP, lift)
    .addScaledVector(side, lateral)

  // Aim just ahead of the warhead early on, then settle onto the impact point.
  const ahead = FLIGHT.getPointAt(Math.min(flightU(Math.min(t, IMPACT_T)) + 0.06, 1), scratch.ahead)
  pose.target.copy(ahead).lerp(IMPACT_POINT, smooth(x, 0.45, 1))

  if (t > IMPACT_T) {
    // Aftermath: ease up and back off the burning hull while the smoke rises.
    const a = t - IMPACT_T
    const drift = smooth(a, 0, 1.5)
    pose.position
      .addScaledVector(side, drift * 2.2)
      .addScaledVector(UP, drift * 4.0)
      .addScaledVector(tan, -drift * 10.5)
    pose.target.y += drift * 1.4
  }

  // A short punch-in on the detonation, released over the tail of the shot.
  const punch = t < IMPACT_T ? 0 : Math.max(0, 1 - (t - IMPACT_T) / 1.1)
  pose.fov = 34 - 3.4 * punch * punch
  pose.damping = 0.28

  return pose
}

/**
 * Long-lens broadside: a slow dolly-in from off the target's flank, panning
 * with the missile until it locks onto the hull. Reads as a shot filmed from
 * another vessel rather than a camera bolted to the weapon.
 */
function broadsideCamera(t: number): CameraPose {
  const x = THREE.MathUtils.clamp(t / IMPACT_T, 0, 1)
  const after = Math.max(0, t - IMPACT_T)

  const dolly = THREE.MathUtils.lerp(27, 20, smooth(x, 0, 1)) + smooth(after, 0, 1.5) * 3.5
  const lift = 4.7 - smooth(x, 0.1, 1) * 1.3 + smooth(after, 0, 1.5) * 2.6

  pose.position
    .copy(IMPACT_POINT)
    .addScaledVector(PERP, dolly)
    .addScaledVector(UP, lift)
  // Barely-there operator drift so the long lens does not feel locked off.
  pose.position.x += Math.sin(t * 0.62) * 0.16
  pose.position.y += Math.sin(t * 0.47 + 1.2) * 0.11

  const missile = missilePosition(Math.min(t, IMPACT_T), scratch.pos)
  pose.target.copy(missile).lerp(IMPACT_POINT, smooth(x, 0.12, 0.72))
  pose.target.y += smooth(after, 0, 1.5) * 1.6

  // Opens up slightly after the hit so the fire and smoke stay inside frame.
  pose.fov = 21 + smooth(after, 0.1, 1.4) * 6
  pose.damping = 0.5
  return pose
}

/**
 * Warhead POV: the camera rides on the missile's shoulder, then cuts on impact
 * to a wide reaction angle — the classic weapon-cam grammar.
 */
function missileCamCamera(t: number): CameraPose {
  if (t < IMPACT_T) {
    const position = missilePosition(t, scratch.pos)
    const tan = missileTangent(t, scratch.tan)
    const side = scratch.side.crossVectors(tan, UP).normalize()
    pose.position
      .copy(position)
      .addScaledVector(side, 0.62)
      .addScaledVector(UP, 0.3)
      .addScaledVector(tan, -0.15)
    // Airframe buffet, growing as the missile accelerates.
    const buffet = 0.012 + 0.03 * smooth(t / IMPACT_T, 0.3, 1)
    pose.position.x += Math.sin(t * 23.7) * buffet
    pose.position.y += Math.sin(t * 19.1 + 0.9) * buffet

    const ahead = FLIGHT.getPointAt(Math.min(flightU(t) + 0.05, 1), scratch.ahead)
    pose.target.copy(ahead).lerp(IMPACT_POINT, smooth(t / IMPACT_T, 0.3, 0.9))
    pose.fov = 46
    pose.damping = 0
    return pose
  }

  // Hard cut on detonation to a wide, slowly retreating angle.
  const a = t - IMPACT_T
  const pull = smooth(a, 0, 1.5)
  pose.position
    .copy(IMPACT_POINT)
    .addScaledVector(PERP, -11 - pull * 5)
    .addScaledVector(APPROACH, 6 + pull * 3)
    .addScaledVector(UP, 6.5 + pull * 3.4)
  pose.target.copy(IMPACT_POINT)
  pose.target.y += 0.6 + pull * 1.8
  pose.fov = 33
  pose.damping = 0
  return pose
}

/**
 * Defender's angle: parked above the target's deck looking back down the
 * missile's run-in, so the warhead comes straight at the lens.
 */
function deckCamera(t: number): CameraPose {
  const after = Math.max(0, t - IMPACT_T)

  pose.position
    .copy(IMPACT_POINT)
    .addScaledVector(APPROACH, 7.4)
    .addScaledVector(PERP, -1.6)
    .addScaledVector(UP, 2.5 + smooth(after, 0.2, 1.6) * 2.2)
  // Rides the same swell the hulls do.
  pose.position.y += Math.sin(t * 0.55) * 0.07
  pose.position.x += Math.sin(t * 0.42 + 0.6) * 0.05

  const missile = missilePosition(Math.min(t, IMPACT_T), scratch.pos)
  pose.target.copy(missile).lerp(IMPACT_POINT, smooth(t / IMPACT_T, 0.55, 1))
  pose.target.y += smooth(after, 0.2, 1.8) * 1.5

  pose.fov = 42 - smooth(after, 0, 0.5) * 4
  pose.damping = 0.22
  return pose
}

export function desiredCamera(t: number, angle: CameraAngle = 'chase'): CameraPose {
  switch (angle) {
    case 'broadside':
      return broadsideCamera(t)
    case 'missilecam':
      return missileCamCamera(t)
    case 'deck':
      return deckCamera(t)
    default:
      return chaseCamera(t)
  }
}

/** Decaying handheld kick applied on top of the damped camera position. */
export function cameraShake(t: number, gain = 1, out = new THREE.Vector3()): THREE.Vector3 {
  if (t < IMPACT_T) return out.set(0, 0, 0)
  const a = t - IMPACT_T
  const decay = Math.max(0, 1 - a / 0.5)
  // Kept slow on purpose: at the 90fps capture rate a faster kick smears into
  // a double exposure once the shutter blur is folded down to 30fps.
  const amp = 0.24 * gain * decay * decay
  return out.set(
    Math.sin(a * 24.7) * amp,
    Math.sin(a * 18.3 + 1.7) * amp * 0.8,
    Math.sin(a * 21.1 + 3.1) * amp * 0.5,
  )
}

/** 0 = clear frame, 1 = black. Handles both the fade in and the fade out. */
export function fadeAmount(t: number): number {
  const fadeIn = 1 - smooth(t, 0, FADE_IN)
  const fadeOut = smooth(t, DURATION - FADE_OUT, DURATION)
  return Math.max(fadeIn, fadeOut)
}
