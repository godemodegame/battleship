# Visual Style Guide

## Direction

The game should feel like a stylish adult animated neo-noir thriller translated into a mobile-first 3D Battleship game. The user-provided reference, `Love, Death + Robots: The Witness`, is useful as a broad mood benchmark: intense color, graphic 3D, cinematic tension, neon-lit urban surrealism, and a painted-comic finish.

The game must not copy any specific characters, costumes, scenes, camera shots, layouts, or exact rendering from that episode. The project needs its own visual identity built from descriptive traits: high-contrast neo-noir lighting, stylized 3D forms, expressive color blocks, ink-like contours, painterly textures, and a surreal tactical ocean-board world.

## Core Pillars

- Graphic 3D, not flat UI: the board, ships, attacks, and effects should feel dimensional and tactile.
- Neo-noir energy: dark environments, hard rim lights, neon reflections, saturated highlights, and dramatic shadows.
- Comic-painterly surface: models should have hand-painted texture variation, visible brush-like roughness, and subtle halftone or ink details.
- Mobile readability first: every visual effect must support quick understanding on a vertical phone screen.
- Confidential war-game fantasy: hidden cells, encrypted state, wallet actions, and on-chain events should have a visual language of sealed data, glowing ciphertext, and tactical signals.
- Surreal ocean city mood: the sea grid can feel like a dreamlike holographic harbor rather than a literal navy simulator.

## Keywords

Use these words when describing the style:

- adult animated neo-noir;
- graphic 3D;
- cinematic mobile game;
- high contrast;
- neon reflections;
- inked contours;
- painterly roughness;
- hand-painted material breakup;
- saturated cyan, magenta, amber, and red accents;
- dark glass water;
- tactical holographic grid;
- encrypted signal glow;
- stylized naval silhouettes;
- tense, elegant, sharp.

Avoid these words as primary direction:

- cute;
- toy-like;
- low-poly;
- realistic military simulator;
- flat spreadsheet board;
- generic sci-fi;
- clean corporate dashboard;
- soft pastel;
- beige;
- one-color purple theme;
- exact copy of an existing show, episode, character, or artist.

## Color Palette

The game should use a dark base with controlled bursts of saturated color.

Primary base colors:

- `#07080D` near-black;
- `#101622` deep blue-black;
- `#16242A` dark petrol;
- `#1B1D2A` night violet-black.

Core accent colors:

- `#21F4FF` electric cyan for grid lines, valid targeting, and FHE energy;
- `#FF2EA6` hot magenta for danger, enemy signals, and impact highlights;
- `#FFB000` signal amber for pending actions, wallet confirmations, and turn state;
- `#FF3B30` impact red for direct hits and critical alerts;
- `#E8F7FF` cold white for readable labels and sharp specular highlights.

Usage ratio:

- 65 percent dark base;
- 20 percent cool cyan and blue tactical light;
- 10 percent magenta or red threat accents;
- 5 percent amber interaction and pending states.

The UI must not become a single-hue neon wash. Cyan, magenta, amber, red, and cold white should each have a role.

## Lighting

Lighting should be dramatic and readable:

- strong rim lights on ships;
- neon reflections on water and metallic surfaces;
- deep shadows under models;
- clear highlight color for interactive cells;
- short pulses for turn changes and attack selection;
- no over-bright bloom that hides board coordinates on mobile.

Recommended setup:

- dark ambient light;
- one cool cyan key light;
- one magenta or red side light for enemy threat;
- small amber practical lights for active UI or pending transaction moments;
- subtle volumetric haze only when it does not reduce clarity.

## Rendering Style

The target rendering style is a hybrid between stylized PBR and graphic animation:

- believable shape and material response;
- exaggerated silhouettes;
- painted roughness and color variation;
- ink-like outlines or contour shading;
- selective halftone, hatch, or brush texture overlays;
- high-contrast shadows;
- controlled bloom and chromatic edge accents.

The game should not look fully photorealistic. It should feel crafted, animated, and expressive.

## Board Style

The board is the center of the game. It must be visually strong but easy to play.

Board direction:

- 10 by 10 tactical ocean grid;
- dark reflective water surface under the grid;
- thin cyan grid lines for neutral cells;
- amber outline for selected attack;
- red-magenta flare for hits;
- pale blue splash for misses;
- cracked glowing outline for sunk ships;
- hidden enemy cells should look sealed or encrypted, not empty.

The enemy board should communicate uncertainty. Unattacked cells can use a subtle encrypted shimmer, dark glass tile, or sealed hologram effect.

## Ship Style

Ships should be stylized and readable from a mobile camera distance.

Ship direction:

- strong, simplified silhouettes by class;
- dark hulls with cyan tactical edge lights;
- magenta/red threat strips for enemy variants;
- painted metal roughness, not clean plastic;
- slightly exaggerated towers, fins, rails, and antenna shapes;
- no exact real-world ship replicas;
- no flags, national markings, or realistic military branding.

The player's own ships should look visible and detailed. Enemy ships should remain hidden until rules allow a reveal.

## Effects Style

Attack effects should be short, punchy, and readable.

Miss:

- fast projectile trail;
- cold splash;
- brief mist plume;
- fading circular ripple on the grid.

Hit:

- red-magenta impact flash;
- shard-like sparks;
- black smoke with painted edges;
- glowing damage mark on the attacked cell.

Sunk:

- stronger silhouette break;
- red/cyan crack lines;
- short collapse or submerge motion;
- final dark wreck marker.

On-chain and FHE moments:

- encrypted cells pulse as sealed data;
- pending transactions use amber loading pulses;
- confirmed transactions snap into cyan-white light;
- failed actions flash red with restrained intensity.

## UI Style

All UI text must be English.

The UI should feel like a tactical overlay placed on top of the 3D scene:

- sharp panels;
- small radius corners;
- thin lines;
- high contrast text;
- icon-first buttons where possible;
- compact controls for mobile;
- no large marketing hero sections inside the game;
- no decorative card stacks;
- no explanatory blocks that clutter the battle view.

Important player actions need clear labels:

- `Connect Wallet`;
- `Create Match`;
- `Invite Friend`;
- `Join Match`;
- `Auto Place`;
- `Confirm Fleet`;
- `Fire`;
- `Forfeit`;
- `Switch Network`;
- `Resolving Shot`;
- `Your Turn`;
- `Opponent Turn`.

## Camera

The camera should be designed for portrait mobile screens first.

Battle camera:

- angled top-down view;
- enough perspective to feel 3D;
- board cells must stay tappable;
- selected cell should be obvious;
- attack animation can briefly shift camera focus, then return to the playable view.

Lobby and match setup camera:

- close-up ship silhouettes;
- rotating tactical board preview;
- neon reflections and strong composition;
- no dense background detail that competes with buttons.

## Animation

Animation should be expressive but fast:

- menu objects can have slow idle motion;
- board cells can pulse gently;
- ship idle motion can be subtle rocking;
- attacks should resolve with a strong 0.5 to 1.5 second animation;
- pending blockchain states can loop calmly without feeling broken;
- avoid long non-skippable animations because every turn involves wallet and on-chain actions.

The style can use slightly stepped animation timing for a graphic animated feel, while input and camera movement should remain responsive.

## Mobile Performance

All assets must be designed for real-time mobile rendering.

Guidelines:

- prefer `.glb` for runtime models;
- use compressed textures where possible;
- keep individual ship models lightweight;
- create LOD versions for ships and effects;
- avoid excessive particle counts;
- use instancing for grid cells;
- avoid large transparent surfaces stacked over each other;
- keep texture sizes purposeful: 512 or 1024 for most props, 2048 only for hero board or flagship assets.

## Asset Naming

Use lowercase kebab-case for asset files:

- `tactical-ocean-board.glb`;
- `ship-carrier.glb`;
- `ship-battleship.glb`;
- `ship-cruiser.glb`;
- `ship-destroyer.glb`;
- `ship-submarine.glb`;
- `attack-projectile.glb`;
- `vfx-hit-impact.glb`.

Prompt files should use the same base name:

- `ship-carrier.md`;
- `vfx-hit-impact.md`.

## Prompt Rule

Generation prompts must describe the project's original visual language. Do not prompt a model to copy a named show, episode, living artist, exact frame, exact character, or protected design.

Use descriptive phrasing instead:

- "adult animated neo-noir graphic 3D";
- "high contrast neon-lit tactical ocean";
- "ink-like contours and painterly roughness";
- "stylized mobile game asset";
- "original design, not based on existing IP".
