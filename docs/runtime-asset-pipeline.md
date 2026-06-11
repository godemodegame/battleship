# Runtime Asset Pipeline

## Purpose

This document describes how 3D assets actually flow into the running game:
where sources live, where runtime files live, how models are textured,
normalized, and preloaded, and how to replace an asset safely.

The planning-era catalog and generation prompts live in
`assets/3d-models/README.md` and `assets/3d-models/prompts/`. This document
covers the assets as they exist and load today.

## Asset Locations

Source assets (committed for regeneration and review, never loaded by the
game):

- `assets/3d-models/fbx/` - the seventeen Tripo-generated FBX models,
  including intact and destroyed variants for all six ship classes;
- `assets/3d-models/glb/` - the three `vfx-*` GLB files exported from the
  VFX Forge studio (`vfx-app/`, see `docs/vfx-forge-workflow.md`);
- `assets/3d-models/prompts/` - generation prompt per model.

Runtime assets (served statically by Vite, loaded by the game at startup):

- `public/models/` - all FBX and GLB models;
- `public/textures/` - one JPG color texture per FBX model.
- `public/textures/comic-sfx/` - optimized transparent WebP combat words used
  by projectile and result animations.

Runtime model files are byte-identical copies of the source files. Texture
copies may be downscaled for mobile delivery; the six destroyed-ship maps
retain their 2048x2048 sources and ship as 1024x1024 runtime JPGs. Replacing
an asset means updating both locations (source first, then producing the
runtime copy), so the source tree always reproduces what ships.

## FBX versus GLB

Two formats are in use, for a historical reason worth keeping explicit:

- FBX - the seventeen static models (board, intact and destroyed ships,
  props, projectile, sealed cell) came out of Tripo as FBX with a separate
  color texture. They are loaded with `useFBX` and textured at runtime.
- GLB - the three `vfx-*` effects are procedurally built and exported by
  `vfx-app`. They embed their materials and a baked `play` animation clip,
  and are loaded with `useGLTF`.

Rule of thumb: static decoration and ship hulls are FBX + JPG; anything with
a baked animation clip is GLB. A future cleanup may convert the FBX set to
GLB (the original catalog preference), but that requires re-verifying scale
and orientation for every model, so it should be a deliberate task.

## Naming Rules

Names are kebab-case and stable; code references them by string:

- model: `public/models/<name>.fbx` or `public/models/<name>.glb`;
- texture: `public/textures/<name>-texture.jpg` (FBX models only);
- ship models follow `ship-<class>` and are mapped from gameplay class ids
  by `SHIP_MODEL` in `src/three/models.ts` (`carrier` -> `ship-carrier`,
  `patrol-boat` -> `ship-patrol-boat`, and so on);
- destroyed ship models follow `ship-<class>-destroyed` and are mapped by
  `DESTROYED_SHIP_MODEL`;
- effects follow `vfx-<effect>` and are mapped by `VFX_URL` in
  `src/three/Effects.tsx`;
- props follow `prop-<name>`.

Renaming a file therefore requires touching `src/three/models.ts` (ships,
props, preload list) or `src/three/Effects.tsx` (VFX) in the same change.

## Texture Pairing

`useStyledFBX` in `src/three/models.ts` pairs every FBX model with its
`-texture.jpg` and replaces all imported materials with one
`MeshStandardMaterial` (`roughness 0.72`, `metalness 0.28`, sRGB color
space, anisotropy 4, shadows on). Consequences:

- only the color map from the texture is used - no normal, roughness, or
  emissive maps;
- material polish from the generation tool does not survive import; the
  in-game look comes from the texture plus scene lighting;
- intact ships and props currently use 2048x2048 JPGs;
- destroyed ships use 2048x2048 source maps and 1024x1024 runtime JPGs.

The source FBX files also retain Tripo export-time references to
`*.fbm/tripo_image_*.jpg`. Those materials are never used. The default Three
loading manager redirects only those stale embedded references to a
transparent pixel so they cannot create false loading failures or duplicate
texture downloads.

One model bypasses texture pairing entirely:

- `hidden-enemy-grid-cell.fbx` - only its geometry is used; the sealed
  enemy cells are instanced with a custom holographic material
  (`SealedCells` in `src/three/Board.tsx`). Its texture is still preloaded,
  which is harmless but wasted bytes;

Placement ghost ships override the intact model's styled material with a
flat hologram material. Sunk ships use their class-specific destroyed FBX
and JPG pair.

## Normalization and Scale Expectations

Generated models arrive with arbitrary export scale, orientation, and
origin. The game never trusts them; `normalize` in `src/three/models.ts`
wraps each model so that, in local space:

- the hull's long axis runs along +X (the model is yawed 90 degrees when it
  imports longer in Z than X);
- the model is centered at the origin in XZ;
- the base rests exactly on y = 0;
- the longest XZ side equals a `targetLength` in world units, optionally
  clamped by a `maxHeight`.

One board cell is one world unit (`CELL = 1`); a board spans 10 units.
Current target sizes:

| Model | Target length | Max height |
| --- | --- | --- |
| Ships | `length * 0.92` cells | `0.55 + 0.3 * length` |
| `tactical-ocean-board` | 11.8 | - |
| `attack-projectile` | 0.6 | - |
| `prop-turn-token` | 0.9 | - |
| `prop-encrypted-core` | 1.5 | - |
| VFX GLBs | authored at cell scale, scaled 1.9-2.3 in `Effects.tsx` | - |

Because normalization is bounding-box based, a model with large outriggers
or antennas will visually shrink its hull (the box, not the hull, is fitted
to the target length). Keep silhouettes tight when regenerating.

## Preload Strategy

All assets load up front; there is no lazy loading:

- `preloadAll` (`src/three/models.ts`) preloads every FBX model and texture
  via `useFBX.preload`/`useTexture.preload`;
- `preloadVfx` (`src/three/Effects.tsx`) preloads the three GLBs via
  `useGLTF.preload` and all combat comic textures via `useTexture.preload`;
- both run at module import in `src/three/Scene.tsx`;
- `LoadingOverlay` (`src/ui/common.tsx`) blocks the UI with a progress bar
  until `useProgress` reports everything loaded, per the rule that the field
  is not shown until required models exist;
- loader errors replace the progress view with `Battlefield Unavailable` and
  a reload instruction.

Adding a model without adding it to a preload list makes it load lazily on
first render, which causes a visible pop-in — always extend the preload list.

## Where VFX Assets Come From

The three `vfx-*` GLBs are not generated from the prompt files; they are
built procedurally by the standalone VFX Forge studio in `vfx-app/`, which
bakes a 30 fps `play` transform clip into each export. Opacity fades cannot
be baked into core glTF, so the game drives fade-out at runtime
(`VfxInstance` in `src/three/Effects.tsx`). Full workflow:
`docs/vfx-forge-workflow.md`.

## Replacing or Regenerating a Model Safely

1. Generate or rebuild the model (Tripo prompt from
   `assets/3d-models/prompts/`, or `vfx-app` for effects). Respect the
   polycount targets in `assets/3d-models/README.md`.
2. Put the new file in the source tree (`assets/3d-models/fbx/` or
   `assets/3d-models/glb/`) under the existing name.
3. Copy it to `public/models/` (and the texture to `public/textures/` as
   `<name>-texture.jpg` for FBX).
4. Budget check (see below): file sizes did not grow materially.
5. Run `npm run dev` and verify:
   - the loading overlay completes (a missing texture or model stalls
     progress or 404s in the console);
   - the model sits on the board correctly - orientation along +X, base on
     the deck, footprint matching its cells (check a horizontal and a
     vertical placement for ships);
   - no z-fighting with board tiles, and shadows look sane;
   - for VFX: the clip plays once, fades, and removes itself on both
     boards (fire a miss, a hit, and a sunk shot).
6. Commit source and runtime copies together.

## Mobile Budget Checks

Current payload (the baseline to defend):

- `public/models/` - about 1.6 MB (seventeen FBX + three GLB);
- `public/textures/` - about 5.0 MB (eleven 2048x2048 and six 1024x1024
  JPGs plus about 236 KB of transparent comic SFX WebP files - the JPGs
  remain the bulk of the payload);
- everything loads before first interaction.

Before adding or replacing an asset:

- keep single models in the tens-of-KB range (current FBX files are
  36-128 KB; VFX GLBs up to 120 KB);
- question any texture above 2048x2048 - and prefer downscaling to 1024
  where the model is small on screen (props, projectile, patrol boat);
- check total `public/` growth; the working assumption is a phone on a slow
  connection should still get to the menu in a few seconds (hard targets in
  `docs/mobile-performance-budget.md`);
- triangle targets per model follow the Tripo polycount table in
  `assets/3d-models/README.md` (600-4200 tris).

## Related Documents

- `docs/vfx-forge-workflow.md` - producing the `vfx-*` GLBs.
- `assets/3d-models/README.md` - catalog, prompts, polycount targets.
- `docs/mobile-performance-budget.md` - frame-rate and load budgets.
- `docs/visual-style-guide.md` - the look assets must conform to.
