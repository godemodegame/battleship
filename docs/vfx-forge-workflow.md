# VFX Forge Workflow

## Purpose

This document connects the standalone VFX Forge studio (`vfx-app/`) to the
game's asset pipeline: how to run it, what it owns, how to export, and how to
verify an export inside the game.

`vfx-app/README.md` describes the tool itself; `docs/runtime-asset-pipeline.md`
describes the overall asset flow.

## What VFX Forge Owns

VFX Forge is the only producer of the three animated effect assets:

| Effect | File | Clip length | Played on |
| --- | --- | --- | --- |
| Hit impact | `vfx-hit-impact.glb` | 0.85 s | every hit on a ship cell |
| Miss water plume | `vfx-miss-water-plume.glb` | 1.0 s | every miss |
| Sunk wreck marker | `vfx-sunk-wreck-marker.glb` | 3.0 s | when a ship sinks |

These models were never generated from the Tripo prompt files; the studio
builds them procedurally in the game's neo-noir palette, honoring the
polycount targets in `assets/3d-models/README.md`. The prompt files in
`assets/3d-models/prompts/vfx-*.md` remain the visual spec.

The active runtime now uses optimized graphic-animation textures specified in
`assets/vfx-prompts/README.md`. That pack covers hit flash cards, ink smoke,
water flipbooks, projectile trails, smear frames, decals, speed lines, and
shader breakup masks. Runtime WebPs live under `public/textures/vfx/`; the
procedural GLBs remain available as legacy/reference assets.

Geometry is deterministic: a seeded RNG (mulberry32 in `vfx-app/src/proc.js`)
means rebuilding and re-exporting produces byte-identical geometry for a
given seed. Diff noise in re-exports indicates a real change.

## How to Run

```bash
cd vfx-app
npm install
npm run dev
```

The studio is plain Three.js + Vite (no React). Each effect plays centered on
a 3x3 board-cell mock under the game's angled top-down camera so footprint
and neighbor-cell readability can be judged directly. Orbit to inspect; scrub
or loop the timeline; switch effects with the cards.

## Export Steps

1. Select the effect card.
2. Click `Export current .glb` (or `Export all 3` for the full set). Files
   download with the exact runtime names.
3. Move the downloaded files into both asset locations:
   - `assets/3d-models/glb/` (source of record);
   - `public/models/` (runtime copy).
4. Run the verification checklist below.
5. Commit both copies together.

## What an Export Contains

Each `.glb` embeds a single animation clip named `play`:

- transform keyframes (position, rotation, scale) baked at 30 fps from the
  same parametric curves the preview uses (`bakeClip` in
  `vfx-app/src/export.js`);
- constant tracks are pruned, so static nodes carry no animation data;
- the scene is posed at its hero frame before export so static GLB viewers
  show a representative frame.

The game (`VfxInstance` in `src/three/Effects.tsx`) plays the clip once with
`LoopOnce`, scales the model per effect kind, adds a flash point light, and
removes the effect when the clip ends.

## Runtime Opacity Fade Limitation

Core glTF cannot animate material opacity, so fades are intentionally not
baked into the exports. The game drives the fade at runtime: materials are
cloned, set transparent, and faded out over the last 30% of the clip
(`src/three/Effects.tsx`). Consequences:

- do not try to bake opacity animation in the studio - it will not survive
  export;
- effects must read correctly even if a viewer plays the clip without the
  runtime fade (they simply end at full opacity);
- the per-kind fade window lives in game code, not in the asset.

## Verification Checklist After Export

In the studio (before moving files):

- the clip reads at game camera angle, stays within roughly the 3x3 cell
  mock, and does not obscure neighbor cells at its widest moment;
- triangle count is at or under target (1500 hit / 1200 miss / 1800 sunk).

In the game (`npm run dev` at the repo root):

- the loading overlay still completes (a malformed GLB stalls `useGLTF`);
- fire shots to trigger each effect: a miss, a hit, and a finishing hit on a
  ship - the sunk effect must play on every cell flip and the wreck marker
  must not fight the charred sunk-ship model visually;
- each effect plays once, fades out, and disappears (no lingering meshes -
  watch the scene for orphaned geometry after several shots);
- check on both boards: effects play on the enemy board (your shots) and on
  your board (bot shots);
- file size stayed in the expected range (current exports: 67-120 KB).

## Changing or Adding an Effect

- Edit the effect module in `vfx-app/src/effects/` (each returns
  `{ root, duration, heroT, update }` - `update(t)` is the single source of
  animation truth for both preview and export).
- New effects need: a card entry in `vfx-app/src/main.js`, a runtime name
  following `vfx-<effect>.glb`, an entry in `VFX_URL`/`VFX_SCALE`/
  `VFX_LIGHT` in `src/three/Effects.tsx`, and a preload via `preloadVfx`.
- Keep durations short: the store's pacing waits ~0.95 s after hit/miss and
  ~1.4 s after sunk before play continues - a much longer clip will be cut
  off visually by the next camera move.

## Related Documents

- `vfx-app/README.md` - the studio tool itself.
- `docs/runtime-asset-pipeline.md` - overall asset flow and budgets.
- `assets/3d-models/prompts/vfx-*.md` - visual specs for the three effects.
- `assets/vfx-prompts/README.md` - graphic-animation texture prompt pack.
