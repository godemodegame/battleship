import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGame } from "../game/store";
import { BoardState } from "../game/engine";
import { HALF } from "./layout";
import { Board } from "./Board";
import { Effects } from "./vfx/Effects";
import { fitWithin, useModel, useModelTexture, stylize } from "./models";

// ---- Board backdrop (the tactical-ocean-board FBX as set dressing) ------
function Backdrop() {
  const fbx = useModel("board");
  const tex = useModelTexture("board");
  const obj = useMemo(() => {
    const fitted = fitWithin(fbx, HALF * 2 + 2.4, -0.35);
    stylize(fitted, tex.clone(), "neutral");
    fitted.traverse((c) => {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (m) m.emissiveIntensity = 0.25;
    });
    return fitted;
  }, [fbx, tex]);
  return <primitive object={obj} />;
}

// ---- Decorative encrypted-core prop, floating beside the board ----------
function EncryptedCore() {
  const fbx = useModel("encryptedCore");
  const tex = useModelTexture("encryptedCore");
  const ref = useRef<THREE.Group>(null);
  const obj = useMemo(() => {
    const fitted = fitWithin(fbx, 1.6, 0);
    stylize(fitted, tex.clone(), "neutral");
    fitted.traverse((c) => {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (m) {
        m.emissive = new THREE.Color("#21F4FF");
        m.emissiveIntensity = 0.8;
      }
    });
    return fitted;
  }, [fbx, tex]);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.5;
      ref.current.position.y = 2.2 + Math.sin(clock.elapsedTime) * 0.15;
    }
  });
  return (
    <group ref={ref} position={[-HALF - 2.2, 2.2, HALF - 1]}>
      <primitive object={obj} />
    </group>
  );
}

// ---- Camera with a subtle, non-disruptive sway -------------------------
function CameraRig() {
  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;
    camera.position.x = Math.sin(t * 0.15) * 0.6;
    camera.position.y = 13.5 + Math.sin(t * 0.2) * 0.2;
    camera.position.z = 12.5;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// ---- Scene content depending on game phase -----------------------------
function Content() {
  const phase = useGame((s) => s.phase);
  const view = useGame((s) => s.view);
  const turn = useGame((s) => s.turn);
  const resolving = useGame((s) => s.resolving);
  const playerShips = useGame((s) => s.playerShips);
  const playerBoard = useGame((s) => s.playerBoard);
  const enemyBoard = useGame((s) => s.enemyBoard);
  const selectedTarget = useGame((s) => s.selectedTarget);
  const selectTarget = useGame((s) => s.selectTarget);
  const revision = useGame((s) => s.moves.length);

  // During placement, render the local fleet using a transient board.
  const placementBoard = useMemo(
    () => (phase === "placement" ? new BoardState(playerShips) : null),
    [phase, playerShips],
  );

  return (
    <>
      <Suspense fallback={null}>
        <Backdrop />
        <EncryptedCore />
      </Suspense>

      <Suspense fallback={null}>
        {phase === "placement" && placementBoard && (
          <Board mode="fleet" board={placementBoard} />
        )}

        {phase !== "placement" && view === "target" && (
          <Board
            mode="target"
            board={enemyBoard}
            selected={selectedTarget}
            interactive={turn === "you" && !resolving && phase === "battle"}
            revision={revision}
            onPick={selectTarget}
          />
        )}

        {phase !== "placement" && view === "fleet" && (
          <Board mode="fleet" board={playerBoard} revision={revision} />
        )}
      </Suspense>

      <Effects />
    </>
  );
}

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 13.5, 12.5], fov: 42, near: 0.1, far: 100 }}
      onCreated={({ scene, gl }) => {
        scene.background = new THREE.Color("#07080D");
        scene.fog = new THREE.Fog("#07080D", 22, 46);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
    >
      {/* Neo-noir lighting: dark ambient + cyan key + magenta threat side. */}
      <ambientLight intensity={0.18} />
      <hemisphereLight args={["#1a3a4a", "#050608", 0.5]} />
      <directionalLight
        position={[6, 14, 8]}
        intensity={1.4}
        color="#cfeeff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <pointLight position={[-9, 5, 6]} intensity={0.8} color="#FF2EA6" distance={30} />
      <pointLight position={[9, 4, -6]} intensity={0.5} color="#FFB000" distance={26} />

      <CameraRig />
      <Content />
    </Canvas>
  );
}
