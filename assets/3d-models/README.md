# 3D Model Catalog

## Purpose

This folder stores all 3D model planning files and, later, generated model assets for the game.

The visual direction is defined in:

- `docs/visual-style-guide.md`

All model prompts must follow that guide and must describe an original visual style. Do not generate exact copies of existing shows, characters, frames, or protected designs.

## Folder Structure

Recommended structure:

- `assets/3d-models/prompts/` - prompt files for generating each model;
- `assets/3d-models/source/` - editable source files, such as `.blend`, `.fbx`, or tool-native files;
- `assets/3d-models/glb/` - optimized runtime `.glb` files;
- `assets/3d-models/textures/` - shared texture maps;
- `assets/3d-models/previews/` - preview renders for review;
- `assets/3d-models/lod/` - lower-detail versions for mobile performance.

Only `prompts/` exists at the planning stage. The other folders can be created when actual assets are generated.

## Runtime Format

Preferred runtime format:

- `.glb`

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

| Priority | Asset | Runtime Name | Prompt File | Purpose |
| --- | --- | --- | --- | --- |
| P0 | Tactical ocean board | `tactical-ocean-board.glb` | `prompts/tactical-ocean-board.md` | Main 10 by 10 playable board |
| P0 | Hidden enemy grid cell | `hidden-enemy-grid-cell.glb` | `prompts/hidden-enemy-grid-cell.md` | Reusable sealed cell for the enemy board |
| P0 | Carrier | `ship-carrier.glb` | `prompts/ship-carrier.md` | Four-cell flagship silhouette |
| P0 | Battleship | `ship-battleship.glb` | `prompts/ship-battleship.md` | Heavy combat ship |
| P0 | Cruiser | `ship-cruiser.glb` | `prompts/ship-cruiser.md` | Medium ship |
| P0 | Destroyer | `ship-destroyer.glb` | `prompts/ship-destroyer.md` | Fast narrow ship |
| P0 | Submarine | `ship-submarine.glb` | `prompts/ship-submarine.md` | Low-profile hidden ship |
| P1 | Patrol boat | `ship-patrol-boat.glb` | `prompts/ship-patrol-boat.md` | One-cell ship |
| P1 | Attack projectile | `attack-projectile.glb` | `prompts/attack-projectile.md` | Shot object and trail anchor |
| P1 | Miss water plume | `vfx-miss-water-plume.glb` | `prompts/vfx-miss-water-plume.md` | Miss impact effect |
| P1 | Hit impact | `vfx-hit-impact.glb` | `prompts/vfx-hit-impact.md` | Hit impact effect |
| P1 | Sunk wreck marker | `vfx-sunk-wreck-marker.glb` | `prompts/vfx-sunk-wreck-marker.md` | Sunk result marker |
| P2 | Encrypted core | `prop-encrypted-core.glb` | `prompts/prop-encrypted-core.md` | FHE/on-chain visual prop |
| P2 | Turn token | `prop-turn-token.glb` | `prompts/prop-turn-token.md` | Current-turn indicator prop |

## Tripo Polycount Targets

Tripo requires one fixed polycount value per generation. Use these lightweight mobile-browser targets instead of entering `5000` everywhere:

| Runtime Name | Tripo Polycount |
| --- | ---: |
| `hidden-enemy-grid-cell.glb` | 700 |
| `attack-projectile.glb` | 600 |
| `prop-turn-token.glb` | 1000 |
| `prop-encrypted-core.glb` | 1500 |
| `vfx-miss-water-plume.glb` | 1200 |
| `vfx-hit-impact.glb` | 1500 |
| `vfx-sunk-wreck-marker.glb` | 1800 |
| `ship-patrol-boat.glb` | 1200 |
| `ship-submarine.glb` | 2200 |
| `ship-destroyer.glb` | 2200 |
| `ship-cruiser.glb` | 2600 |
| `ship-battleship.glb` | 3200 |
| `ship-carrier.glb` | 4200 |
| `tactical-ocean-board.glb` | 3500 |

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
