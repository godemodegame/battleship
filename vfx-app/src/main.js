import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { buildHitImpact } from './effects/hitImpact.js';
import { buildMissPlume } from './effects/missPlume.js';
import { buildSunkWreck } from './effects/sunkWreck.js';
import { countTriangles } from './proc.js';
import { exportEffect } from './export.js';

const DEFS = [
  { id: 'hit', name: 'HIT IMPACT', file: 'vfx-hit-impact.glb', target: 1500, accent: '#ff2ea6', build: buildHitImpact },
  { id: 'miss', name: 'MISS WATER PLUME', file: 'vfx-miss-water-plume.glb', target: 1200, accent: '#21f4ff', build: buildMissPlume },
  { id: 'sunk', name: 'SUNK WRECK MARKER', file: 'vfx-sunk-wreck-marker.glb', target: 1800, accent: '#ff3b30', build: buildSunkWreck },
];

// --- scene -----------------------------------------------------------------

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080d);
scene.fog = new THREE.Fog(0x07080d, 6, 12);

// Angled top-down framing, matching the game's mobile board camera.
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
camera.position.set(0, 3.1, 2.7);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.15, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minDistance = 1.2;
controls.maxDistance = 9;

scene.add(new THREE.AmbientLight(0x2a3a4a, 1.4));
const key = new THREE.DirectionalLight(0xbfe9ff, 2.2); // cool cyan key
key.position.set(2, 4, 3);
scene.add(key);
const threat = new THREE.DirectionalLight(0xff2ea6, 0.8); // magenta threat side light
threat.position.set(-3, 2, -2);
scene.add(threat);

// 3x3 board-cell context so "doesn't obscure neighbour cells" is checkable.
function buildBoard() {
  const board = new THREE.Group();
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshStandardMaterial({ color: 0x0e1a20, roughness: 0.7, metalness: 0.1 }),
  );
  water.rotation.x = -Math.PI / 2;
  board.add(water);

  const pts = [];
  for (let i = -1.5; i <= 1.5; i += 1) {
    pts.push(-1.5, 0.005, i, 1.5, 0.005, i);
    pts.push(i, 0.005, -1.5, i, 0.005, 1.5);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  board.add(new THREE.LineSegments(
    gridGeo,
    new THREE.LineBasicMaterial({ color: 0x21f4ff, transparent: true, opacity: 0.3 }),
  ));

  const cell = new THREE.Mesh(
    new THREE.PlaneGeometry(0.98, 0.98),
    new THREE.MeshBasicMaterial({ color: 0x21f4ff, transparent: true, opacity: 0.06 }),
  );
  cell.rotation.x = -Math.PI / 2;
  cell.position.y = 0.004;
  board.add(cell);
  return board;
}
scene.add(buildBoard());

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.55);
composer.addPass(bloom);

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

// --- state -----------------------------------------------------------------

const effects = DEFS.map((def) => {
  const fx = def.build();
  fx.def = def;
  fx.tris = countTriangles(fx.root);
  return fx;
});

let current = null;
let t = 0;
let playing = true;

const playBtn = document.getElementById('play');
const scrub = document.getElementById('scrub');
const timeEl = document.getElementById('time');
const loopEl = document.getElementById('loop');
const statusEl = document.getElementById('status');
const nav = document.getElementById('effects');

function select(fx) {
  if (current) scene.remove(current.root);
  current = fx;
  scene.add(fx.root);
  t = 0;
  setPlaying(true);
  for (const el of nav.children) el.classList.toggle('active', el.dataset.id === fx.def.id);
}

function setPlaying(on) {
  playing = on;
  playBtn.textContent = on ? '⏸' : '▶';
}

effects.forEach((fx) => {
  const card = document.createElement('button');
  card.className = 'card';
  card.dataset.id = fx.def.id;
  card.style.setProperty('--accent', fx.def.accent);
  card.innerHTML = `
    <div class="name">${fx.def.name}</div>
    <div class="file">${fx.def.file} · ${fx.duration.toFixed(2)}s</div>
    <div class="tris">${fx.tris} tris / target ${fx.def.target}</div>
  `;
  card.addEventListener('click', () => select(fx));
  nav.appendChild(card);
});

playBtn.addEventListener('click', () => {
  if (!playing && t >= 1) t = 0;
  setPlaying(!playing);
});

scrub.addEventListener('input', () => {
  t = parseFloat(scrub.value);
  setPlaying(false);
});

function flash(msg) {
  statusEl.textContent = msg;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => { statusEl.textContent = ''; }, 4000);
}

document.getElementById('export-current').addEventListener('click', async () => {
  const size = await exportEffect(current, current.def.file);
  flash(`saved ${current.def.file} (${(size / 1024).toFixed(1)} KB)`);
});

document.getElementById('export-all').addEventListener('click', async () => {
  for (const fx of effects) {
    await exportEffect(fx, fx.def.file);
    await new Promise((r) => setTimeout(r, 350));
  }
  flash('saved all 3 .glb files');
});

// --- loop ------------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (playing && current) {
    t += dt / current.duration;
    if (t >= 1) {
      if (loopEl.checked) t %= 1;
      else { t = 1; setPlaying(false); }
    }
  }
  if (current) {
    current.update(t);
    scrub.value = t;
    timeEl.textContent = `${(t * current.duration).toFixed(2)}s / ${current.duration.toFixed(2)}s`;
  }

  controls.update();
  composer.render();
  requestAnimationFrame(frame);
}

select(effects[0]);
requestAnimationFrame(frame);
