# Turn Banner Word Prompts

## Runtime Assets

- `ui-word-your-turn.webp`
- `ui-word-enemy-turn.webp`

Both are shown as a `.toast` at the top third of the battle screen on every
turn change, for roughly 0.9 s, over the dark 3D board.

## Prompt — YOUR TURN

```text
Create one isolated 2D comic word sprite containing exactly the text "YOUR
TURN!" as the player's turn-start announcement in a mobile Battleship game.
Two lines: "YOUR" above "TURN!", hand-inked comic display caps, tilted about 2
degrees counter-clockwise. Fill ink blue #2F6FD0 with a cold-white #FFFAF0
sheen on the top edge of each letter, a thick near-black #14121C outline, and a
hard flat ink shadow offset down-right with no blur. Add four short forward
motion streaks on the left side and a thin cream #F7EFDD halo so the word
survives over a dark background. Compact silhouette, readable at 220 px wide on
a phone. Transparent RGBA, 1024x512 source canvas, generous uncropped padding,
exact spelling "YOUR TURN!", no other text. Original design, not based on an
existing comic, show, game, font, logo, artist, or protected visual identity.
```

## Prompt — ENEMY TURN

```text
Create one isolated 2D comic word sprite containing exactly the text "ENEMY
TURN" as the opponent's turn-start announcement in a mobile Battleship game.
Two lines: "ENEMY" above "TURN", hand-inked comic display caps, tilted about 2
degrees clockwise. Fill hot pink #F8508F with impact red #E8402E on the lower
edge of each letter, a thick near-black #14121C outline, and a hard flat ink
shadow offset down-right with no blur. Add three short backward motion streaks
on the right side and a thin cream #F7EFDD halo so the word survives over a
dark background. Compact silhouette, readable at 220 px wide on a phone.
Transparent RGBA, 1024x512 source canvas, generous uncropped padding, exact
spelling "ENEMY TURN", no other text. Original design, not based on an existing
comic, show, game, font, logo, artist, or protected visual identity.
```

## Negative Prompt (both)

```text
No misspelling, no swapped words, no extra text, no arrow icons, no clock, no
hourglass, no neon glow, no chrome gradient, no 3D extrusion, no background
panel, no ship, no water, no speech bubble, no watermark, no cropped outline.
```
