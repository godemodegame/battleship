import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import type { EffectSpec, ProjectileSpec } from '../practice/practiceStore'
import { useStore } from '../practice/practiceStore'
import { BOARD_SIZE } from '../game/constants'
import { cellPosition, useNormalizedModel } from './models'

const sequence = (folder: string, name: string, count: number) =>
  Array.from(
    { length: count },
    (_, index) => `/textures/vfx/${folder}/${name}-${String(index + 1).padStart(2, '0')}.webp`,
  )

const HIT_FRAMES = sequence('hit-flash', 'vfx-hit-flash', 6)
const SMOKE_FRAMES = sequence('ink-smoke', 'vfx-ink-smoke', 8)
const MISS_FRAMES = sequence('miss-splash', 'vfx-miss-splash', 8)
const SUNK_BREAK = '/textures/vfx/sunk-state-overlay/vfx-sunk-break-flash.webp'
const SUNK_RESIDUAL = '/textures/vfx/sunk-state-overlay/vfx-sunk-residual-ink.webp'
const IMPACT_CRACK = '/textures/vfx/shockwave-and-crack-decals/vfx-impact-crack-decal.webp'
const SHOCKWAVE = '/textures/vfx/shockwave-and-crack-decals/vfx-shockwave-ring.webp'
const PROJECTILE_TRAIL = '/textures/vfx/vfx-projectile-trail-mask.webp'

const EFFECT_TEXTURES = [
  ...HIT_FRAMES,
  ...SMOKE_FRAMES,
  ...MISS_FRAMES,
  SUNK_BREAK,
  SUNK_RESIDUAL,
  IMPACT_CRACK,
  SHOCKWAVE,
]

const VFX_DURATION = { hit: 0.85, miss: 1, sunk: 1.35 } as const
const VFX_LIGHT = { hit: '#FF3B30', miss: '#6fd9ff', sunk: '#FF2EA6' } as const
const VFX_LIGHT_PEAK = { hit: 26, miss: 12, sunk: 30 } as const

export function preloadVfx() {
  for (const url of [...EFFECT_TEXTURES, PROJECTILE_TRAIL]) useTexture.preload(url)
}

function frameAt(frames: string[], t: number) {
  return frames[Math.min(frames.length - 1, Math.floor(THREE.MathUtils.clamp(t, 0, 0.999) * frames.length))]
}

function setMap(material: THREE.SpriteMaterial | THREE.MeshBasicMaterial | null, texture: THREE.Texture | undefined) {
  if (!material || !texture || material.map === texture) return
  material.map = texture
  material.needsUpdate = true
}

/**
 * Plays generated graphic cards as deliberately stepped animation. The main
 * card faces the camera while the crack/ring layer lies on the board surface.
 */
function VfxInstance({ spec, position }: { spec: EffectSpec; position: THREE.Vector3 }) {
  const removeEffect = useStore((s) => s.removeEffect)
  const loaded = useTexture(EFFECT_TEXTURES)
  const textures = useMemo(() => {
    const map = new Map<string, THREE.Texture>()
    EFFECT_TEXTURES.forEach((url, index) => {
      const texture = loaded[index]
      texture.colorSpace = THREE.SRGBColorSpace
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      map.set(url, texture)
    })
    return map
  }, [loaded])

  const elapsed = useRef(0)
  const done = useRef(false)
  const main = useRef<THREE.Sprite>(null)
  const secondary = useRef<THREE.Sprite>(null)
  const mainMaterial = useRef<THREE.SpriteMaterial>(null)
  const secondaryMaterial = useRef<THREE.SpriteMaterial>(null)
  const ground = useRef<THREE.Mesh>(null)
  const groundMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const light = useRef<THREE.PointLight>(null)

  useFrame((_, dt) => {
    const duration = VFX_DURATION[spec.kind]
    elapsed.current += dt
    const t = Math.min(1, elapsed.current / duration)

    if (spec.kind === 'hit') {
      const flashT = Math.min(1, t / 0.62)
      const smokeT = THREE.MathUtils.clamp((t - 0.12) / 0.88, 0, 1)
      setMap(mainMaterial.current, textures.get(frameAt(HIT_FRAMES, flashT)))
      setMap(secondaryMaterial.current, textures.get(frameAt(SMOKE_FRAMES, smokeT)))
      setMap(groundMaterial.current, textures.get(SHOCKWAVE))
      if (main.current) {
        const pop = 0.5 + 0.85 * Math.sin(Math.min(1, flashT / 0.3) * Math.PI * 0.5)
        main.current.scale.set(2.65 * pop, 2.65 * pop, 1)
      }
      if (secondary.current) {
        secondary.current.position.y = 0.35 + smokeT * 0.65
        secondary.current.scale.setScalar(1.25 + smokeT * 0.75)
      }
      if (mainMaterial.current) mainMaterial.current.opacity = 1 - THREE.MathUtils.smoothstep(flashT, 0.7, 1)
      if (secondaryMaterial.current) {
        secondaryMaterial.current.opacity =
          THREE.MathUtils.smoothstep(smokeT, 0, 0.16) * (1 - THREE.MathUtils.smoothstep(smokeT, 0.72, 1))
      }
      if (ground.current) ground.current.scale.setScalar(0.45 + 1.7 * Math.min(1, t / 0.45))
      if (groundMaterial.current) groundMaterial.current.opacity = 0.85 * (1 - THREE.MathUtils.smoothstep(t, 0.25, 0.62))
    } else if (spec.kind === 'miss') {
      setMap(mainMaterial.current, textures.get(frameAt(MISS_FRAMES, t)))
      if (main.current) {
        const pop = 0.65 + 0.55 * Math.sin(Math.min(1, t / 0.35) * Math.PI * 0.5)
        main.current.scale.set(2.2 * pop, 2.2 * pop, 1)
        main.current.position.y = 0.35 + Math.sin(t * Math.PI) * 0.3
      }
      if (mainMaterial.current) mainMaterial.current.opacity = 1 - THREE.MathUtils.smoothstep(t, 0.78, 1)
      if (secondary.current) secondary.current.visible = false
      if (ground.current) ground.current.visible = false
    } else {
      setMap(mainMaterial.current, textures.get(SUNK_BREAK))
      setMap(secondaryMaterial.current, textures.get(SMOKE_FRAMES[Math.min(7, Math.floor(t * 8))]))
      setMap(groundMaterial.current, textures.get(t < 0.42 ? IMPACT_CRACK : SUNK_RESIDUAL))
      if (main.current) {
        const pop = 0.65 + 0.65 * Math.sin(Math.min(1, t / 0.25) * Math.PI * 0.5)
        main.current.scale.set(3 * pop, 2 * pop, 1)
      }
      if (secondary.current) {
        secondary.current.position.y = 0.3 + t * 0.75
        secondary.current.scale.setScalar(1.35 + t * 0.85)
      }
      if (mainMaterial.current) mainMaterial.current.opacity = 1 - THREE.MathUtils.smoothstep(t, 0.28, 0.58)
      if (secondaryMaterial.current) secondaryMaterial.current.opacity = 0.8 * (1 - THREE.MathUtils.smoothstep(t, 0.72, 1))
      if (ground.current) ground.current.scale.setScalar(1.25 + t * 0.35)
      if (groundMaterial.current) groundMaterial.current.opacity = 0.95 * (1 - THREE.MathUtils.smoothstep(t, 0.82, 1))
    }

    if (light.current) {
      const flash = Math.max(0, 1 - t / 0.35)
      light.current.intensity = VFX_LIGHT_PEAK[spec.kind] * flash * flash
    }
    if (t >= 1 && !done.current) {
      done.current = true
      removeEffect(spec.id)
    }
  })

  return (
    <group position={position}>
      <sprite ref={main} position-y={0.65} renderOrder={21}>
        <spriteMaterial
          ref={mainMaterial}
          transparent
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={secondary} position-y={0.45} renderOrder={20}>
        <spriteMaterial
          ref={secondaryMaterial}
          transparent
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </sprite>
      <mesh ref={ground} rotation-x={-Math.PI / 2} position-y={0.025} renderOrder={19}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={groundMaterial}
          transparent
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <pointLight ref={light} color={VFX_LIGHT[spec.kind]} intensity={0} distance={6} position-y={0.6} />
    </group>
  )
}

/** Glowing shell arcing from the firing board onto the target cell. */
function Projectile({ spec, from, to }: { spec: ProjectileSpec; from: THREE.Vector3; to: THREE.Vector3 }) {
  const model = useNormalizedModel('attack-projectile', 0.6)
  const trailTexture = useTexture(PROJECTILE_TRAIL)
  const group = useRef<THREE.Group>(null)
  const trail = useRef<THREE.Sprite>(null)
  const trailMaterial = useRef<THREE.SpriteMaterial>(null)
  const start = useRef<number | null>(null)
  const curve = useMemo(() => {
    const peak = from.clone().lerp(to, 0.5)
    peak.y = 4.6
    return new THREE.QuadraticBezierCurve3(from, peak, to)
  }, [from, to])

  useMemo(() => {
    trailTexture.colorSpace = THREE.SRGBColorSpace
    trailTexture.minFilter = THREE.LinearFilter
    trailTexture.magFilter = THREE.LinearFilter
  }, [trailTexture])

  useFrame(({ clock, camera }) => {
    if (!group.current) return
    if (start.current === null) start.current = clock.elapsedTime
    const t = Math.min(1, (clock.elapsedTime - start.current) / 0.62)
    const pos = curve.getPoint(t)
    group.current.position.copy(pos)
    const ahead = curve.getPoint(Math.min(1, t + 0.02))
    group.current.lookAt(ahead)
    group.current.visible = t < 1

    if (trailMaterial.current) {
      const screenPos = pos.clone().project(camera)
      const screenAhead = ahead.clone().project(camera)
      trailMaterial.current.rotation = Math.atan2(screenAhead.y - screenPos.y, screenAhead.x - screenPos.x)
      trailMaterial.current.opacity = Math.sin(t * Math.PI) * 0.95
    }
    if (trail.current) {
      const pulse = 0.9 + Math.sin(t * Math.PI * 8) * 0.08
      trail.current.scale.set(4.2 * pulse, 1.35 * pulse, 1)
    }
  })

  return (
    <group ref={group} key={spec.id}>
      <sprite ref={trail} renderOrder={18}>
        <spriteMaterial
          ref={trailMaterial}
          map={trailTexture}
          transparent
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </sprite>
      <group rotation-y={-Math.PI / 2}>
        <primitive object={model} />
      </group>
      <pointLight color="#FFB000" intensity={6} distance={4.5} />
      <mesh>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color="#FFD27A" transparent opacity={0.8} />
      </mesh>
    </group>
  )
}

interface FxLayerProps {
  /** World position of each side's board center. */
  boardCenters: { player: THREE.Vector3; bot: THREE.Vector3 }
}

export function FxLayer({ boardCenters }: FxLayerProps) {
  const effects = useStore((s) => s.effects)
  const projectiles = useStore((s) => s.projectiles)

  const cellWorld = (board: 'player' | 'bot', cell: number, y: number) => {
    const [x, z] = cellPosition(Math.floor(cell / BOARD_SIZE), cell % BOARD_SIZE)
    const base = boardCenters[board]
    return new THREE.Vector3(base.x + x, y, base.z + z)
  }

  return (
    <group>
      {effects.map((spec) => (
        <VfxInstance key={spec.id} spec={spec} position={cellWorld(spec.board, spec.cell, 0.08)} />
      ))}
      {projectiles.map((spec) => {
        const targetBoard = spec.from === 'player' ? 'bot' : 'player'
        const origin = boardCenters[spec.from].clone().setY(0.5)
        return (
          <Projectile
            key={spec.id}
            spec={spec}
            from={origin}
            to={cellWorld(targetBoard, spec.cell, 0.12)}
          />
        )
      })}
    </group>
  )
}
