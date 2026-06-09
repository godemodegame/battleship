import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { FxEvent, useGame } from "../../game/store";
import { BOARD_SIZE } from "../../game/types";
import { CELL, cellCenter } from "../layout";
import { fitToFootprint, stylize, useModel, useModelTexture } from "../models";

// All combat VFX are procedural (the vfx-* models were never produced —
// only the prompt files exist). They follow docs/visual-style-guide.md:
//   miss  - cold splash + mist plume + fading ripple
//   hit   - red/magenta flash + shard sparks + smoke
//   sunk  - silhouette break + red/cyan crack rings + dark wreck marker

const CYAN = new THREE.Color("#21F4FF");
const MAGENTA = new THREE.Color("#FF2EA6");
const RED = new THREE.Color("#FF3B30");
const PALE = new THREE.Color("#bfeeff");
const SMOKE = new THREE.Color("#1a1d26");

function indexPos(index: number, h = 0) {
  return cellCenter(index % BOARD_SIZE, Math.floor(index / BOARD_SIZE), h);
}

// ----------------------------------------------------------------------
function Projectile({ fx, template }: { fx: FxEvent; template: THREE.Object3D | null }) {
  const clear = useGame((s) => s.clearEffect);
  const ref = useRef<THREE.Group>(null);
  const start = useRef(performance.now());
  const target = useMemo(() => indexPos(fx.index, 0.1), [fx.index]);
  const launch = useMemo(
    () => new THREE.Vector3(target.x * 0.4, 7, target.z + 6),
    [target],
  );
  const model = useMemo(() => {
    if (!template) return null;
    const m = template.clone(true);
    m.scale.setScalar(0.5);
    return m;
  }, [template]);

  const DURATION = 600;
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = Math.min((performance.now() - start.current) / DURATION, 1);
    g.position.lerpVectors(launch, target, t);
    g.position.y += Math.sin(t * Math.PI) * 2.2; // arc
    g.rotation.x += 0.4;
    g.rotation.z += 0.3;
    if (t >= 1) clear(fx.id);
  });

  return (
    <group ref={ref} position={launch}>
      {model ? (
        <primitive object={model} />
      ) : (
        <mesh>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshStandardMaterial color="#fff" emissive={CYAN} emissiveIntensity={2} />
        </mesh>
      )}
      <pointLight color={CYAN} intensity={2} distance={4} />
    </group>
  );
}

// ----------------------------------------------------------------------
function Particles({
  base,
  count,
  color,
  spread,
  up,
  gravity,
  size,
  duration,
  onDone,
}: {
  base: THREE.Vector3;
  count: number;
  color: THREE.Color;
  spread: number;
  up: number;
  gravity: number;
  size: number;
  duration: number;
  onDone: () => void;
}) {
  const ref = useRef<THREE.Points>(null);
  const start = useRef(performance.now());
  const vel = useMemo(() => {
    const v: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      v.push(new THREE.Vector3(Math.cos(a) * r, up * (0.5 + Math.random()), Math.sin(a) * r));
    }
    return v;
  }, [count, spread, up]);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Array(count * 3).fill(0), 3));
    return g;
  }, [count]);

  useFrame(() => {
    const p = ref.current;
    if (!p) return;
    const t = (performance.now() - start.current) / duration;
    const arr = geom.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const tt = t;
      arr.setXYZ(
        i,
        base.x + vel[i].x * tt,
        Math.max(0.02, base.y + vel[i].y * tt - gravity * tt * tt),
        base.z + vel[i].z * tt,
      );
    }
    arr.needsUpdate = true;
    const mat = p.material as THREE.PointsMaterial;
    mat.opacity = Math.max(0, 1 - t);
    if (t >= 1) onDone();
  });

  return (
    <points ref={ref} geometry={geom}>
      <pointsMaterial
        color={color}
        size={size}
        transparent
        opacity={1}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Ripple({ base, color, max, duration }: { base: THREE.Vector3; color: THREE.Color; max: number; duration: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const start = useRef(performance.now());
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const t = Math.min((performance.now() - start.current) / duration, 1);
    m.scale.setScalar(0.2 + t * max);
    (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - t);
  });
  return (
    <mesh ref={ref} position={[base.x, 0.05, base.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[CELL * 0.25, CELL * 0.34, 36]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Flash({ base, color, intensity, duration }: { base: THREE.Vector3; color: THREE.Color; intensity: number; duration: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const start = useRef(performance.now());
  useFrame(() => {
    const t = Math.min((performance.now() - start.current) / duration, 1);
    if (ref.current) {
      ref.current.scale.setScalar(0.3 + t * 1.4);
      (ref.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t);
    }
    if (light.current) light.current.intensity = intensity * Math.max(0, 1 - t);
  });
  return (
    <group position={[base.x, 0.4, base.z]}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={1} blending={THREE.AdditiveBlending} />
      </mesh>
      <pointLight ref={light} color={color} intensity={intensity} distance={6} />
    </group>
  );
}

// ----------------------------------------------------------------------
function MissFx({ fx }: { fx: FxEvent }) {
  const clear = useGame((s) => s.clearEffect);
  const base = useMemo(() => indexPos(fx.index, 0.1), [fx.index]);
  const done = useRef(0);
  const finish = () => {
    done.current++;
    if (done.current >= 2) clear(fx.id);
  };
  return (
    <group>
      <Particles base={base} count={26} color={PALE} spread={0.7} up={3.2} gravity={5} size={0.18} duration={700} onDone={finish} />
      <Ripple base={base} color={PALE} max={1.4} duration={700} />
      <Flash base={base} color={PALE} intensity={1} duration={300} />
      <DoneTimer ms={750} onDone={finish} />
    </group>
  );
}

function HitFx({ fx }: { fx: FxEvent }) {
  const clear = useGame((s) => s.clearEffect);
  const base = useMemo(() => indexPos(fx.index, 0.2), [fx.index]);
  const done = useRef(0);
  const finish = () => {
    done.current++;
    if (done.current >= 2) clear(fx.id);
  };
  return (
    <group>
      <Flash base={base} color={MAGENTA} intensity={3} duration={350} />
      <Particles base={base} count={30} color={RED} spread={1.1} up={3.4} gravity={4} size={0.16} duration={650} onDone={finish} />
      <Particles base={base} count={16} color={SMOKE} spread={0.5} up={2.4} gravity={1.2} size={0.5} duration={900} onDone={() => {}} />
      <DoneTimer ms={700} onDone={finish} />
    </group>
  );
}

function SunkFx({ fx }: { fx: FxEvent }) {
  const clear = useGame((s) => s.clearEffect);
  const base = useMemo(() => indexPos(fx.index, 0.2), [fx.index]);
  const done = useRef(0);
  const finish = () => {
    done.current++;
    if (done.current >= 2) clear(fx.id);
  };
  return (
    <group>
      <Flash base={base} color={RED} intensity={4.5} duration={500} />
      <Ripple base={base} color={RED} max={2.4} duration={1000} />
      <Ripple base={base} color={CYAN} max={1.8} duration={1100} />
      <Particles base={base} count={40} color={RED} spread={1.5} up={4} gravity={3.5} size={0.18} duration={1000} onDone={finish} />
      <Particles base={base} count={22} color={SMOKE} spread={0.8} up={2.8} gravity={1} size={0.7} duration={1300} onDone={() => {}} />
      <DoneTimer ms={1100} onDone={finish} />
    </group>
  );
}

// A frame-driven timer so flash/ripple-only effects still clean up.
function DoneTimer({ ms, onDone }: { ms: number; onDone: () => void }) {
  const start = useRef(performance.now());
  const fired = useRef(false);
  useFrame(() => {
    if (!fired.current && performance.now() - start.current >= ms) {
      fired.current = true;
      onDone();
    }
  });
  return null;
}

// ----------------------------------------------------------------------
export function Effects() {
  const effects = useGame((s) => s.effects);
  const fbx = useModel("projectile");
  const tex = useModelTexture("projectile");
  const template = useMemo(() => {
    try {
      const fitted = fitToFootprint(fbx, 1, CELL);
      stylize(fitted, tex.clone(), "neutral");
      return fitted;
    } catch {
      return null;
    }
  }, [fbx, tex]);

  return (
    <group>
      {effects.map((fx) => {
        switch (fx.kind) {
          case "projectile":
            return <Projectile key={fx.id} fx={fx} template={template} />;
          case "miss":
            return <MissFx key={fx.id} fx={fx} />;
          case "hit":
            return <HitFx key={fx.id} fx={fx} />;
          case "sunk":
            return <SunkFx key={fx.id} fx={fx} />;
          default:
            return null;
        }
      })}
    </group>
  );
}
