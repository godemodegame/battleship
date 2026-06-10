import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { EffectSpec, ProjectileSpec } from '../practice/practiceStore'
import { useStore } from '../practice/practiceStore'
import { BOARD_SIZE } from '../game/constants'
import { cellPosition, useNormalizedModel } from './models'

const VFX_URL = {
  hit: '/models/vfx-hit-impact.glb',
  miss: '/models/vfx-miss-water-plume.glb',
  sunk: '/models/vfx-sunk-wreck-marker.glb',
} as const

const VFX_SCALE = { hit: 2.3, miss: 2.0, sunk: 1.9 } as const
const VFX_LIGHT = { hit: '#FF3B30', miss: '#6fd9ff', sunk: '#FF2EA6' } as const
const VFX_LIGHT_PEAK = { hit: 26, miss: 12, sunk: 30 } as const

export function preloadVfx() {
  for (const url of Object.values(VFX_URL)) useGLTF.preload(url)
}

/**
 * Plays one baked `play` clip at a board cell. Geometry animation comes from
 * the GLB; opacity fade-out is driven here at runtime (core glTF cannot
 * animate opacity — see vfx-app/README.md).
 */
function VfxInstance({ spec, position }: { spec: EffectSpec; position: THREE.Vector3 }) {
  const removeEffect = useStore((s) => s.removeEffect)
  const { scene, animations } = useGLTF(VFX_URL[spec.kind])

  const { clone, materials } = useMemo(() => {
    const clone = scene.clone(true)
    const materials: { material: THREE.Material & { opacity: number }; base: number }[] = []
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mesh.material = (Array.isArray(mesh.material) ? list.map((m) => m.clone()) : list[0].clone()) as
        | THREE.Material
        | THREE.Material[]
      const cloned = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of cloned) {
        m.transparent = true
        m.depthWrite = false
        materials.push({ material: m as THREE.Material & { opacity: number }, base: (m as THREE.MeshStandardMaterial).opacity ?? 1 })
      }
    })
    return { clone, materials }
  }, [scene])

  const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone])
  const duration = animations[0]?.duration ?? 1

  useEffect(() => {
    const action = mixer.clipAction(animations[0])
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
  }, [mixer, animations])

  const done = useRef(false)
  const light = useRef<THREE.PointLight>(null)
  useFrame((_, dt) => {
    mixer.update(dt)
    const t = mixer.time / duration
    const fade = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3)
    for (const { material, base } of materials) material.opacity = base * fade
    if (light.current) {
      // Sharp flash that decays over the first third of the clip.
      const flash = Math.max(0, 1 - t / 0.35)
      light.current.intensity = VFX_LIGHT_PEAK[spec.kind] * flash * flash
    }
    if (t >= 1.02 && !done.current) {
      done.current = true
      removeEffect(spec.id)
    }
  })

  return (
    <group position={position}>
      <primitive object={clone} scale={VFX_SCALE[spec.kind]} />
      <pointLight ref={light} color={VFX_LIGHT[spec.kind]} intensity={0} distance={6} position-y={0.6} />
    </group>
  )
}

/** Glowing shell arcing from the firing board onto the target cell. */
function Projectile({ spec, from, to }: { spec: ProjectileSpec; from: THREE.Vector3; to: THREE.Vector3 }) {
  const model = useNormalizedModel('attack-projectile', 0.6)
  const group = useRef<THREE.Group>(null)
  const start = useRef<number | null>(null)
  const curve = useMemo(() => {
    const peak = from.clone().lerp(to, 0.5)
    peak.y = 4.6
    return new THREE.QuadraticBezierCurve3(from, peak, to)
  }, [from, to])

  useFrame(({ clock }) => {
    if (!group.current) return
    if (start.current === null) start.current = clock.elapsedTime
    // Matches FLIGHT_MS in the store so impact lands with the projectile.
    const t = Math.min(1, (clock.elapsedTime - start.current) / 0.62)
    const pos = curve.getPoint(t)
    group.current.position.copy(pos)
    const ahead = curve.getPoint(Math.min(1, t + 0.02))
    group.current.lookAt(ahead)
    group.current.visible = t < 1
  })

  return (
    <group ref={group} key={spec.id}>
      {/* normalized hull runs along +X; lookAt aims +Z, so yaw the model */}
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
