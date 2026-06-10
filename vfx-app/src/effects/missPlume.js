import * as THREE from 'three';
import { srng, blobGeometry } from '../proc.js';
import { clamp01, smoothstep, easeOutCubic } from '../math.js';

const PALE_CYAN = 0xa9efff;
const CYAN = 0x21f4ff;
const COLD_BLUE = 0x18365c;

// vfx-miss-water-plume.glb — cold splash plume, dark blue water ribbons,
// fading ripple base. Calmer than a hit, no fire. Target ≤ 1200 tris.
export function buildMissPlume() {
  const rng = srng(2204);
  const root = new THREE.Group();
  root.name = 'vfx-miss-water-plume';

  const matSplash = new THREE.MeshBasicMaterial({ color: PALE_CYAN, transparent: true });
  const matRibbon = new THREE.MeshBasicMaterial({ color: COLD_BLUE, transparent: true, side: THREE.DoubleSide });
  const matRipple = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, side: THREE.DoubleSide });
  const matDrop = new THREE.MeshBasicMaterial({ color: 0xd9f6ff, transparent: true });

  // Central splash column: cones with the base pinned at y=0 so scale.y
  // grows the plume upward.
  const column = new THREE.Group();
  column.name = 'column';
  root.add(column);
  const cones = [];
  for (let i = 0; i < 3; i++) {
    const h = 0.3 + rng() * 0.2;
    const geo = new THREE.ConeGeometry(0.07 + rng() * 0.04, h, 6, 2);
    geo.translate(0, h / 2, 0);
    const c = new THREE.Mesh(geo, matSplash);
    c.name = `col-${i}`;
    c.position.set(rng() * 0.1 - 0.05, 0, rng() * 0.1 - 0.05);
    c.rotation.set((rng() - 0.5) * 0.35, rng() * Math.PI, (rng() - 0.5) * 0.35);
    c.userData = { lag: i * 0.05 };
    column.add(c);
    cones.push(c);
  }

  // Transparent water ribbons arcing out of the cell.
  const ribbons = new THREE.Group();
  ribbons.name = 'ribbons';
  root.add(ribbons);
  const ribbonList = [];
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + rng() * 0.7;
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const reach = 0.26 + rng() * 0.14;
    const h = 0.2 + rng() * 0.16;
    const curve = new THREE.CatmullRomCurve3([
      dir.clone().multiplyScalar(0.05).setY(0.02),
      dir.clone().multiplyScalar(reach * 0.55).setY(h),
      dir.clone().multiplyScalar(reach).setY(0.04),
    ]);
    const r = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.02 + rng() * 0.012, 5, false), matRibbon);
    r.name = `ribbon-${i}`;
    r.userData = { lag: rng() * 0.08 };
    ribbons.add(r);
    ribbonList.push(r);
  }

  // Circular ripples at the base, staggered.
  const ripples = [];
  for (let i = 0; i < 2; i++) {
    const rp = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 26), matRipple);
    rp.name = `ripple-${i}`;
    rp.rotation.x = -Math.PI / 2;
    rp.position.y = 0.012 + i * 0.004;
    rp.userData = { start: i * 0.22 };
    root.add(rp);
    ripples.push(rp);
  }

  // A few cold droplets.
  const drops = new THREE.Group();
  drops.name = 'drops';
  root.add(drops);
  const dropList = [];
  for (let i = 0; i < 6; i++) {
    const d = new THREE.Mesh(blobGeometry(0.018 + rng() * 0.012, 0, rng, 0.3), matDrop);
    d.name = `drop-${i}`;
    const ang = rng() * Math.PI * 2;
    d.userData = {
      dir: new THREE.Vector3(Math.cos(ang) * (0.4 + rng() * 0.5), 1, Math.sin(ang) * (0.4 + rng() * 0.5)).normalize(),
      speed: 0.35 + rng() * 0.3,
      vy: 0.5 + rng() * 0.35,
    };
    drops.add(d);
    dropList.push(d);
  }

  function update(t) {
    t = clamp01(t);

    // Plume: quick cold rise, then sink back. No explosion energy.
    for (const c of cones) {
      const tt = clamp01((t - c.userData.lag) / (1 - c.userData.lag));
      const rise = easeOutCubic(clamp01(tt / 0.32));
      const fall = smoothstep(0.45, 0.92, tt);
      c.scale.set(0.65 + 0.45 * rise, Math.max(0.001, rise * (1 - 0.96 * fall)), 0.65 + 0.45 * rise);
    }
    matSplash.opacity = 0.85 * (1 - smoothstep(0.6, 0.95, t));

    for (const r of ribbonList) {
      const tt = clamp01((t - r.userData.lag) / (1 - r.userData.lag));
      r.scale.setScalar(Math.max(0.001, 0.2 + 0.8 * easeOutCubic(clamp01(tt / 0.45))));
    }
    ribbons.rotation.y = t * 0.5;
    matRibbon.opacity = 0.55 * smoothstep(0.04, 0.18, t) * (1 - smoothstep(0.55, 0.9, t));

    let rippleOpacity = 0;
    for (const rp of ripples) {
      const tt = clamp01((t - rp.userData.start) / 0.65);
      rp.scale.setScalar(Math.max(0.001, 0.35 + easeOutCubic(tt) * 1.5));
      rippleOpacity = Math.max(rippleOpacity, 0.7 * (1 - tt));
    }
    matRipple.opacity = rippleOpacity;

    for (const d of dropList) {
      const u = d.userData;
      const tt = clamp01((t - 0.06) / 0.94);
      const reach = easeOutCubic(tt) * u.speed;
      d.position.set(u.dir.x * reach, Math.max(0.012, u.vy * tt - 0.85 * tt * tt), u.dir.z * reach);
      d.scale.setScalar(Math.max(0.001, 1 - smoothstep(0.5, 0.85, tt)));
    }
    matDrop.opacity = 0.9 * (1 - smoothstep(0.55, 0.85, t));
  }

  update(0);
  return { root, duration: 1.0, heroT: 0.3, update };
}
