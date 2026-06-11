# Shockwave And Crack Decals

## Output

- Runtime names: `vfx-shockwave-ring.png`, `vfx-impact-crack-decal.png`
- Generate: 2 separate square RGBA images
- Source size: 1024x1024
- Runtime size: 512x512 each
- Blend: additive for ring, alpha/additive mix for crack

## Shockwave Prompt

```text
Create an isolated top-down shockwave ring decal for a graphic neo-noir
impact. The ring is thin, uneven, incomplete, and hand-painted rather than
geometrically perfect. Its strongest edge is cold white and electric cyan,
with three short hot-magenta breaks and tiny outward ink splinters. The center
is completely transparent. Use dry-brush erosion, subtle halftone breakup,
and a slight cyan-magenta registration offset. The ring must remain readable
when scaled over one mobile board cell. Transparent background, no scene.
```

## Crack Prompt

```text
Create an isolated top-down damage crack decal for a dark glass-and-metal
naval board cell. A compact impact center branches into five to seven angular
cracks. The deepest fissures are near-black; selected inner edges glow impact
red and hot magenta; two short outer branches carry a faint electric-cyan
residual signal. The network is asymmetric, sharply inked, and sparse enough
that the cell underneath remains visible. Transparent background, no tile,
no environment, no text.
```

## Negative Prompt

```text
No perfect vector circle, no magic portal, no occult symbol, no spiderweb
covering the entire image, no bullet-hole photograph, no concrete wall, no
background tile, no text, no logo, no soft bloom covering the cracks.
```
