# Panel Frame Prompt (9-slice)

## Runtime Asset

`ui-panel-frame.webp` → `border-image` on `.panel`

## Slot

Modal dialogs, the game-over result card, and every on-chain
`section.onchain-battle.panel` / `.onchain-placement.panel`.

## Prompt

```text
Create one 9-slice comic panel border drawn as a hand-inked brush rectangle.
Near-black #14121C contour roughly 10 px thick on a 256x256 pixel canvas, with
the honest wobble of a brush line: the weight swells and thins slightly along
each edge, the corners are square with a small overshoot where two strokes
cross, and one corner carries a faint dry-brush break. Inside the contour, a
second thin ruled line inset 14 px at 25 percent ink opacity — the classic
double-ruled printed panel edge. The rectangle interior is fully transparent so
the paper fill shows through. Keep all corner ornament inside a 48x48 pixel
corner box and keep each edge segment flat and repeatable so the frame can be
stretched as a 9-slice. Transparent RGBA, 256x256 source canvas, no fill, no
shadow. Original design, not based on any existing comic, show, game, brand,
artist, or protected visual identity.
```

## Negative Prompt

```text
No drop shadow, no glow, no bevel, no gloss, no gradient, no rounded speech
bubble, no torn paper edge, no tape or staples, no text, no watermark, no
decorative flourishes reaching past the corner box, no perspective, no
non-repeatable edge detail.
```
