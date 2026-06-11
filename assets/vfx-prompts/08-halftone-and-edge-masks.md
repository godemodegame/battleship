# Halftone And Edge Masks

## Output

- Runtime names: `vfx-halftone-breakup-mask.png`,
  `vfx-chromatic-edge-mask.png`
- Generate: 2 square grayscale images
- Source size: 1024x1024
- Runtime size: 512x512
- Color space: linear/non-color data
- Use: shader masks, not visible full-color cards

## Halftone Mask Prompt

```text
Create a monochrome seamless texture mask for graphic animation VFX. Pure
black background with irregular clusters of white halftone dots, dry-brush
speckle, scratched ink gaps, and a few larger broken paint islands. Density
varies organically from sparse to medium but never becomes a regular printed
grid. High contrast, no gray lighting, no three-dimensional surface, no
objects. Tileable on all edges, square image.
```

## Chromatic Edge Mask Prompt

```text
Create a monochrome abstract edge-breakup mask for a real-time shader. Pure
black background with thin white contour fragments, short parallel offsets,
jagged registration slips, torn brush edges, and sparse horizontal streaks.
The marks should help separate cyan and magenta color channels around moving
objects. High contrast binary-looking shapes, no lighting, no objects, no
recognizable symbols, seamless square texture.
```

## Negative Prompt

```text
No color, no shaded material, no paper mockup, no photographed fabric, no
letters, no numbers, no logo, no regular checkerboard, no perfect uniform dot
screen, no frame or border.
```
