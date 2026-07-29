# Spinner Frame Sheet Prompt

## Runtime Asset

`ui-spinner-frames.webp` → sprite sheet for `.loading-spinner`

## Slot

`StatusOverlay` and `LoadingOverlay` — the encryption / transaction waits. The
CSS fallback is a stepped ink ring; this asset replaces it with drawn frames
animated by `steps(8)` background-position.

## Prompt

```text
Create one 8-frame sprite sheet of a hand-inked comic loading wheel, arranged
in a single horizontal row of 8 equal square cells, each frame the same wheel
rotated 45 degrees further than the previous one so the sequence loops
seamlessly.

The wheel is a thick near-black #14121C ink ring with a slight brush wobble,
filled cream #E9DCC0, with one bold impact-red #E8402E arc covering a quarter
of the ring and an amber #FFC63C arc covering the next eighth. Add three short
ink motion ticks trailing the red arc. The wheel is centered in each cell with
10 percent padding and identical size and line weight across all 8 frames.

Flat printed ink only, readable at 44 px. Transparent RGBA, 1024x128 source
canvas, exactly 8 frames, no gaps or labels between cells. Original design, not
based on any existing comic, game, brand, or protected visual identity.
```

## Negative Prompt

```text
No text, no percentage, no numbers, no glow, no motion blur, no blurred shadow,
no gradient, no 3D, no gear teeth, no ship wheel spokes, no watermark, no
varying wheel size or position between frames, no extra frames, no cell
borders.
```
