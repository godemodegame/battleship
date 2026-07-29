# Burst Plate Prompt (9-slice)

## Runtime Asset

`ui-burst-plate.webp` → background of `.toast` (text variant) and
`.battle-banner`

## Slot

Result and state announcements that are plain text rather than a drawn word
sprite: reconnect notices, "OPPONENT TURN", timeout banners.

## Prompt

```text
Create one 9-slice comic starburst announcement plate. A spiky asymmetric
burst outline in near-black #14121C ink, roughly 20 irregular points of varying
length, filled with cream #F7EFDD, with a hard flat offset ink shadow 4 px
right and 5 px down and no blur. The interior carries a faint halftone dot tint
at 12 percent ink. Points must stay short enough that the flat top, bottom,
left, and right edge segments remain repeatable for 9-slice stretching, and all
larger spikes sit inside a 56x56 pixel corner box. 256x128 pixel source canvas,
transparent RGBA outside the burst, no lettering inside. Original design, not
based on any existing comic, show, game, brand, artist, or protected visual
identity.
```

## Negative Prompt

```text
No text, no letters, no exclamation mark, no speech-bubble tail, no radial
speed lines, no glow, no blurred shadow, no gradient, no gloss, no watermark,
no perspective, no spikes crossing the flat edge segments.
```
