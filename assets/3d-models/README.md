# 3D Model Catalog

## Purpose

This folder stores the 3D model prompts and the generated source assets for
the game. All twenty catalog models have been generated and are in use by
the playable build; how they load at runtime is documented in
`docs/runtime-asset-pipeline.md`.

The visual direction is defined in:

- `docs/visual-style-guide.md`

All model prompts must follow that guide and must describe an original visual style. Do not generate exact copies of existing shows, characters, frames, or protected designs.

## Folder Structure

Current structure:

- `assets/3d-models/prompts/` - prompt files for generating each model;
- `assets/3d-models/fbx/` - the seventeen Tripo-generated FBX source models,
  including intact and destroyed variants for every ship class;
- `assets/3d-models/glb/` - the three `vfx-*` GLB files exported from the
  VFX Forge studio (`vfx-app/`).

Runtime copies live in `public/models/` (models) and `public/textures/`
(one `<name>-texture.jpg` per FBX model). Models are kept byte-identical.
Runtime textures may be downscaled from their source maps for mobile load
performance; update both locations when replacing an asset.

Reserved for later, not created yet: `source/` (editable tool-native files),
`textures/` (shared maps), `previews/`, and `lod/`.

## Runtime Format

The original plan preferred `.glb` everywhere. The shipped reality:

- the seventeen static models (board, intact and destroyed ships, props,
  projectile, sealed cell) came out of Tripo as `.fbx` with a separate color
  texture, and the game loads them as FBX + JPG;
- the three `vfx-*` effects are `.glb` with embedded materials and a baked
  `play` animation clip, produced by `vfx-app` (see
  `docs/vfx-forge-workflow.md`).

Converting the FBX set to `.glb` remains a valid future cleanup, but every
converted model must be re-verified for scale and orientation in-game.

Required export properties:

- centered model origin;
- real-time friendly topology;
- named meshes;
- named materials;
- no embedded copyrighted logos or text;
- clean scale for game import;
- mobile-friendly texture sizes;
- lightweight enough for mobile browser/WebGL runtime;
- optional LOD versions for larger models.

## Model List

All twenty models are generated and in use. Runtime names reflect the
actual shipped format.

| Priority | Asset | Runtime Name | Prompt File | Purpose |
| --- | --- | --- | --- | --- |
| P0 | Tactical ocean board | `tactical-ocean-board.fbx` | `prompts/tactical-ocean-board.md` | Main 10 by 10 playable board |
| P0 | Hidden enemy grid cell | `hidden-enemy-grid-cell.fbx` | `prompts/hidden-enemy-grid-cell.md` | Reusable sealed cell for the enemy board |
| P0 | Carrier | `ship-carrier.fbx` | `prompts/ship-carrier.md` | Four-cell flagship silhouette |
| P0 | Battleship | `ship-battleship.fbx` | `prompts/ship-battleship.md` | Heavy combat ship |
| P0 | Cruiser | `ship-cruiser.fbx` | `prompts/ship-cruiser.md` | Medium ship |
| P0 | Destroyer | `ship-destroyer.fbx` | `prompts/ship-destroyer.md` | Fast narrow ship |
| P0 | Submarine | `ship-submarine.fbx` | `prompts/ship-submarine.md` | Low-profile hidden ship |
| P1 | Patrol boat | `ship-patrol-boat.fbx` | `prompts/ship-patrol-boat.md` | One-cell ship |
| P0 | Destroyed carrier | `ship-carrier-destroyed.fbx` | - | Carrier sunk-state model |
| P0 | Destroyed battleship | `ship-battleship-destroyed.fbx` | - | Battleship sunk-state model |
| P0 | Destroyed cruiser | `ship-cruiser-destroyed.fbx` | - | Cruiser sunk-state model |
| P0 | Destroyed destroyer | `ship-destroyer-destroyed.fbx` | - | Destroyer sunk-state model |
| P0 | Destroyed submarine | `ship-submarine-destroyed.fbx` | - | Submarine sunk-state model |
| P1 | Destroyed patrol boat | `ship-patrol-boat-destroyed.fbx` | - | Patrol boat sunk-state model |
| P1 | Attack projectile | `attack-projectile.fbx` | `prompts/attack-projectile.md` | Shot object and trail anchor |
| P1 | Miss water plume | `vfx-miss-water-plume.glb` | `prompts/vfx-miss-water-plume.md` | Miss impact effect (built by `vfx-app`, not Tripo) |
| P1 | Hit impact | `vfx-hit-impact.glb` | `prompts/vfx-hit-impact.md` | Hit impact effect (built by `vfx-app`, not Tripo) |
| P1 | Sunk wreck marker | `vfx-sunk-wreck-marker.glb` | `prompts/vfx-sunk-wreck-marker.md` | Sunk result marker (built by `vfx-app`, not Tripo) |
| P2 | Encrypted core | `prop-encrypted-core.fbx` | `prompts/prop-encrypted-core.md` | FHE/on-chain visual prop |
| P2 | Turn token | `prop-turn-token.fbx` | `prompts/prop-turn-token.md` | Current-turn indicator prop |

## Tripo Polycount Targets

Tripo requires one fixed polycount value per generation. Use these lightweight mobile-browser targets instead of entering `5000` everywhere:

| Asset | Tripo Polycount |
| --- | ---: |
| `hidden-enemy-grid-cell` | 700 |
| `attack-projectile` | 600 |
| `prop-turn-token` | 1000 |
| `prop-encrypted-core` | 1500 |
| `vfx-miss-water-plume` | 1200 |
| `vfx-hit-impact` | 1500 |
| `vfx-sunk-wreck-marker` | 1800 |
| `ship-patrol-boat` | 1200 |
| `ship-submarine` | 2200 |
| `ship-destroyer` | 2200 |
| `ship-cruiser` | 2600 |
| `ship-battleship` | 3200 |
| `ship-carrier` | 4200 |
| `tactical-ocean-board` | 3500 |

The three `vfx-*` targets are also honored by the procedural `vfx-app`
builds even though they are not Tripo generations.

## Shared Negative Prompt

Use this negative prompt for all generation tasks unless a model-specific file overrides it:

```text
Do not copy any existing show, episode, character, artist, vehicle, logo, or protected design. No text labels, no brand marks, no national flags, no photorealistic military simulator style, no cute toy style, no low-poly mobile placeholder, no cluttered background, no excessive tiny details, no beige pastel palette, no single-color purple theme, no gore.
```

## Shared Output Requirements

Every generated model should target:

- single centered 3D asset;
- transparent or neutral background for previews;
- clean silhouette readable on a phone screen;
- stylized PBR materials with painterly roughness;
- dark base material plus cyan, magenta, amber, or red accent lights;
- no baked camera angle dependency;
- usable from a top-down angled gameplay camera;
- lightweight mobile WebGL/browser performance, using the fixed per-asset Tripo polycount targets above instead of defaulting to `5000`;
- suitable for conversion or export to `.glb`.
