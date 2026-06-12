import * as THREE from 'three'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { FLEET } from '../game/constants'
import { canPlace, shipCells } from '../game/board'
import type { CellShot, Orientation, Placement } from '../game/types'
import { Board, BoardBase } from './Board'
import { Lights } from './Lights'
import { Ocean } from './Ocean'
import { Ship } from './Ships'
import { preloadPlacement, useNormalizedModel } from './models'
import {
  qualityProfile,
  resolveQualityLevel,
  useReducedMotion,
  useSettingsStore,
} from '../ui/settingsStore'

// Without this, the first hover/placement of each ship class suspends the
// whole scene to the null fallback (the match route never loads Scene.tsx,
// whose preloadAll() covers practice mode).
preloadPlacement()

/**
 * Store-agnostic 3D placement board (the practice-mode look for on-chain
 * placement). The board sits at the origin; the camera reuses the practice
 * "place" pose translated into board-local space.
 */
export interface PlacementCanvasProps {
  placements: ReadonlyArray<Placement | null>
  selectedSlot: number | null
  orientation: Orientation
  /** Freezes board interaction while encrypting/submitting. */
  disabled?: boolean
  onPlace: (row: number, col: number) => void
  onPickUp: (cell: number) => void
}

const NO_SHOTS: ReadonlyArray<CellShot> = Object.freeze(
  Array.from({ length: 100 }, () => 0 as CellShot),
)

// Practice "place" pose in board-local space, with the target pulled toward
// the camera so the board sits in the upper half of the fullscreen canvas,
// clear of the controls overlaying the bottom.
const POSE = {
  position: [0, 16.2, 5.5] as [number, number, number],
  target: new THREE.Vector3(0, 0, 2.2),
}

/** Viewport pixels the route chrome (header above, controls below) overlays
 * onto the fullscreen canvas; the board must fit in the band between them. */
const ROUTE_CHROME_PX = 430
/** Empirical projected-board-height factor for this pose (fraction of canvas
 * height = TILT_K / tan(fov/2) at the base camera distance). */
const TILT_K = 0.323

function PlacementCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  useEffect(() => {
    // Same portrait-first framing as the practice CameraRig: widen the fov on
    // narrow canvases so the full 10-unit board width stays visible.
    const aspect = size.width / size.height
    const horizontalHalf = (23 * Math.PI) / 180
    const fit = (2 * Math.atan(Math.tan(horizontalHalf) / Math.min(aspect, 1.6))) * (180 / Math.PI)
    const fov = THREE.MathUtils.clamp(fit, 48, 92)
    camera.fov = fov
    // Wide viewports (landscape phones, desktop) place the controls in a
    // right-hand column, so the board shifts left of center and only the
    // compact header overlays it; portrait stacks controls below the board.
    const wide = aspect >= 1.2
    // When the board projection is taller than the free band the chrome
    // leaves, pull the camera back along the view axis until it fits.
    const boardPx = (TILT_K / Math.tan((fov * Math.PI) / 360)) * size.height
    const band = Math.max(size.height - (wide ? 150 : ROUTE_CHROME_PX), 180)
    const back = THREE.MathUtils.clamp(boardPx / band, 1, 1.8)
    const dir = new THREE.Vector3(...POSE.position).sub(POSE.target).multiplyScalar(back)
    camera.position.copy(POSE.target).add(dir)
    camera.lookAt(POSE.target)
    if (wide) {
      camera.setViewOffset(
        size.width,
        size.height,
        Math.round(size.width * 0.21),
        Math.round(-size.height * 0.1),
        size.width,
        size.height,
      )
    } else {
      camera.clearViewOffset()
    }
    camera.updateProjectionMatrix()
  }, [camera, size])
  return null
}

function PlacementGhost({
  placements,
  selectedSlot,
  orientation,
  hover,
}: {
  placements: ReadonlyArray<Placement | null>
  selectedSlot: number | null
  orientation: Orientation
  hover: number | null
}) {
  if (hover === null || selectedSlot === null) return null
  const def = FLEET[selectedSlot]
  const candidate: Placement = {
    slot: selectedSlot,
    row: Math.floor(hover / 10),
    col: hover % 10,
    orientation,
  }
  if (!shipCells(candidate, def.length)) return null
  const valid = canPlace(placements, candidate)
  return (
    <Ship
      classId={def.classId}
      length={def.length}
      row={candidate.row}
      col={candidate.col}
      orientation={orientation}
      variant="ghost"
      ghostValid={valid}
    />
  )
}

function HeroBase() {
  const model = useNormalizedModel('tactical-ocean-board', 11.8)
  return <BoardBase model={model} />
}

export function PlacementCanvas({
  placements,
  selectedSlot,
  orientation,
  disabled,
  onPlace,
  onPickUp,
}: PlacementCanvasProps) {
  const quality = useSettingsStore((s) => s.quality)
  const reducedMotion = useReducedMotion()
  const level = resolveQualityLevel(quality)
  const profile = qualityProfile(quality)
  const [hover, setHover] = useState<number | null>(null)

  const occupied = useMemo(() => {
    const set = new Set<number>()
    for (const p of placements) {
      if (!p) continue
      for (const c of shipCells(p, FLEET[p.slot].length) ?? []) set.add(c)
    }
    return set
  }, [placements])

  useEffect(() => {
    if (disabled) setHover(null)
  }, [disabled])

  const oceanAnimated = profile.oceanAnimated && !reducedMotion

  return (
    <Canvas
      key={level}
      shadows={profile.shadows}
      dpr={[1, profile.dpr]}
      camera={{ position: POSE.position, fov: 50, near: 0.5, far: 90 }}
      gl={{ antialias: profile.antialias, powerPreference: 'high-performance' }}
      // Unlike fullscreen practice, this canvas lives in a scrollable route:
      // pan-y keeps page scrolling alive over the board (taps still place).
      // The camera is static, so when the ocean is frozen nothing animates
      // and demand-mode rendering saves the per-frame shadow pass.
      frameloop={oceanAnimated ? 'always' : 'demand'}
      style={{ touchAction: 'pan-y' }}
    >
      <color attach="background" args={['#07080D']} />
      <fog attach="fog" args={['#07080D', 16, 52]} />
      <PlacementCamera />
      <Lights shadows={profile.shadows} />
      <Suspense fallback={null}>
        <Ocean animated={oceanAnimated} />
        <HeroBase />
        <Board
          position={[0, 0, 0]}
          shots={NO_SHOTS}
          interactive={!disabled}
          onCellTap={(cell) => {
            if (disabled) return
            if (occupied.has(cell)) onPickUp(cell)
            else onPlace(Math.floor(cell / 10), cell % 10)
            setHover(null)
          }}
          onCellHover={disabled ? undefined : setHover}
        >
          {placements.map(
            (p) =>
              p && (
                <Ship
                  key={p.slot}
                  classId={FLEET[p.slot].classId}
                  length={FLEET[p.slot].length}
                  row={p.row}
                  col={p.col}
                  orientation={p.orientation}
                />
              ),
          )}
          <PlacementGhost
            placements={placements}
            selectedSlot={selectedSlot}
            orientation={orientation}
            hover={hover}
          />
        </Board>
      </Suspense>
    </Canvas>
  )
}
