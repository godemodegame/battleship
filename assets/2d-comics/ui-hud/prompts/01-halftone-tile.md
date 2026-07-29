# Halftone Tile Prompt

## Runtime Asset

`ui-halftone-tile.webp` → CSS `--tex-halftone`

## Slot

Tiled behind every paper plate: `.panel`, `.topbar-status`, `.fleet-strip`,
`.placement-heading`, `.battle-grid`, `.loading-box`.

## Prompt

```text
Create one seamless tileable halftone dot texture for a printed comic page.
Draw an even orthogonal grid of small round ink dots in near-black #14121C on a
fully transparent background. Dot diameter roughly 12 percent of the tile,
spacing regular, edges slightly imperfect as if pressed by an offset printing
plate: a faint ink bleed on one side of each dot, one or two dots per tile very
slightly lighter, no dot cut by the tile edge in a way that breaks tiling.
Uniform density across the whole tile, no vignette, no gradient, no drift.
96x96 pixel source canvas, transparent RGBA, perfectly seamless when tiled in
both axes. Original texture, not based on any existing comic, brand, artist, or
protected visual identity.
```

## Negative Prompt

```text
No color, no gradient, no vignette, no visible seam, no diagonal pattern, no
noise grain, no paper fibers, no glow, no drop shadow, no letters, no
watermark, no border, no varying dot size across the tile.
```
