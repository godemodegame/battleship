import * as THREE from 'three'
import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useFBX } from '@react-three/drei'
import { BOARD_SIZE, cellIndex } from '../game/constants'
import { haptics } from '../lib/haptics'
import type { CellShot } from '../game/types'
import { CELL, cellPosition } from './models'

const COLORS = {
  tile: new THREE.Color('#101622'),
  tileAlt: new THREE.Color('#16242A'),
  grid: new THREE.Color('#21F4FF'),
  miss: new THREE.Color('#9fd8e8'),
  hit: new THREE.Color('#FF3B30'),
  sunk: new THREE.Color('#FF2EA6'),
  select: new THREE.Color('#FFB000'),
  dim: new THREE.Color('#0a0e16'),
}

/** Flat instanced tiles under everything; per-cell tint encodes shot state. */
function Tiles({ shots, dimmed }: { shots: ReadonlyArray<CellShot>; dimmed?: ReadonlySet<number> }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    for (let cell = 0; cell < 100; cell++) {
      const row = Math.floor(cell / BOARD_SIZE)
      const col = cell % BOARD_SIZE
      const [x, z] = cellPosition(row, col)
      m.setPosition(x, 0, z)
      mesh.setMatrixAt(cell, m)
      const checker = (row + col) % 2 === 0
      const color =
        shots[cell] === 1 ? COLORS.dim
        : shots[cell] === 3 ? COLORS.dim
        : dimmed?.has(cell) ? COLORS.dim
        : checker ? COLORS.tile : COLORS.tileAlt
      mesh.setColorAt(cell, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [shots, dimmed])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 100]} receiveShadow>
      <boxGeometry args={[CELL * 0.94, 0.06, CELL * 0.94]} />
      <meshStandardMaterial roughness={0.35} metalness={0.4} color="#ffffff" />
    </instancedMesh>
  )
}

/**
 * Sealed holographic caps on unattacked enemy cells, instanced from the
 * hidden-enemy-grid-cell model geometry; revealed cells collapse to zero.
 */
function SealedCells({ shots }: { shots: ReadonlyArray<CellShot> }) {
  const fbx = useFBX('/models/hidden-enemy-grid-cell.fbx')
  const ref = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => {
    let geo: THREE.BufferGeometry | null = null
    fbx.updateWorldMatrix(true, true)
    fbx.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!geo && mesh.isMesh) {
        geo = mesh.geometry.clone()
        geo.applyMatrix4(mesh.matrixWorld)
      }
    })
    if (!geo) return new THREE.BoxGeometry(CELL * 0.82, 0.12, CELL * 0.82)
    const g = geo as THREE.BufferGeometry
    g.computeBoundingBox()
    const size = g.boundingBox!.getSize(new THREE.Vector3())
    const center = g.boundingBox!.getCenter(new THREE.Vector3())
    g.translate(-center.x, -g.boundingBox!.min.y, -center.z)
    const s = (CELL * 0.84) / Math.max(size.x, size.z)
    g.scale(s, Math.min(s, 0.22 / size.y), s)
    return g
  }, [fbx])

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
    for (let cell = 0; cell < 100; cell++) {
      if (shots[cell] !== 0) {
        mesh.setMatrixAt(cell, hidden)
        continue
      }
      const [x, z] = cellPosition(Math.floor(cell / BOARD_SIZE), cell % BOARD_SIZE)
      m.identity().setPosition(x, 0.035, z)
      mesh.setMatrixAt(cell, m)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [shots])

  const material = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (material.current) {
      material.current.emissiveIntensity = 0.09 + Math.sin(clock.elapsedTime * 1.7) * 0.035
    }
  })

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, 100]}>
      <meshStandardMaterial
        ref={material}
        color="#0c151f"
        emissive="#21F4FF"
        emissiveIntensity={0.09}
        roughness={0.38}
        metalness={0.95}
        transparent
        opacity={0.94}
      />
    </instancedMesh>
  )
}

function GridLines() {
  const geometry = useMemo(() => {
    const pts: number[] = []
    const half = (BOARD_SIZE * CELL) / 2
    for (let i = 0; i <= BOARD_SIZE; i++) {
      const v = -half + i * CELL
      pts.push(-half, 0.045, v, half, 0.045, v)
      pts.push(v, 0.045, -half, v, 0.045, half)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return geo
  }, [])
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={COLORS.grid} transparent opacity={0.28} />
    </lineSegments>
  )
}

const labelTextureCache = new Map<string, THREE.CanvasTexture>()
function labelTexture(text: string): THREE.CanvasTexture {
  let tex = labelTextureCache.get(text)
  if (tex) return tex
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const g = canvas.getContext('2d')!
  g.font = '600 38px "Segoe UI", system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#9fdbe8'
  g.fillText(text, 32, 34)
  tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 4
  labelTextureCache.set(text, tex)
  return tex
}

function AxisLabels() {
  const letters = 'ABCDEFGHIJ'
  const half = (BOARD_SIZE * CELL) / 2
  const items: { text: string; x: number; z: number }[] = []
  for (let i = 0; i < BOARD_SIZE; i++) {
    items.push({ text: letters[i], x: -half + (i + 0.5) * CELL, z: half + 0.42 })
    items.push({ text: String(i + 1), x: -half - 0.42, z: -half + (i + 0.5) * CELL })
  }
  return (
    <group>
      {items.map(({ text, x, z }) => (
        <mesh key={`${text}-${x}-${z}`} position={[x, 0.05, z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.62, 0.62]} />
          <meshBasicMaterial map={labelTexture(text)} transparent opacity={0.75} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function MissMarker({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.07, z]}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.16, 0.26, 24]} />
        <meshBasicMaterial color={COLORS.miss} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.08, 16]} />
        <meshBasicMaterial color={COLORS.miss} transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  )
}

function HitMarker({ x, z, sunk }: { x: number; z: number; sunk: boolean }) {
  const ref = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.emissiveIntensity = sunk
        ? 1.1 + Math.sin(clock.elapsedTime * 2.2) * 0.25
        : 1.6 + Math.sin(clock.elapsedTime * 5) * 0.5
    }
  })
  return (
    <group position={[x, 0.16, z]}>
      <mesh rotation-y={Math.PI / 4} scale={[1, 0.55, 1]}>
        <octahedronGeometry args={[0.21]} />
        <meshStandardMaterial
          ref={ref}
          color="#220508"
          emissive={sunk ? COLORS.sunk : COLORS.hit}
          emissiveIntensity={1.5}
          roughness={0.3}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.08}>
        <ringGeometry args={[0.3, 0.4, 4]} />
        <meshBasicMaterial
          color={sunk ? COLORS.sunk : COLORS.hit}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

function ShotMarkers({ shots }: { shots: ReadonlyArray<CellShot> }) {
  const markers: JSX.Element[] = []
  for (let cell = 0; cell < shots.length; cell++) {
    if (shots[cell] === 0) continue
    const [x, z] = cellPosition(Math.floor(cell / BOARD_SIZE), cell % BOARD_SIZE)
    if (shots[cell] === 1) markers.push(<MissMarker key={cell} x={x} z={z} />)
    else markers.push(<HitMarker key={cell} x={x} z={z} sunk={shots[cell] === 3} />)
  }
  return <group>{markers}</group>
}

export function SelectionFrame({ cell, color = '#FFB000' }: { cell: number; color?: string }) {
  const ref = useRef<THREE.Group>(null)
  const [x, z] = cellPosition(Math.floor(cell / BOARD_SIZE), cell % BOARD_SIZE)
  useFrame(({ clock }) => {
    if (ref.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 5.5) * 0.06
      ref.current.scale.setScalar(pulse)
    }
  })
  return (
    <group ref={ref} position={[x, 0.09, z]}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.4, 0.5, 4]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.38, 4]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  )
}

interface BoardProps {
  position: [number, number, number]
  shots: ReadonlyArray<CellShot>
  sealed?: boolean
  dimmed?: ReadonlySet<number>
  interactive?: boolean
  onCellTap?: (cell: number) => void
  onCellHover?: (cell: number | null) => void
  children?: React.ReactNode
}

/** One 10x10 tactical board: tiles, grid, labels, markers and tap surface. */
export const Board = memo(function Board({
  position,
  shots,
  sealed,
  dimmed,
  interactive,
  onCellTap,
  onCellHover,
  children,
}: BoardProps) {
  // Taps commit on pointerup so a touch that turns into a scroll/drag (the
  // on-chain placement canvas uses touch-action: pan-y inside a scrollable
  // route) never fires a placement; a real scroll ends in pointercancel and
  // never reaches pointerup with a small delta.
  const tapStart = useRef<{ id: number; x: number; y: number } | null>(null)

  const toCell = (e: ThreeEvent<PointerEvent>): number | null => {
    const local = e.point.clone()
    local.x -= position[0]
    local.z -= position[2]
    const col = Math.floor(local.x / CELL + 5)
    const row = Math.floor(local.z / CELL + 5)
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null
    return cellIndex(row, col)
  }

  return (
    <group position={position}>
      <Tiles shots={shots} dimmed={dimmed} />
      {sealed && <SealedCells shots={shots} />}
      <GridLines />
      <AxisLabels />
      <ShotMarkers shots={shots} />
      {children}
      {interactive && (
        <mesh
          rotation-x={-Math.PI / 2}
          position-y={0.1}
          visible={false}
          onPointerDown={(e) => {
            // Prime audio/haptics as early as possible in the handler that came
            // from a real user pointer event on the 3D board. This is critical
            // for iOS Safari Web Audio unlock + Taptic to work reliably, because
            // r3f synthetic events can be slightly removed from the original
            // trusted gesture context.
            haptics.prime()
            e.stopPropagation()
            tapStart.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
          }}
          onPointerUp={(e) => {
            const start = tapStart.current
            tapStart.current = null
            if (!start || start.id !== e.pointerId) return
            const dx = e.clientX - start.x
            const dy = e.clientY - start.y
            if (dx * dx + dy * dy > 12 * 12) return
            e.stopPropagation()
            const cell = toCell(e)
            if (cell !== null) onCellTap?.(cell)
          }}
          onPointerMove={onCellHover ? (e) => onCellHover(toCell(e)) : undefined}
          onPointerLeave={onCellHover ? () => onCellHover(null) : undefined}
        >
          <planeGeometry args={[BOARD_SIZE * CELL, BOARD_SIZE * CELL]} />
        </mesh>
      )}
    </group>
  )
})

/** The hero tactical-ocean-board FBX seated under a grid. */
export function BoardBase({ model }: { model: THREE.Group }) {
  const seated = useMemo(() => {
    const clone = model.clone(true)
    const box = new THREE.Box3().setFromObject(clone)
    clone.position.y = -0.06 - box.max.y
    return clone
  }, [model])
  return <primitive object={seated} />
}
