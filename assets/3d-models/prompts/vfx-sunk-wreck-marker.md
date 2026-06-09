# Sunk Wreck Marker Prompt

## Runtime Asset

`vfx-sunk-wreck-marker.glb`

## Prompt

Create an original stylized 3D sunk marker for a mobile Battleship-style game. The marker should communicate that a ship has been destroyed without revealing hidden cells beyond the rules. Use broken dark metal fragments, red-magenta crack glow, cyan fading grid edges, and a small smoke silhouette. The style is adult animated neo-noir graphic 3D with painterly roughness and ink-like contours.

The marker should sit on an attacked cell or on a cluster of known hit cells. It should be readable from an angled top-down mobile camera and should not look like a full ship reveal unless intentionally scaled across revealed cells.

## Requirements

- Compact wreck/damage marker.
- Dark fragments with glowing cracks.
- Red-magenta and cyan accent balance.
- No readable text.
- No gore.
- Mobile-friendly mesh and material count.

## Tripo Settings

Use these Tripo generation settings:

- AI Model: `v3.1 - Best Quality`
- Texture: `On`
- Texture Quality: `2K`
- PBR: `Off`
- Topology: `Triangle`
- Polycount: `1800`
- Ultra Mesh Quality: `Off`
- Generate in Parts: `Off`
- 8K Texture: `Off`
- Privacy: `Sharing Only`
- Runtime Target: lightweight mobile WebGL/browser asset with fast loading and low GPU cost

## Negative Prompt

No full copied ship wreck, no realistic disaster scene, no flags, no logos, no text, no excessive debris field, no existing IP, no toy-like damage icon.

## Notes

This marker is a gameplay state indicator. It must be dramatic but precise.
