# Title Lockup Prompt

## Runtime Asset

`ui-title-lockup.webp` → replaces the text in `.title-lockup h1` on the home
screen (the CSS lettering stays as fallback)

## Slot

Home screen hero, rendered at roughly 320 px wide on a 375 px phone.

## Prompt

```text
Create one isolated 2D comic title lockup containing exactly the two words
"ENCRYPTED" over "BATTLESHIP", stacked on two lines, left-aligned, tilted about
2 degrees counter-clockwise. Use heavy condensed hand-inked comic display caps
with slight per-letter irregularity, as if brushed and then inked. Fill the
letters cream #F7EFDD, wrap them in a thick near-black #14121C outline roughly
8 percent of the cap height, and drop a hard flat ink shadow offset down-right
with no blur. Cut a narrow amber #FFC63C highlight band across the top third of
"BATTLESHIP" only. Behind the lettering, add three short ink speed streaks and
a small halftone dot patch in comic cyan #2FC0E0 at the lower-left, both
attached tight to the word block. The silhouette must stay compact and readable
at 320 px wide on a phone. Transparent RGBA, 2048x1024 source canvas, generous
uncropped padding, exact spelling "ENCRYPTED BATTLESHIP", no other text.
Original design, not based on an existing comic, show, game, font, logo,
artist, or protected visual identity.
```

## Negative Prompt

```text
No misspelling, no extra words, no tagline, no subtitle, no neon glow, no
chrome or metal gradient, no bevel, no 3D extrusion, no lens flare, no ship, no
water, no background panel, no rectangular card, no watermark, no cropped
outline, no realistic photo texture.
```
