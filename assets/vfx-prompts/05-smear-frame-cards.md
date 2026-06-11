# Smear-Frame Cards

## Output

- Runtime names: `vfx-smear-arc.png`, `vfx-smear-impact.png`,
  `vfx-smear-camera-cut.png`
- Generate: 3 separate square RGBA images
- Source size: 1024x1024
- Runtime size: 512x512 each
- Blend: additive or alpha depending on the card
- Screen time: exactly 1-2 rendered frames

## Arc Smear Prompt

```text
Create one isolated crescent-shaped motion-smear card for a projectile making
a fast curved move. Use three long dry-brush arcs with a cold-white leading
edge, signal-amber center, and offset electric-cyan and hot-magenta edge
fragments. The crescent is asymmetric, tapered at both ends, and broken by
transparent gaps. It should read as one explosive hand-drawn animation frame,
not as a permanent glowing ring. Transparent background, centered, no scene.
```

## Impact Smear Prompt

```text
Create one isolated diagonal impact-smear card: five jagged brush wedges
crossing through a compact center, with impact red and hot magenta dominating,
small cold-white cuts, and a thin cyan misregistered edge. Uneven spacing,
bold black negative gaps, dry ink texture, one-frame animation punctuation,
readable at thumbnail size. Transparent background, no scene.
```

## Camera-Cut Smear Prompt

```text
Create one isolated full-frame directional smear texture for a very brief
camera transition. Broad near-black and deep-petrol brush bands sweep from
lower left to upper right, interrupted by thin cyan, magenta, and cold-white
streaks. Strong transparent gaps remain between bands. The texture feels like
paint dragged across a cel for one frame, energetic but not noisy.
Transparent background, no objects, no text, no logo.
```

## Negative Prompt

```text
No smooth vector swoosh, no corporate logo shape, no complete circle, no
magic rune, no weapon, no character, no environment, no text, no border, no
soft airbrush, no copied animation frame.
```
