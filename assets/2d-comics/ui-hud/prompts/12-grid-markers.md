# Grid Result Markers Prompt

## Runtime Asset

`ui-grid-markers.webp` → backgrounds for `.battle-cell.miss`, `.battle-cell.hit`,
`.battle-cell.sunk`

## Slot

The DOM battle grid used by the on-chain routes (and as the fallback board).
Each cell is roughly 34 px on a phone, on cream paper with thin ink rules.

## Prompt

```text
Create one reference sheet of 3 comic grid markers on a transparent background,
arranged left to right in a single row, each centered in its own square cell and
drawn to the same ink weight.

Marker 1, miss: a small flat ink-blue #2F6FD0 water ring with two short splash
ticks and a near-black #14121C contour, occupying about 45 percent of the cell.
Marker 2, hit: a compact amber #FFC63C impact splat with 6 short irregular
spikes, a cold-white #FFFAF0 hot center, and a thick near-black #14121C
contour, occupying about 80 percent of the cell.
Marker 3, sunk: an impact-red #E8402E splat with a broken hull fragment and two
painted black smoke tears, plus a heavy near-black #14121C contour, occupying
about 90 percent of the cell.

Flat printed ink only — every mark must read instantly at 34 px on cream paper
and must not spill outside its cell. Transparent RGBA, 768x256 source canvas,
equal padding between markers. Original designs, not based on any existing
comic, game, brand, or protected visual identity.
```

## Negative Prompt

```text
No realistic fire, no photo explosion, no gore, no smoke plume filling the
cell, no glow, no blurred shadow, no gradient, no text, no letters, no numbers,
no crosshair, no grid lines, no water background, no watermark, no marker
bleeding past its cell.
```
