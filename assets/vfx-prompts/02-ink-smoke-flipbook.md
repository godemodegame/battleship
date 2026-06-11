# Ink Smoke Flipbook

## Output

- Runtime names: `vfx-ink-smoke-01.png` through `vfx-ink-smoke-08.png`
- Generate: 8 separate square RGBA images
- Source size: 1024x1024
- Runtime: pack to a 2048x1024 4x2 atlas, then downscale if needed
- Blend: alpha
- Screen time: 0.45-0.75 seconds

## Base Prompt

```text
Create one isolated animation frame of compact impact smoke for a stylized
neo-noir mobile naval game. The smoke is not photorealistic: it is a graphic
black and deep-petrol ink shape made from three to five chunky painted lobes,
hard scalloped silhouette cuts, dry-brush holes, sparse halftone grain, and a
few sharp upward hooks. Add very restrained hot-magenta reflected light on
one edge and electric-cyan reflected light on the opposite edge. The base is
narrow and centered; the silhouette rises vertically while staying compact
enough for one board cell. The smoke must remain readable at thumbnail size.

Original adult animated neo-noir visual language, graphic 3D translated into
a hand-painted 2D VFX asset, bold readable silhouette, inked contour breakup,
dry-brush texture, selective halftone grain, hard shadow shapes, stepped
animation energy. Transparent background, fixed camera, fixed center point,
no environment, no text, no logo, no watermark.
```

## Frame Suffixes

```text
Frame 1 of 8: low compressed ink blot, just appearing above the impact.
Frame 2 of 8: three dense lobes rise quickly, strongest magenta rim.
Frame 3 of 8: maximum dark mass, broad graphic silhouette.
Frame 4 of 8: smoke stretches upward and opens one dry-brush hole.
Frame 5 of 8: upper hook bends sideways, base starts breaking apart.
Frame 6 of 8: two separated wisps, more negative space than solid smoke.
Frame 7 of 8: thin torn ink fragments with faint cyan rim.
Frame 8 of 8: nearly dissolved, sparse halftone dust and one small wisp.
```

## Negative Prompt

```text
No realistic volumetric simulation, no soft gray cloud, no mushroom cloud,
no chimney smoke, no fire, no background, no circular vignette, no dense
full-canvas fog, no ship silhouette, no text, no logo, no copied effect.
```
