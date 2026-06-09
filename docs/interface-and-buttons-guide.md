# Interface and Buttons Guide

## Purpose

This document describes the visual interface, menu structure, opponent selection flow, and button behavior for the mobile-first 3D PvP Battleship game.

All interface text must be written in English. The UI should follow the visual direction from `docs/visual-style-guide.md`: adult animated neo-noir, graphic 3D, high contrast, neon tactical overlays, dark glass surfaces, painterly roughness, and strong mobile readability.

## Interface Principles

- Mobile-first portrait layout is the default.
- The 3D scene should remain visible behind most interface layers.
- Buttons should be clear, compact, and easy to tap.
- Primary actions should use strong contrast and icon support.
- The player should always understand the current game state.
- Wallet, network, and transaction states must be visible without overwhelming the screen.
- The interface must never hide the playable board during a turn unless the player is confirming an action.

## Visual Language

The UI should feel like a tactical neon overlay on top of the 3D board.

Core style:

- dark glass panels;
- thin cyan outlines;
- amber pending-state indicators;
- red-magenta danger and enemy accents;
- cold white text;
- sharp icon buttons;
- compact panels with small border radius;
- animated glow pulses for turn and transaction states;
- no large flat dashboard blocks;
- no decorative card stacks.

Recommended colors:

- primary action: cyan glow on dark base;
- secondary action: dark glass with cyan outline;
- pending action: amber;
- dangerous action: red-magenta;
- disabled action: low-contrast blue-gray;
- confirmed action: cyan-white flash.

## App Entry Flow

The first screen should immediately look like the game, not a marketing page.

The entry flow is conditional:

- if no wallet is connected, show the short onboarding;
- onboarding must end with `Connect Wallet`;
- if a wallet is already connected, skip onboarding and route to the main menu or requested match.

Initial state:

- lightweight animated tactical preview in the background;
- one visible stylized ship silhouette;
- dark neon atmosphere;
- compact title lockup;
- main action button.

Primary button:

- `Connect Wallet`

Secondary buttons:

- `How It Works`
- `Settings`

The first screen should not contain long explanations. If the player needs help, `How It Works` can open a short overlay.

## Game Field Loading Screen

The gameplay field must have a dedicated loading screen.

Use it before showing:

- fleet placement board;
- battle board;
- 3D match field;
- any screen where missing models would make the field look incomplete.

Required copy:

- `Loading Battlefield`
- `Loading Models`
- `Preparing Board`

Rules:

- do not show the gameplay field until all required board, ship, and screen-specific effect models are loaded;
- keep wallet, network, and transaction status visible if relevant;
- optional decorative props can continue loading after the field appears;
- if required models fail, show a clear retry state instead of a broken field.

## Main Menu

After wallet connection, the player sees the main menu.

Main menu actions:

- `Play`
- `Create Match`
- `Join Match`
- `Match History`
- `Settings`

The menu should show wallet and network status at the top:

- connected wallet short address;
- Arbitrum Sepolia network status;
- warning state if the wrong network is selected.

If the wallet is connected to the wrong network, the primary visible action should become:

- `Switch to Arbitrum Sepolia`

## Opponent Selection

The player must be able to choose who to play against.

Opponent selection screen title:

- `Choose Opponent`

Available options for MVP:

- `Play Against Friend`
- `Join Friend Match`
- `Open Match`

Future options:

- `Ranked Match`
- `Practice`
- `Tournament`

Only available modes should be active. Future modes can appear as disabled rows only if there is a clear `Coming Soon` state.

## Play Against Friend

This is the main PvP flow for playing against a known friend.

Screen title:

- `Invite Friend`

Required input:

- friend wallet address.

Primary button:

- `Create Match`

Secondary buttons:

- `Paste Address`
- `Scan QR`
- `Back`

After the match is created on-chain, the UI shows:

- match id;
- invited wallet address;
- shareable match link;
- copy button;
- waiting status.

Post-creation buttons:

- `Copy Invite Link`
- `Share Invite`
- `Cancel Match`

Status labels:

- `Waiting for friend`
- `Friend joined`
- `Match cancelled`

The friend invite flow should feel personal and direct. The UI should make it obvious that only the invited wallet can join.

## Join Friend Match

This flow is for a player who received a match link or match id.

Screen title:

- `Join Match`

Inputs:

- match id;
- optional pasted invite link.

Primary button:

- `Join Match`

Secondary buttons:

- `Paste Link`
- `Back`

Validation states:

- `Checking match`
- `Match found`
- `Wrong wallet`
- `Match already started`
- `Match unavailable`

If the connected wallet is not the invited wallet, show:

- `This invite is for another wallet`

The player should not need to understand contract details to join. The UI should make the next action obvious.

## Open Match

Open match allows the player to create a match that any second player can join.

Screen title:

- `Open Match`

Primary button:

- `Create Open Match`

Secondary buttons:

- `Browse Open Matches`
- `Back`

Open match list item should show:

- match id;
- creator short address;
- creation time;
- status;
- `Join` button.

This mode is useful after the friend flow works. It should not block the MVP friend-match path.

## Match Lobby

The match lobby appears after two players are known but before the game starts.

Lobby information:

- player address;
- opponent address;
- match id;
- current network;
- placement status;
- readiness status.

Primary buttons:

- `Auto Place`
- `Confirm Fleet`
- `Start Match`

Secondary buttons:

- `Reset Fleet`
- `Back to Menu`
- `Forfeit`

Status labels:

- `Place your fleet`
- `Encrypting fleet`
- `Confirm in wallet`
- `Submitting fleet`
- `Validating placement`
- `Waiting for opponent`
- `Ready`
- `Starting match`

The lobby should show the player's own 3D board and ships. The opponent board should remain sealed.

## Fleet Placement UI

The placement interface should prioritize touch accuracy.

Controls:

- ship selector;
- rotate button;
- auto place button;
- reset button;
- confirm button.

Button labels:

- `Rotate`
- `Auto Place`
- `Reset`
- `Confirm Fleet`

Placement states:

- valid ship placement: cyan outline;
- invalid ship placement: red-magenta outline;
- selected ship: amber outline;
- confirmed fleet: cyan-white confirmation flash.

The player should never need tiny drag handles. Ships should be large enough to drag, rotate, and place comfortably on a phone.

## Battle HUD

The battle screen is the core interface.

Top area:

- match id;
- current turn;
- wallet/network status;
- compact opponent address.

Center area:

- 3D enemy board when attacking;
- own board available through a tab or swipe;
- selected target cell;
- attack result effects.

Bottom action area:

- selected coordinate;
- primary action button;
- turn status;
- transaction status.

Primary battle button:

- `Fire`

Secondary battle buttons:

- `Cancel Target`
- `View Fleet`
- `Move History`
- `Forfeit`

Turn labels:

- `Your Turn`
- `Opponent Turn`
- `Resolving Shot`
- `Game Over`

Attack result labels:

- `Miss`
- `Hit`
- `Sunk`
- `Victory`
- `Defeat`

## Board View Toggle

The player needs a simple way to switch between boards.

Tabs:

- `Target`
- `Fleet`

`Target` shows the opponent board with hidden unattacked cells and public attack results.

`Fleet` shows the player's own board with ships, incoming attacks, hits, and damage.

The active tab should use cyan. The inactive tab should use dark glass with a thin outline.

## Confirmation Sheets

On-chain actions need confirmation before opening the wallet.

Use a bottom sheet for confirmations:

- short action title;
- one-line consequence;
- estimated network action state if available;
- primary confirm button;
- secondary cancel button.

Examples:

- `Confirm Fleet`
- `Fire at B7`
- `Create Match`
- `Join Match`
- `Forfeit Match`

Primary confirm buttons:

- `Confirm`
- `Fire`
- `Create`
- `Join`

Danger confirm button:

- `Forfeit`

The sheet should not use long explanations. It should be fast and clear.

## Wallet and Transaction States

Because the game is fully on-chain, transaction state is part of the gameplay interface.

Required states:

- `Connect Wallet`
- `Switch Network`
- `Confirm in Wallet`
- `Loading Battlefield`
- `Transaction Pending`
- `Transaction Confirmed`
- `Transaction Failed`
- `Resolving On-chain`
- `Resolving Shot`

Visual treatment:

- wallet confirmation: amber pulse;
- pending transaction: amber animated ring;
- confirmed transaction: cyan-white snap;
- failed transaction: red-magenta flash;
- FHE resolving state: sealed cyan shimmer.

The player should always know whether the game is waiting for them, their wallet, the blockchain, Fhenix resolution, or the opponent.

## Button System

Buttons should be consistent across the game.

Primary button:

- used for the main next action;
- filled dark cyan or cyan glow;
- cold white label;
- optional icon on the left;
- minimum touch height: 48 px.

Secondary button:

- dark glass fill;
- thin cyan outline;
- cold white label;
- used for navigation or alternate actions.

Danger button:

- dark base;
- red-magenta outline or fill;
- used for `Forfeit`, `Cancel Match`, and destructive actions.

Icon button:

- square or circular compact button;
- used for rotate, copy, share, settings, close, and history;
- must include tooltip or accessible label.

Disabled button:

- low contrast;
- no glow;
- must show why the action is unavailable through nearby status text.

## Core Button Labels

Global:

- `Connect Wallet`
- `Switch Network`
- `Settings`
- `Back`
- `Close`

Menu:

- `Play`
- `Create Match`
- `Join Match`
- `Match History`

Opponent selection:

- `Choose Opponent`
- `Play Against Friend`
- `Join Friend Match`
- `Open Match`

Friend match:

- `Invite Friend`
- `Paste Address`
- `Create Match`
- `Copy Invite Link`
- `Share Invite`
- `Cancel Match`

Fleet:

- `Auto Place`
- `Rotate`
- `Reset`
- `Confirm Fleet`

Battle:

- `Fire`
- `Cancel Target`
- `View Fleet`
- `Move History`
- `Forfeit`

Results:

- `Play Again`
- `Back to Menu`
- `View Match`

## Error Messages

Error messages must be short and actionable.

Recommended messages:

- `Wrong network`
- `Switch to Arbitrum Sepolia`
- `Wallet not connected`
- `Invalid address`
- `This invite is for another wallet`
- `Match not found`
- `Match already started`
- `Cell already attacked`
- `Not your turn`
- `Fleet placement invalid`
- `Transaction rejected`
- `Transaction failed`
- `Shot resolution pending`

Avoid technical raw errors unless the player opens a developer detail view.

## Game Over Screen

The game over screen should preserve the 3D scene.

Victory state:

- bright cyan-white win flash;
- opponent board dimmed;
- final move highlighted;
- title: `Victory`.

Defeat state:

- red-magenta edge light;
- own board damage visible;
- title: `Defeat`.

Buttons:

- `View Match`
- `Play Again`
- `Back to Menu`

Optional stats:

- turns;
- hits;
- misses;
- accuracy;
- sunk ships.

Stats should be compact and readable.

## Accessibility and Mobile Usability

Minimum requirements:

- touch targets at least 48 px high;
- high contrast text;
- no tiny labels on critical controls;
- clear selected-cell state;
- no important information conveyed by color alone;
- wallet and network states readable without opening settings;
- safe areas respected on iOS and Android browsers;
- portrait layout must be fully functional.

## MVP Interface Scope

The MVP interface must include:

- first launch screen;
- conditional onboarding for disconnected wallets;
- wallet connection;
- main menu;
- opponent selection;
- play against friend flow;
- join friend match flow;
- open match placeholder or simple open match flow;
- match lobby;
- fleet placement screen;
- battle HUD;
- game field loading screen;
- confirmation sheets for on-chain actions;
- transaction states;
- game over screen.

The first version does not need:

- ranked interface;
- tournament lobby;
- chat;
- clan screens;
- marketplace screens;
- ship customization UI;
- long onboarding.
