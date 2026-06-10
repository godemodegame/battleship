# Mobile Performance Budget

## Purpose

The game is mobile-first and renders a WebGL scene with model loading,
shadows, an animated ocean, and animated VFX - and will later add wallet and
Fhenix flows on top. This document fixes the budgets that new visuals and
features must fit inside, before more are added.

Budgets are checked against the measured baseline of the current build
(June 2026), so regressions are visible as concrete numbers.

## Measured Baseline

Production build (`npm run build`) plus runtime assets:

- JS bundle: 1.11 MB minified, ~314 KB gzipped (one chunk; three.js and
  React dominate);
- CSS: ~9 KB;
- models (`public/models/`): ~1.3 MB (eleven FBX, three GLB);
- textures (`public/textures/`): ~3.8 MB (eleven 2048x2048 JPGs);
- total first-load transfer: ~5.5 MB, all loaded up front behind the
  loading overlay before the menu is interactive.

Scene complexity in battle:

- ~14k triangles of generated models per the Tripo targets, plus two boards
  of 100 instanced tiles each, 100 instanced sealed cells, grid lines, axis
  labels, and a 160x160 ocean quad with a three-wave shader;
- five permanent lights (one ambient, two directional - one casting a
  1024x1024 shadow map - and two point lights), plus transient point lights
  on projectiles and effect flashes;
- renderer: `dpr` capped at 2, antialias on, shadows on.

## Frame-rate Targets

| Device class | Target | Floor |
| --- | --- | --- |
| Reference phones (iPhone 12+, mid-range Android 2022+) | 60 fps | 50 fps |
| Older WebGL-capable phones (~2019) | 30 fps | 24 fps |
| Desktop | 60 fps | 60 fps |

- The floor applies during the worst moment: projectile in flight, impact
  VFX playing, camera swinging between boards.
- Sustained dips below the floor on a reference phone block merging the
  change that caused them.

## Load Targets

- Total first-load transfer (bundle + models + textures): **8 MB ceiling**;
  current ~5.5 MB leaves ~2.5 MB headroom for wallet/Fhenix code and new
  assets.
- Time from navigation to interactive menu: **under 5 s on a 4G-class
  connection (~10 Mbit/s) on a reference phone**; under 15 s on slow 3G.
- The loading overlay must always show progress; a stalled bar (missing
  asset, 404) is a release blocker.
- When the bundle grows past 500 KB gzipped, split vendor chunks
  (three.js separately) so caching starts paying off.

## Model and Texture Budgets

- Per-model triangle targets: the Tripo polycount table in
  `assets/3d-models/README.md` (600-4200 tris) stays authoritative; the
  whole battle scene should stay under ~60k triangles including
  instancing.
- Model files: tens of KB each; anything over 300 KB needs justification.
- Textures: 2048x2048 JPG is the maximum; props and one-cell ships should
  drop to 1024x1024 (the current 2048 textures on small models are
  headroom to reclaim, not a precedent). Total texture payload stays under
  4 MB.
- One color map per model is the material model (`useStyledFBX`); do not
  add normal/roughness maps without revisiting this budget.

## Shadow and Lighting Budget

- At most **one** shadow-casting light, with a shadow map of at most
  1024x1024 on mobile (the current setup is exactly at budget).
- At most 6 permanent lights in the battle scene (current: 5).
- Transient lights (projectile glow, VFX flash) decay to zero and are
  removed with their effect; at most ~3 concurrent in normal play (one
  projectile + one impact + turn-token area light headroom).
- No post-processing passes (bloom, SSAO) without a graphics-mode system
  (below) to gate them.

## Graphics Quality Modes (Planned)

Not implemented yet - the renderer currently runs one fixed quality. Before
adding heavier visuals, introduce three modes, applied at `Canvas` creation
in `src/three/Scene.tsx`:

| Mode | dpr | Antialias | Shadows | Ocean |
| --- | --- | --- | --- | --- |
| Low | 1 | off | off | flat color, no shader waves |
| Medium | 1.5 | on | 1024 map | current shader |
| High (current behavior) | up to 2 | on | 1024 map | current shader |

- Default: Medium on phones, High on desktop; auto-drop a level after
  sustained frame-rate floor violations.
- Mode selection must be possible without reloading models (it only touches
  renderer flags, light config, and the ocean material).

## Battery and Thermal Expectations

- The render loop runs continuously (`useFrame` animations: ocean, sealed
  cell pulse, markers, camera damping), even when idle on the menu. A
  15-minute match on a reference phone should not trigger visible thermal
  throttling or alarming battery drain (rough guide: under ~15% battery for
  that match).
- Browsers pause `requestAnimationFrame` in background tabs, so background
  drain is acceptable today; if telemetry later shows idle-menu drain,
  switch the menu to `frameloop="demand"`.
- dpr capped at 2 is a thermal guard as much as a performance one - do not
  raise it.

## Verification Procedure

Manual (every visual change):

1. `npm run dev` and open the LAN URL on a real phone (the dev server
   listens on the network).
2. Play one full quick match (auto-place, fire until sunk effects appear).
3. Watch for: dropped frames during projectile + impact, camera swing
   stutter, loading overlay stalls, device heat after ~10 minutes.
4. On desktop Chrome: DevTools > Performance monitor while replaying the
   same sequence with CPU throttling 4x and the viewport at 390x844; check
   the frame rate against the floor.

Scripted (planned alongside `docs/local-prototype-test-plan.md`):

- Playwright mobile-viewport smoke run (390x844) asserting the canvas
  renders non-blank within the load target and the match flow completes;
- a build-size check in CI: fail when `dist/` + `public/models` +
  `public/textures` exceeds the 8 MB ceiling.

## Adding Anything Heavier

Checklist before merging a heavier asset or effect:

1. Re-run the measured baseline numbers and update this document.
2. Confirm the load ceiling and triangle budget still hold.
3. Verify the frame-rate floor on a real phone, not only desktop.
4. If the change cannot fit, gate it behind the planned High mode rather
   than raising a budget.

## Related Documents

- `docs/runtime-asset-pipeline.md` - per-asset budget checks and
  replacement workflow.
- `docs/local-prototype-test-plan.md` - automated smoke checks.
- `docs/visual-style-guide.md` - what the visuals must look like inside
  these budgets.
