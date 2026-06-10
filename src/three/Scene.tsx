import * as THREE from 'three'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { easing } from 'maath'
import { useStore } from '../practice/practiceStore'
import { practiceBattleModel } from '../practice/practiceRenderModel'
import { FLEET } from '../game/constants'
import { canPlace, shipCells } from '../game/board'
import type { Placement } from '../game/types'
import type { BattleRenderModel, BoardRenderData, RenderShip } from '../render/model'
import { Ocean } from './Ocean'
import { Board, BoardBase, SelectionFrame } from './Board'
import { Ship } from './Ships'
import { FxLayer, preloadVfx } from './Effects'
import { preloadAll, useNormalizedModel } from './models'

preloadAll()
preloadVfx()

const PLAYER_CENTER = new THREE.Vector3(0, 0, 6.5)
const ENEMY_CENTER = new THREE.Vector3(0, 0, -6.5)
const BOARD_CENTERS = { player: PLAYER_CENTER, bot: ENEMY_CENTER }

type Pose = { position: [number, number, number]; target: [number, number, number] }
const POSES: Record<string, Pose> = {
  home: { position: [0, 2.1, 10.2], target: [0, 1.1, 0] },
  place: { position: [0, 16.2, 12.0], target: [0, 0, 5.4] },
  attack: { position: [0, 11.6, 3.2], target: [0, 0, -6.6] },
  defend: { position: [0, 10.8, 15.2], target: [0, 0, 6.3] },
  over: { position: [0, 17.5, 9.5], target: [0, 0, -0.5] },
}

function usePoseKey(): keyof typeof POSES {
  const screen = useStore((s) => s.screen)
  const focus = useStore((s) => s.focus)
  if (screen === 'home') return 'home'
  if (screen === 'placement') return 'place'
  if (screen === 'gameover') return 'over'
  return focus === 'enemy' ? 'attack' : 'defend'
}

function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const poseKey = usePoseKey()
  const target = useRef(new THREE.Vector3(...POSES[poseKey].target))

  useEffect(() => {
    // Portrait-first framing: widen the fov on narrow screens so the full
    // 10-unit board width stays visible.
    const aspect = size.width / size.height
    const horizontalHalf = (23 * Math.PI) / 180
    const fov = (2 * Math.atan(Math.tan(horizontalHalf) / Math.min(aspect, 1.6))) * (180 / Math.PI)
    camera.fov = THREE.MathUtils.clamp(fov, 46, 92)
    camera.updateProjectionMatrix()
  }, [camera, size])

  useFrame((_, dt) => {
    const pose = POSES[poseKey]
    easing.damp3(camera.position, pose.position, 0.55, dt)
    easing.damp3(target.current, pose.target, 0.55, dt)
    camera.lookAt(target.current)
  })
  return null
}

function Lights() {
  return (
    <>
      <ambientLight color="#26384a" intensity={0.55} />
      <directionalLight
        color="#cfeefc"
        intensity={2.4}
        position={[7, 13, 6]}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
      />
      <directionalLight color="#FF2EA6" intensity={1.1} position={[-9, 5, -16]} />
      <pointLight color="#FFB000" intensity={5} distance={11} position={[4.5, 2.2, 10.5]} />
      <pointLight color="#21F4FF" intensity={2.5} distance={12} position={[-6.5, 3.5, -1.5]} />
    </>
  )
}

/** Turn-token prop hovering beside whichever board holds the turn. */
function TurnToken() {
  const model = useNormalizedModel('prop-turn-token', 0.9)
  const focus = useStore((s) => s.focus)
  const screen = useStore((s) => s.screen)
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }, dt) => {
    if (!ref.current) return
    const z = focus === 'enemy' ? -1 : 12
    easing.damp3(ref.current.position, [6.1, 0.9 + Math.sin(clock.elapsedTime * 1.4) * 0.15, z], 0.6, dt)
    ref.current.rotation.y += dt * 0.9
  })
  if (screen !== 'battle') return null
  return (
    <group ref={ref} position={[6.1, 0.9, -1]}>
      <primitive object={model} />
    </group>
  )
}

function PlacementGhost({ hover }: { hover: number | null }) {
  const placements = useStore((s) => s.placements)
  const selectedSlot = useStore((s) => s.selectedSlot)
  const orientation = useStore((s) => s.placeOrientation)
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

/** Draws hull instances for a board's render data (live and/or sunk). */
function ShipHulls({ ships }: { ships: ReadonlyArray<RenderShip> }) {
  return (
    <>
      {ships.map((ship) => (
        <Ship
          key={ship.key}
          classId={ship.classId}
          length={ship.length}
          row={ship.row}
          col={ship.col}
          orientation={ship.orientation}
          variant={ship.sunk ? 'sunk' : 'fleet'}
        />
      ))}
    </>
  )
}

function PlayerBoard({ data }: { data: BoardRenderData }) {
  const screen = useStore((s) => s.screen)
  const placements = useStore((s) => s.placements)
  const placeAt = useStore((s) => s.placeAt)
  const pickUpAt = useStore((s) => s.pickUpAt)
  const [hover, setHover] = useState<number | null>(null)

  const placing = screen === 'placement'

  const occupied = useMemo(() => {
    if (!placing) return null
    const set = new Set<number>()
    for (const p of placements) {
      if (!p) continue
      const cells = shipCells(p, FLEET[p.slot].length)
      for (const c of cells ?? []) set.add(c)
    }
    return set
  }, [placing, placements])

  return (
    <Board
      position={[PLAYER_CENTER.x, 0, PLAYER_CENTER.z]}
      shots={data.shots}
      interactive={placing}
      onCellTap={(cell) => {
        if (!placing) return
        if (occupied?.has(cell)) pickUpAt(cell)
        else placeAt(Math.floor(cell / 10), cell % 10)
        setHover(null)
      }}
      onCellHover={placing ? setHover : undefined}
    >
      {placing &&
        placements.map(
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
      {placing && <PlacementGhost hover={hover} />}
      {!placing && <ShipHulls ships={data.ships} />}
    </Board>
  )
}

function EnemyBoard({ data }: { data: BoardRenderData }) {
  const screen = useStore((s) => s.screen)
  const selectedCell = useStore((s) => s.selectedCell)
  const selectCell = useStore((s) => s.selectCell)
  const busy = useStore((s) => s.busy)
  const turn = useStore((s) => s.match?.turn)
  const hasWinner = useStore((s) => Boolean(s.match?.winner))

  if (screen === 'placement') return null

  const canAim = screen === 'battle' && !busy && turn === 'player' && !hasWinner

  return (
    <Board
      position={[ENEMY_CENTER.x, 0, ENEMY_CENTER.z]}
      shots={data.shots}
      sealed
      dimmed={data.dimmed}
      interactive={canAim}
      onCellTap={(cell) => selectCell(cell)}
    >
      {selectedCell !== null && canAim && <SelectionFrame cell={selectedCell} />}
      <ShipHulls ships={data.ships} />
    </Board>
  )
}

function HeroBase({ z }: { z: number }) {
  const model = useNormalizedModel('tactical-ocean-board', 11.8)
  return (
    <group position={[0, 0, z]}>
      <BoardBase model={model} />
    </group>
  )
}

function BattleScene({ model }: { model: BattleRenderModel }) {
  return (
    <group>
      <HeroBase z={PLAYER_CENTER.z} />
      <HeroBase z={ENEMY_CENTER.z} />
      <PlayerBoard data={model.player} />
      <EnemyBoard data={model.enemy} />
      <TurnToken />
      <FxLayer boardCenters={BOARD_CENTERS} />
    </group>
  )
}

/** Builds the shared scene model for the practice match (mode-specific data). */
function usePracticeBattleModel(): BattleRenderModel {
  const match = useStore((s) => s.match)
  return useMemo(() => practiceBattleModel(match), [match])
}

/** Menu backdrop: drifting hero ships around the glowing encrypted core. */
function HomeScene() {
  const carrier = useNormalizedModel('ship-carrier', 6.4)
  const battleship = useNormalizedModel('ship-battleship', 4.4)
  const core = useNormalizedModel('prop-encrypted-core', 1.5)
  const coreRef = useRef<THREE.Group>(null)
  const fleetRef = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (coreRef.current) {
      coreRef.current.rotation.y = t * 0.45
      coreRef.current.position.y = 3.1 + Math.sin(t * 0.8) * 0.18
    }
    if (fleetRef.current) {
      fleetRef.current.rotation.z = Math.sin(t * 0.5) * 0.012
      fleetRef.current.position.y = Math.sin(t * 0.62) * 0.06
    }
  })
  return (
    <group>
      <group ref={fleetRef}>
        <group position={[-1.6, 0, 1.2]} rotation-y={-0.5}>
          <primitive object={carrier} />
        </group>
        <group position={[2.6, 0, -3.4]} rotation-y={0.7}>
          <primitive object={battleship} />
        </group>
      </group>
      <group ref={coreRef} position={[2.4, 3.1, -3.2]}>
        <primitive object={core} />
        <pointLight color="#21F4FF" intensity={9} distance={9} position={[0.9, 0.5, 1.2]} />
      </group>
    </group>
  )
}

export function GameCanvas() {
  const screen = useStore((s) => s.screen)
  const model = usePracticeBattleModel()
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: POSES.home.position, fov: 55, near: 0.5, far: 90 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={['#07080D']} />
      <fog attach="fog" args={['#07080D', 16, 52]} />
      <CameraRig />
      <Lights />
      <Suspense fallback={null}>
        <Ocean />
        {screen === 'home' ? <HomeScene /> : <BattleScene model={model} />}
      </Suspense>
    </Canvas>
  )
}
