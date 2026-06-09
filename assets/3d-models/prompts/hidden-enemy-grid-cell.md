# Hidden Enemy Grid Cell Prompt

## Runtime Asset

`hidden-enemy-grid-cell.glb`

## Prompt

Create an original reusable 3D tile for a hidden enemy board cell in a mobile Battleship-style game. The cell should look sealed, encrypted, and uncertain, like dark glass with a faint cyan ciphertext shimmer beneath the surface. Use adult animated neo-noir graphic 3D styling, high contrast, ink-like contour edges, and painterly material breakup.

The tile should be simple enough to instance 100 times on a mobile device. It should have a slightly beveled square shape, a subtle cyan edge glow, and a dark reflective surface. Add a very restrained internal pattern that suggests encrypted data without using actual text, numbers, letters, or readable symbols.

## Requirements

- Single square grid cell.
- Designed for instancing.
- No readable text or symbols.
- Neutral hidden state.
- Optional material slots for hover, selected, and disabled states.
- Must remain readable at small mobile size.

## Tripo Settings

Use these Tripo generation settings:

- AI Model: `v3.1 - Best Quality`
- Texture: `On`
- Texture Quality: `2K`
- PBR: `Off`
- Topology: `Triangle`
- Polycount: `700`
- Ultra Mesh Quality: `Off`
- Generate in Parts: `Off`
- 8K Texture: `Off`
- Privacy: `Sharing Only`
- Runtime Target: lightweight mobile WebGL/browser asset with fast loading and low GPU cost

## Negative Prompt

No exact reference to existing shows, interfaces, or symbols. No letters, no numbers, no logos, no busy circuit-board pattern, no photorealistic glass block, no toy-like tile, no excessive glow that hides the cell edge.

## Notes

This model communicates hidden information. It must feel sealed without implying that the cell is empty.
