# Comic HUD & Menu Art Prompt Pack

## Purpose

This pack defines one image-generation prompt per 2D asset needed by the comic
HUD layer (`src/styles.css`, `src/ui/*`, `src/onchain/**` screens). The UI is
already complete without these files — every surface ships with a procedural
CSS stand-in — so each asset is an *upgrade slot*, not a blocker.

The direction is the printed-comic HUD layer described in
`docs/visual-style-guide.md` ("2D HUD Layer"): cream paper plates, thick
near-black ink contours, flat saturated fills, halftone dot texture, hard
offset shadows, and display lettering with an inked outline. The 3D world
underneath stays neo-noir; these assets must never carry neon bloom, scanlines,
glass blur, or chrome gradients.

## Palette

| Role | Hex | Use |
| --- | --- | --- |
| Ink | `#14121C` | every contour, shadow, and dark text |
| Paper | `#F7EFDD` | primary plate fill |
| Paper shade | `#E9DCC0` | second plane, stat cards |
| Paper dim | `#D8C8A6` | disabled card stock |
| Amber | `#FFC63C` | primary action, victory, pending |
| Impact red | `#E8402E` | fire action, hits, danger |
| Ink blue | `#2F6FD0` | player fleet, your-turn, links |
| Comic cyan | `#2FC0E0` | encryption / on-chain accents |
| Hot pink | `#F8508F` | enemy fleet, defeat |
| Green | `#46B96B` | confirmed / won |
| Cold white | `#FFFAF0` | text on red and on ink |

## Runtime Map

| Asset | Slot | Consumer |
| --- | --- | --- |
| `ui-halftone-tile.webp` | `--tex-halftone` | every `.panel`, caption box, grid |
| `ui-paper-tile.webp` | `--tex-paper` | `.panel` base sheet |
| `ui-panel-frame.webp` | 9-slice `border-image` on `.panel` | modal, result, on-chain panels |
| `ui-caption-plate.webp` | 9-slice on `.topbar-status` | battle + placement narrator strip |
| `ui-burst-plate.webp` | background of `.toast` / `.battle-banner` | text results, banners |
| `ui-title-lockup.webp` | replaces `.title-lockup h1` text | home hero |
| `ui-word-victory.webp` | replaces `.result.won h1` | game over |
| `ui-word-defeat.webp` | replaces `.result.lost h1` | game over |
| `ui-word-your-turn.webp` | turn-change toast | battle HUD |
| `ui-word-enemy-turn.webp` | turn-change toast | battle HUD |
| `ui-icon-sheet.webp` | trace source for `--ic-*` masks | every `data-ic` control |
| `ui-ship-chips.webp` | `.chip-cells` replacement | placement fleet tray |
| `ui-grid-markers.webp` | `.battle-cell.miss/.hit/.sunk` | DOM battle grid |
| `ui-spinner-frames.webp` | `.loading-spinner` | status overlays |

## Output Rules

- Transparent RGBA (PNG source) unless the asset is an explicitly seamless tile.
- Deliver source PNG in this folder, then convert to WebP under
  `public/textures/ui-comic/` and point the CSS variable at it.
- Tiles must be genuinely seamless at the stated size; verify by 3x3 tiling.
- 9-slice frames must keep the corner art inside the stated corner box and the
  edges flat/repeatable, otherwise `border-image` will smear.
- Ink contour weight is consistent across the family: roughly 3 px at a 1x
  render of a 375 px-wide phone screen. Scale accordingly per canvas.
- Ship the lettering assets at 2x the largest on-screen size.
- Keep every asset under 120 KB as WebP; tiles under 20 KB.
- No UI chrome from other styles: no bevels, no gloss, no drop-shadow blur, no
  neon glow, no gradient meshes, no scanlines.
- Generate the whole family with the same model, seed family, contour weight,
  and halftone density so the HUD reads as one printed sheet.

## Typography QA

Image generators corrupt lettering. Reject an output with a wrong letter,
missing punctuation, duplicated glyph, extra word, watermark, or cropped
outline. If exact text stays unreliable, keep the generated burst and texture
as reference art and redraw the lettering by hand at matching ink weight — the
CSS fallback (Bangers with an ink stroke) already ships and is a valid final
answer for any word asset.

## Prompt Files

- `prompts/01-halftone-tile.md`
- `prompts/02-paper-tile.md`
- `prompts/03-panel-frame.md`
- `prompts/04-caption-plate.md`
- `prompts/05-burst-plate.md`
- `prompts/06-title-lockup.md`
- `prompts/07-word-victory.md`
- `prompts/08-word-defeat.md`
- `prompts/09-word-turn-banners.md`
- `prompts/10-icon-sheet.md`
- `prompts/11-ship-chips.md`
- `prompts/12-grid-markers.md`
- `prompts/13-spinner-frames.md`
