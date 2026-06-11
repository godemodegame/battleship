# Hit Flash Cards

## Output

- Runtime names: `vfx-hit-flash-01.png` through `vfx-hit-flash-06.png`
- Generate: 6 separate square RGBA images
- Source size: 1024x1024
- Runtime size: 512x512 each or one 1024 atlas
- Blend: additive
- Screen time: 1-2 rendered frames per card

## Base Prompt

```text
Create one isolated graphic impact-flash frame for a successful naval hit in
a stylized mobile strategy game. A compact asymmetric starburst erupts from
the exact center: a cold-white needle-shaped kernel, a hot magenta and impact
red middle burst, and a thin electric-cyan outer accent. Build the silhouette
from sharp hand-painted wedges, broken ink slashes, triangular spark shards,
and two or three deliberately uneven radial lobes. The form must feel violent
and instantaneous without becoming a round fireball. Strong empty space
between shapes, crisp center, rough dry-brush edges, subtle halftone breakup,
slight cyan and magenta edge misregistration. Readable from an angled top-down
camera and contained inside one board cell.

Original adult animated neo-noir visual language, graphic 3D translated into
a hand-painted 2D VFX asset, bold readable silhouette, inked contour breakup,
dry-brush texture, selective halftone grain, hard shadow shapes, stepped
animation energy. Transparent background, centered isolated asset, no scene,
no text, no logo, no watermark.
```

## Frame Suffixes

Use one suffix per generated image while keeping the same seed and framing:

```text
Frame 1 of 6: tiny compressed pre-flash, mostly cold white, very narrow.
Frame 2 of 6: explosive maximum expansion, longest red-magenta wedges.
Frame 3 of 6: cyan shock edge separates from the shrinking core.
Frame 4 of 6: broken spark shards outrun the central burst.
Frame 5 of 6: only thin red slashes and cyan fragments remain.
Frame 6 of 6: almost empty, three fading brush fragments near the center.
```

## Negative Prompt

```text
No circular sun shape, no smooth symmetrical star, no realistic fire, no
orange-only explosion, no smoke cloud, no environment, no ship, no water, no
UI, no text, no logo, no soft glow filling the canvas, no copied screen frame.
```
