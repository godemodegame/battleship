# Icon Sheet Prompt

## Runtime Asset

`ui-icon-sheet.webp` → trace source for the `--ic-*` SVG masks in
`src/styles.css`

## Slot

Every `data-ic` control: `.btn[data-ic]`, `.btn.fire`, and `.icon-btn[data-ic]`.

## Important

The runtime consumes **inline SVG masks**, not this bitmap. Generators are
unreliable for tiny glyph geometry, so this sheet is reference art: generate
it, pick the strongest glyphs, then redraw them as 24x24 stroked SVG paths and
paste them into the `--ic-*` variables at `stroke-width: 2.6`. Ship the sheet
so the redraw has a single consistent hand to follow.

## Prompt

```text
Create one flat icon reference sheet of 18 hand-inked comic line icons on a
transparent background, arranged in a strict 6-column by 3-row grid with equal
spacing, each glyph centered in its own square cell and drawn to the same
optical weight. All glyphs are near-black #14121C outline only, no fill, with a
brush-inked line of even thickness (about 9 percent of the cell height), round
line caps, and a slight hand-drawn wobble — confident, not shaky.

Row 1: targeting reticle; crosshair; crossed swords; bulleted list; globe with
meridians; circled letter i information mark.
Row 2: plus sign; left chevron back arrow; circular rotate arrow; crossing
shuffle arrows; check mark; trash bin.
Row 3: sign-in door with arrow; power symbol; two-way switch arrows; flag on a
pole; speaker with two sound waves; speaker with a cross.

Every icon must be legible at 20 px, sit inside its cell with 12 percent
padding, and read as one consistent set. Transparent RGBA, 1536x768 source
canvas. Original designs, not based on any existing icon set, brand, app, or
protected visual identity.
```

## Negative Prompt

```text
No color, no fill, no gradient, no shadow, no glow, no rounded-rectangle badge
behind the glyphs, no text, no labels, no numbers, no watermark, no varying
line weight between icons, no 3D, no skeuomorphic detail, no extra icons beyond
the 18 requested, no glyph touching its cell edge.
```
