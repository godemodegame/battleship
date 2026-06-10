import * as THREE from 'three';
import { srng, blobGeometry } from '../proc.js';
import { smoothstep } from '../math.js';

const MAGENTA = 0xff2ea6;
const CYAN = 0x21f4ff;
const HULL = 0x1b1d2a;
const SMOKE = 0x0c1118;

const TAU = Math.PI * 2;

// vfx-sunk-wreck-marker.glb — persistent state marker: dark broken metal,
// red-magenta crack glow, cyan fading grid edges, smoke silhouette.
// Loops seamlessly (all cycles are integer multiples of the duration).
// Target ≤ 1800 tris.
export function buildSunkWreck() {
  const rng = srng(3309);
  const root = new THREE.Group();
  root.name = 'vfx-sunk-wreck-marker';

  const matHull = new THREE.MeshStandardMaterial({
    color: HULL, roughness: 0.92, metalness: 0.25, flatShading: true,
  });
  const matCrack = new THREE.MeshBasicMaterial({ color: MAGENTA, transparent: true });
  const matEdge = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true });
  const matWisp = new THREE.MeshStandardMaterial({
    color: SMOKE, roughness: 1, metalness: 0, flatShading: true, transparent: true,
  });

  // Broken hull fragments — static cluster, this is a board-state marker.
  const fragments = new THREE.Group();
  fragments.name = 'fragments';
  root.add(fragments);
  for (let i = 0; i < 6; i++) {
    const big = i < 2;
    const f = new THREE.Mesh(blobGeometry(big ? 0.13 : 0.08 + rng() * 0.04, big ? 1 : 0, rng, 0.5), matHull);
    f.name = `frag-${i}`;
    const ang = rng() * TAU;
    const rad = i === 0 ? 0 : 0.08 + rng() * 0.2;
    f.position.set(Math.cos(ang) * rad, 0.045 + rng() * 0.05, Math.sin(ang) * rad);
    f.rotation.set(rng() * TAU, rng() * TAU, rng() * TAU);
    f.scale.set(1, 0.5 + rng() * 0.35, 0.75 + rng() * 0.3);
    fragments.add(f);
  }

  // Glowing cracks wedged between the fragments.
  const cracks = new THREE.Group();
  cracks.name = 'cracks';
  root.add(cracks);
  const crackList = [];
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.1 + rng() * 0.07, 4), matCrack);
    c.name = `crack-${i}`;
    const ang = rng() * TAU;
    const rad = 0.04 + rng() * 0.18;
    c.position.set(Math.cos(ang) * rad, 0.05 + rng() * 0.08, Math.sin(ang) * rad);
    c.rotation.set(rng() * TAU, rng() * TAU, rng() * TAU);
    c.userData = { phase: rng() };
    cracks.add(c);
    crackList.push(c);
  }

  // Fading cyan grid edges marking the resolved cell.
  const edges = new THREE.Group();
  edges.name = 'edges';
  root.add(edges);
  const frame = [
    { pos: [0, 0.012, 0.47], rotY: 0 },
    { pos: [0, 0.012, -0.47], rotY: 0 },
    { pos: [0.47, 0.012, 0], rotY: Math.PI / 2 },
    { pos: [-0.47, 0.012, 0], rotY: Math.PI / 2 },
  ];
  frame.forEach((side, i) => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.014, 0.026), matEdge);
    e.name = `edge-${i}`;
    e.position.set(...side.pos);
    e.rotation.y = side.rotY;
    edges.add(e);
  });

  // Smoke silhouette wisps cycling upward.
  const wisps = new THREE.Group();
  wisps.name = 'wisps';
  root.add(wisps);
  const wispList = [];
  for (let i = 0; i < 2; i++) {
    const w = new THREE.Mesh(blobGeometry(0.07 + rng() * 0.03, 1, rng, 0.4), matWisp);
    w.name = `wisp-${i}`;
    w.userData = { offset: i * 0.5, x: rng() * 0.12 - 0.06, z: rng() * 0.12 - 0.06 };
    wisps.add(w);
    wispList.push(w);
  }

  function update(t) {
    // Idle loop. Integer sine cycles keep t=0 and t=1 identical.
    const pulse = Math.sin(TAU * 2 * t);

    for (const c of crackList) {
      c.scale.setScalar(1 + 0.14 * Math.sin(TAU * 2 * (t + c.userData.phase)));
    }
    matCrack.opacity = 0.78 + 0.2 * pulse;

    matEdge.opacity = 0.45 + 0.18 * Math.sin(TAU * t);

    for (const w of wispList) {
      const tt = (t + w.userData.offset) % 1;
      w.position.set(w.userData.x * (1 + tt), 0.16 + tt * 0.34, w.userData.z * (1 + tt));
      const grow = 0.7 + tt * 0.9;
      w.scale.set(grow, grow * 1.4, grow);
    }
    // Shared material: fade with the lead wisp's cycle; the offset wisp
    // reads as a denser inner silhouette.
    const tt = t % 1;
    matWisp.opacity = 0.55 * Math.sin(Math.PI * tt) * smoothstep(0, 0.08, tt);
  }

  update(0);
  return { root, duration: 3.0, heroT: 0.12, update };
}
