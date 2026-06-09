import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { BOARD_SIZE } from "../game/types";
import { BoardState } from "../game/engine";
import { CELL, HALF, cellCenter, pointToCell } from "./layout";
import { idx } from "../game/fleet";
import { Ships } from "./Ships";

const CYAN = "#21F4FF";
const MAGENTA = "#FF2EA6";
const RED = "#FF3B30";
const AMBER = "#FFB000";
const PALE = "#9fe8ff";

// ---- Grid lines ---------------------------------------------------------
function GridLines() {
  const geo = useMemo(() => {
    const pts: number[] = [];
    const n = BOARD_SIZE;
    for (let i = 0; i <= n; i++) {
      const o = i * CELL - HALF;
      pts.push(-HALF, 0.01, o, HALF, 0.01, o);
      pts.push(o, 0.01, -HALF, o, 0.01, HALF);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={CYAN} transparent opacity={0.32} />
    </lineSegments>
  );
}

// ---- Edge coordinate labels --------------------------------------------
function Labels() {
  const letters = "ABCDEFGHIJ".split("");
  return (
    <group>
      {letters.map((ch, x) => (
        <Text
          key={`c${x}`}
          position={[cellCenter(x, 0).x, 0.02, -HALF - 0.45]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.34}
          color={CYAN}
          anchorX="center"
          anchorY="middle"
        >
          {ch}
        </Text>
      ))}
      {Array.from({ length: BOARD_SIZE }).map((_, y) => (
        <Text
          key={`r${y}`}
          position={[-HALF - 0.45, 0.02, cellCenter(0, y).z]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.34}
          color={CYAN}
          anchorX="center"
          anchorY="middle"
        >
          {y + 1}
        </Text>
      ))}
    </group>
  );
}

// ---- Sealed enemy cell caps (instanced) --------------------------------
function SealedCaps({ board }: { board: BoardState }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let i = 0;
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const attacked = board.alreadyAttacked(idx(x, y));
        const c = cellCenter(x, y, 0.06);
        dummy.position.set(c.x, attacked ? -2 : c.y, c.z);
        dummy.scale.setScalar(attacked ? 0.001 : 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i++, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  useFrame(({ clock }) => {
    const m = ref.current?.material as THREE.MeshStandardMaterial | undefined;
    if (m) m.emissiveIntensity = 0.25 + Math.sin(clock.elapsedTime * 2) * 0.12;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, BOARD_SIZE * BOARD_SIZE]}>
      <boxGeometry args={[CELL * 0.86, 0.12, CELL * 0.86]} />
      <meshStandardMaterial
        color="#0c1822"
        emissive={CYAN}
        emissiveIntensity={0.3}
        metalness={0.4}
        roughness={0.35}
        transparent
        opacity={0.92}
      />
    </instancedMesh>
  );
}

// ---- Per-shot markers ---------------------------------------------------
function MissMarker({ pos }: { pos: THREE.Vector3 }) {
  return (
    <mesh position={[pos.x, 0.04, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[CELL * 0.22, CELL * 0.34, 24]} />
      <meshBasicMaterial color={PALE} transparent opacity={0.85} side={THREE.DoubleSide} />
    </mesh>
  );
}

function HitMarker({ pos, sunk }: { pos: THREE.Vector3; sunk: boolean }) {
  const color = sunk ? RED : MAGENTA;
  return (
    <group position={[pos.x, 0.05, pos.z]}>
      <mesh>
        <sphereGeometry args={[CELL * 0.18, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.4}
          roughness={0.3}
        />
      </mesh>
      <pointLight color={color} intensity={sunk ? 3 : 1.4} distance={3} />
    </group>
  );
}

function Marker({ index, result }: { index: number; result: string }) {
  const { x, y } = { x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE) };
  const pos = cellCenter(x, y);
  if (result === "miss") return <MissMarker pos={pos} />;
  return <HitMarker pos={pos} sunk={result === "sunk"} />;
}

// ---- Selected target ring ----------------------------------------------
function TargetRing({ index }: { index: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const { x, y } = { x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE) };
  const pos = cellCenter(x, y, 0.08);
  useFrame(({ clock }) => {
    if (ref.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 6) * 0.08;
      ref.current.scale.setScalar(s);
    }
  });
  return (
    <mesh ref={ref} position={[pos.x, pos.y, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[CELL * 0.32, CELL * 0.46, 32]} />
      <meshBasicMaterial color={AMBER} transparent opacity={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ---- Board --------------------------------------------------------------
export function Board({
  mode,
  board,
  selected,
  interactive,
  revision = 0,
  onPick,
}: {
  mode: "target" | "fleet";
  board: BoardState | null;
  selected?: number | null;
  interactive?: boolean;
  /** Bumped by the parent whenever a shot resolves, so markers refresh. */
  revision?: number;
  onPick?: (index: number) => void;
}) {
  const accent = mode === "target" ? MAGENTA : CYAN;

  const sunkIds = useMemo(
    () => (board ? board.ships.filter((s) => s.hits.every(Boolean)).map((s) => s.id) : []),
    // recompute as shots progress
    [board, revision],
  );

  const shotList = useMemo(() => {
    if (!board) return [];
    return Array.from(board.shots.entries()).map(([index, result]) => ({ index, result }));
  }, [board, revision]);

  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || !onPick) return;
    e.stopPropagation();
    const { x, y } = pointToCell(e.point.x, e.point.z);
    if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return;
    onPick(idx(x, y));
  };

  return (
    <group>
      {/* Water surface + tap-catcher */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onPointerDown={handleDown}
        receiveShadow
      >
        <planeGeometry args={[BOARD_SIZE * CELL, BOARD_SIZE * CELL]} />
        <meshStandardMaterial
          color="#08131c"
          metalness={0.85}
          roughness={0.18}
          emissive={accent}
          emissiveIntensity={0.05}
        />
      </mesh>

      <GridLines />
      <Labels />

      {/* Enemy target board: sealed caps over unattacked cells. */}
      {mode === "target" && board && <SealedCaps board={board} />}

      {/* Reveal sunk enemy ships. */}
      {mode === "target" && board && (
        <Ships
          ships={board.ships.filter((s) => s.hits.every(Boolean))}
          accent="enemy"
          sunkNames={board.ships.map((s) => s.id)}
        />
      )}

      {/* Player fleet board: show own ships, tint sunk ones. */}
      {mode === "fleet" && board && (
        <Ships ships={board.ships} accent="player" sunkNames={sunkIds} />
      )}

      {/* Shot markers. */}
      {shotList.map((s) => (
        <Marker key={`${mode}-${s.index}`} index={s.index} result={s.result} />
      ))}

      {/* Selected target highlight. */}
      {mode === "target" && interactive && selected != null && (
        <TargetRing index={selected} />
      )}
    </group>
  );
}
