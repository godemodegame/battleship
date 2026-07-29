# Ship Chip Silhouettes Prompt

## Runtime Asset

`ui-ship-chips.webp` → replaces the `.chip-cells` pip rows in the placement
fleet tray

## Slot

`.fleet-tray .chip` in `PlacementScreen` and the on-chain placement panel. Each
chip is roughly 64 px wide on a phone and sits on cream paper, so the art must
read at thumbnail size against `#F7EFDD`.

## Prompt

```text
Create one reference sheet of 6 top-down warship silhouettes drawn as printed
comic ink art, arranged left to right in a single row on a transparent
background, all bows pointing right, all drawn at the same scale so their
relative lengths are honest.

From left: a 5-cell carrier with a flat deck and island tower; a 4-cell
battleship with three turrets; a 3-cell cruiser with a tall mast; a 3-cell
submarine with a low hull and conning tower; a 2-cell destroyer with a single
turret; a 1-cell patrol boat.

Each hull is filled flat ink blue #2F6FD0 with a cold-white #FFFAF0 deck line,
wrapped in a thick near-black #14121C contour, plus two short ink hatch marks
per hull for texture. No wake, no water, no shadow. Every silhouette must stay
readable at 56 px wide on cream paper. Transparent RGBA, 1536x512 source
canvas, equal padding between ships. Original designs, not based on any real
navy vessel, existing game, brand, or protected visual identity.
```

## Negative Prompt

```text
No water, no wake, no ocean background, no perspective or 3D view, no photo
realism, no rivets or panel-line detail, no national markings, no flags, no
text, no numbers, no labels, no shadow, no glow, no gradient, no camouflage
pattern, no varying scale between ships.
```
