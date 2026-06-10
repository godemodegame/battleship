# VFX Forge

Standalone studio app that produces the three missing `vfx-*` runtime assets
for the Battleship game. The models were never generated from the prompt
files in `assets/3d-models/prompts/` — this app builds them procedurally
instead, in the game's neo-noir palette, and exports them as `.glb`.

| Effect | Output | Target tris | Spec |
| --- | --- | --- | --- |
| Hit impact | `vfx-hit-impact.glb` | 1500 | `prompts/vfx-hit-impact.md` |
| Miss water plume | `vfx-miss-water-plume.glb` | 1200 | `prompts/vfx-miss-water-plume.md` |
| Sunk wreck marker | `vfx-sunk-wreck-marker.glb` | 1800 | `prompts/vfx-sunk-wreck-marker.md` |

## Run

```bash
npm install
npm run dev
```

Effects play centered on a 3×3 board-cell mock under the game's angled
top-down camera, so footprint and neighbour-cell readability can be judged
directly. Orbit to inspect; scrub or loop the timeline.

## Export

`Export current .glb` / `Export all 3` download binary glTF files named to
match the prompt specs. Each file embeds a `play` animation clip with the
transform keyframes baked at 30 fps from the same parametric curves the
preview uses. Material opacity fades are not baked (core glTF cannot animate
opacity) — drive fades at runtime, as the game already does in
`src/three/vfx/Effects.tsx`.

To use in the game, drop the exported files into the game's
`public/models/` and load with `GLTFLoader` (geometry is deterministic —
re-exports are identical for a given seed).
