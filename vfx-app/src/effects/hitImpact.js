import * as THREE from 'three';
import { srng, blobGeometry } from '../proc.js';
import { clamp01, mix, smoothstep, easeOutCubic, easeOutBack } from '../math.js';

const MAGENTA = 0xff2ea6;
const RED = 0xff3b30;
const CYAN = 0x21f4ff;
const COLD_WHITE = 0xe8f7ff;
const SMOKE = 0x0d1320;

const UP = new THREE.Vector3(0, 1, 0);

// vfx-hit-impact.glb — red-magenta core flash, cyan-white shock edge,
// dark painted smoke, spark shards. Target ≤ 1500 tris.
export function buildHitImpact() {
  const rng = srng(1107);
  const root = new THREE.Group();
  root.name = 'vfx-hit-impact';

  const matCore = new THREE.MeshBasicMaterial({ color: MAGENTA, transparent: true });
  const matKernel = new THREE.MeshBasicMaterial({ color: 0xffd9ec, transparent: true });
  const matShock = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, side: THREE.DoubleSide });
  const matRim = new THREE.MeshBasicMaterial({ color: COLD_WHITE, transparent: true, side: THREE.DoubleSide });
  const matSmoke = new THREE.MeshStandardMaterial({
    color: SMOKE, roughness: 0.95, metalness: 0, flatShading: true, transparent: true,
  });
  const matShard = new THREE.MeshBasicMaterial({ color: RED, transparent: true });

  const core = new THREE.Mesh(blobGeometry(0.17, 1, rng, 0.34), matCore);
  core.name = 'core';
  core.position.y = 0.14;
  root.add(core);

  const kernel = new THREE.Mesh(blobGeometry(0.09, 1, rng, 0.2), matKernel);
  kernel.name = 'kernel';
  kernel.position.y = 0.14;
  root.add(kernel);

  const shock = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 28), matShock);
  shock.name = 'shock';
  shock.rotation.x = -Math.PI / 2;
  shock.position.y = 0.02;
  root.add(shock);

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.07, 24, 1, true), matRim);
  rim.name = 'rim';
  rim.position.y = 0.05;
  root.add(rim);

  const smoke = new THREE.Group();
  smoke.name = 'smoke';
  root.add(smoke);
  const blobs = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(blobGeometry(0.09 + rng() * 0.06, 1, rng, 0.45), matSmoke);
    b.name = `smoke-${i}`;
    const ang = rng() * Math.PI * 2;
    b.userData = {
      base: new THREE.Vector3(Math.cos(ang) * (0.06 + rng() * 0.1), 0.1 + rng() * 0.1, Math.sin(ang) * (0.06 + rng() * 0.1)),
      rise: 0.26 + rng() * 0.18,
      drift: new THREE.Vector3(rng() * 0.16 - 0.08, 0, rng() * 0.16 - 0.08),
      spin: rng() * 3 - 1.5,
      size: 0.8 + rng() * 0.5,
    };
    smoke.add(b);
    blobs.push(b);
  }

  const shards = new THREE.Group();
  shards.name = 'shards';
  root.add(shards);
  const sparkList = [];
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2 + rng() * 0.6;
    const len = 0.09 + rng() * 0.08;
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.016 + rng() * 0.012, len, 4), i % 3 ? matShard : matKernel);
    s.name = `shard-${i}`;
    const dir = new THREE.Vector3(Math.cos(ang), 0.7 + rng() * 0.9, Math.sin(ang)).normalize();
    s.userData = { dir, speed: 0.45 + rng() * 0.35, spin: rng() * 9 - 4.5 };
    s.quaternion.setFromUnitVectors(UP, dir);
    shards.add(s);
    sparkList.push(s);
  }

  function update(t) {
    t = clamp01(t);

    // Core: snappy pop, then collapse and fade — punchy, short.
    const pop = t < 0.16 ? easeOutBack(t / 0.16) : 1;
    const coreScale = Math.max(0.001, pop * mix(1, 0.05, smoothstep(0.25, 0.7, t)));
    core.scale.setScalar(coreScale);
    core.rotation.y = t * 2.4;
    matCore.opacity = 1 - smoothstep(0.45, 0.72, t);
    matCore.color.setHex(MAGENTA).lerp(new THREE.Color(RED), smoothstep(0.1, 0.5, t));
    kernel.scale.setScalar(Math.max(0.001, pop * mix(1, 0.02, smoothstep(0.18, 0.55, t))));
    kernel.rotation.y = -t * 3.1;
    matKernel.opacity = 1 - smoothstep(0.3, 0.55, t);

    // Cyan-white shock edge expands fast and dies before the smoke peaks
    // so neighbour cells stay readable.
    const g = easeOutCubic(clamp01(t / 0.55));
    shock.scale.setScalar(Math.max(0.001, 0.25 + 1.45 * g));
    matShock.opacity = 0.9 * (1 - smoothstep(0.32, 0.58, t));
    const rg = easeOutCubic(clamp01((t - 0.04) / 0.55));
    rim.scale.set(0.25 + 1.5 * rg, Math.max(0.001, 1 - rg * 0.65), 0.25 + 1.5 * rg);
    matRim.opacity = 0.8 * (1 - smoothstep(0.28, 0.52, t));

    // Smoke: rises late, expands, fades.
    const k = clamp01((t - 0.12) / 0.88);
    for (const b of blobs) {
      const u = b.userData;
      b.position.copy(u.base).addScaledVector(u.drift, k);
      b.position.y = u.base.y + u.rise * easeOutCubic(k);
      b.scale.setScalar(Math.max(0.001, u.size * (0.45 + 0.95 * easeOutCubic(k))));
      b.rotation.y = u.spin * k;
    }
    matSmoke.opacity = 0.88 * smoothstep(0, 0.18, k) * (1 - smoothstep(0.55, 1, k));

    // Spark shards: ballistic burst, shrink out.
    for (const s of sparkList) {
      const u = s.userData;
      const d = 0.06 + easeOutCubic(t) * u.speed;
      s.position.copy(u.dir).multiplyScalar(d);
      s.position.y = Math.max(0.01, u.dir.y * d - 0.4 * t * t);
      s.rotation.z = u.spin * t;
      s.scale.setScalar(Math.max(0.001, 1 - smoothstep(0.35, 0.8, t)));
    }
    matShard.opacity = 1 - smoothstep(0.5, 0.8, t);
  }

  update(0);
  return { root, duration: 0.85, heroT: 0.2, update };
}
