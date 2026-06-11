# Graphic Animation VFX Prompt Pack

## Goal

This pack defines original assets for a graphic adult-animation look:
high-contrast neo-noir color, painted breakup, inked silhouettes, stepped
timing, controlled chromatic separation, and bold frame-by-frame accents.

The direction may evoke the energy of mature stylized animation, but must not
copy a specific episode, shot, character, environment, or protected design.
Do not include the name of an existing show or artist in generation prompts.

## Shared Art Direction

Append this block to every generation prompt:

```text
Original adult animated neo-noir visual language, graphic 3D translated into
a hand-painted 2D VFX asset, bold readable silhouette, inked contour breakup,
dry-brush texture, selective halftone grain, hard shadow shapes, stepped
animation energy, restrained cyan and magenta chromatic edge separation.
Palette: near-black #07080D, deep petrol #16242A, electric cyan #21F4FF,
hot magenta #FF2EA6, impact red #FF3B30, signal amber #FFB000, cold white
#E8F7FF. Designed for an angled top-down mobile game camera. Clean isolated
asset, no environment, no UI, no text, no logo, no watermark.
```

## Shared Negative Prompt

```text
No copied movie or television frame, no named character, no existing artist
imitation, no photorealistic explosion, no realistic war footage, no generic
orange fireball, no fantasy magic spell, no cute cartoon style, no soft pastel
palette, no purple-only palette, no text, no symbols, no logo, no watermark,
no border, no mockup, no UI, no background scene, no excessive micro-detail,
no muddy low contrast, no lens flare covering the asset.
```

## Production Rules

- Generate flipbook frames as separate images with the same seed/reference,
  camera, scale, and center point. Pack them into an atlas afterward.
- Prefer transparent PNG. If alpha generation is unreliable, use pure black
  and remove it with additive/screen blending during preprocessing.
- Keep every effect readable at 128 px on a portrait phone.
- Use hard graphic shapes rather than soft volumetric clouds.
- Target 6-8 frames for transient cards and 8 frames for smoke or water.
- Runtime texture targets: 512 px for single cards and masks, 1024 px for
  packed atlases. Compress final runtime textures to WebP or KTX2 when the
  pipeline supports it.
- Use additive blending for flashes, rings, and streaks; alpha blending for
  smoke, ink, cracks, and halftone breakup.
- These textures supplement the existing procedural GLB geometry. They should
  not replace the readable 3D silhouette of the hit, miss, or sunk effect.

## Priority

| Priority | Asset | Runtime Role |
| --- | --- | --- |
| P0 | Hit flash cards | Graphic hit punctuation |
| P0 | Ink smoke flipbook | Painted smoke silhouette |
| P0 | Miss splash flipbook | Graphic water motion |
| P0 | Projectile trail mask | Stylized flight streak |
| P1 | Smear-frame cards | One-frame motion exaggeration |
| P1 | Shockwave and crack decals | Impact and persistent damage |
| P1 | Speed-line burst | Camera-space attack emphasis |
| P2 | Halftone and edge masks | Material and post-style breakup |
| P2 | Sunk-state overlay | Final destruction punctuation |

## Prompt Files

- `01-hit-flash-cards.md`
- `02-ink-smoke-flipbook.md`
- `03-miss-splash-flipbook.md`
- `04-projectile-trail-mask.md`
- `05-smear-frame-cards.md`
- `06-shockwave-and-crack-decals.md`
- `07-speed-line-burst.md`
- `08-halftone-and-edge-masks.md`
- `09-sunk-state-overlay.md`
