# Caption Plate Prompt (9-slice)

## Runtime Asset

`ui-caption-plate.webp` → `border-image` on `.topbar-status`

## Slot

The narrator strip at the top of the battle and placement HUD: it holds the
turn label ("YOUR TURN", "OPPONENT TURN") and the move counter.

## Prompt

```text
Create one 9-slice comic caption box — the small rectangular narration plate
printed in the corner of a comic panel. Cream #F7EFDD fill, near-black #14121C
hand-inked contour roughly 7 px thick on a 192x96 pixel canvas, slightly
rounded corners, and a hard offset ink shadow drawn as a solid flat shape 4 px
right and 5 px down with no blur. Add a faint halftone dot tint at 12 percent
ink inside the fill and a single thin ruled line inset 8 px at 20 percent ink.
The top-left corner carries a small torn-tape notch of ink as the only
ornament. Keep the corner art inside a 32x32 pixel corner box and keep the edge
segments flat and repeatable for 9-slice stretching. Transparent RGBA outside
the plate, 192x96 source canvas. Original design, not based on any existing
comic, show, game, brand, artist, or protected visual identity.
```

## Negative Prompt

```text
No blurred shadow, no glow, no bevel, no gloss, no gradient fill, no speech
bubble tail, no text, no numbers, no watermark, no perspective, no
non-repeatable edge detail, no neon colors.
```
