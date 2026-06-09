# Miss Water Plume Prompt

## Runtime Asset

`vfx-miss-water-plume.glb`

## Prompt

Create an original stylized 3D miss effect for a mobile Battleship-style game. The effect should be a cold water plume rising from a missed attack cell, with pale cyan splash shapes, dark blue transparent water ribbons, and a fading circular ripple base. The style is adult animated neo-noir graphic 3D with painterly edges, graphic silhouettes, and high contrast.

The model should be usable as a short VFX mesh or as a base for particles. It must read instantly as a miss, not an explosion.

## Requirements

- Compact splash plume.
- Circular ripple at base.
- Pale cyan and cold blue palette.
- No heavy opaque mesh that hides the board.
- Mobile-friendly particle or mesh count.
- Works from angled top-down camera.

## Tripo Settings

Use these Tripo generation settings:

- AI Model: `v3.1 - Best Quality`
- Texture: `On`
- Texture Quality: `2K`
- PBR: `Off`
- Topology: `Triangle`
- Polycount: `1200`
- Ultra Mesh Quality: `Off`
- Generate in Parts: `Off`
- 8K Texture: `Off`
- Privacy: `Sharing Only`
- Runtime Target: lightweight mobile WebGL/browser asset with fast loading and low GPU cost

## Negative Prompt

No fire, no explosion, no red impact, no realistic fluid simulation requirement, no clutter, no text, no logo, no copied effect from an existing game or show.

## Notes

This effect should be calmer than hit effects and disappear quickly.
