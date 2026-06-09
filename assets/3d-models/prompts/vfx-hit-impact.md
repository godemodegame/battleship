# Hit Impact Prompt

## Runtime Asset

`vfx-hit-impact.glb`

## Prompt

Create an original stylized 3D hit impact effect for a mobile Battleship-style game. The effect should combine a red-magenta impact flash, cyan-white shock edge, dark painted smoke shapes, and sharp shard-like sparks. The style is adult animated neo-noir graphic 3D with bold silhouettes, ink-like edges, painterly texture breakup, and high contrast.

The model should read immediately as a successful hit on a ship cell. It should be short, punchy, and suitable for a mobile 3D board view.

## Requirements

- Compact impact effect centered on one board cell.
- Red-magenta core.
- Cyan-white shock edge.
- Dark smoke or damage shapes.
- Optional spark shards.
- Must not obscure neighboring cells for too long.

## Tripo Settings

Use these Tripo generation settings:

- AI Model: `v3.1 - Best Quality`
- Texture: `On`
- Texture Quality: `2K`
- PBR: `Off`
- Topology: `Triangle`
- Polycount: `1500`
- Ultra Mesh Quality: `Off`
- Generate in Parts: `Off`
- 8K Texture: `Off`
- Privacy: `Sharing Only`
- Runtime Target: lightweight mobile WebGL/browser asset with fast loading and low GPU cost

## Negative Prompt

No gore, no realistic war footage, no copied explosion from an existing game or show, no logos, no text, no huge fireball, no excessive particle count, no washed-out orange-only explosion.

## Notes

The hit effect should feel stronger than a miss but still preserve board readability.
