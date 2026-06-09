# Project Description

## Project Idea

The project is a mobile-first 3D PvP browser game based on Battleship mechanics. Players connect crypto wallets, create or join matches, place their fleets, and take turns attacking the opponent's board.

The main feature of the game is a fully on-chain gameplay loop with private state. Ships and hidden match data must not be stored on a centralized server or validated only by the frontend. Smart contracts must be the authoritative source of truth.

The game should feel like a modern mobile 3D game. The board, ships, shots, hits, and ship destruction should be represented in a three-dimensional visual style, not just as a flat table.

## Game Language

The entire game must be fully in English.

This applies to everything the player sees:

- menus;
- buttons;
- hints;
- error messages;
- match statuses;
- turn results;
- victory and defeat screens;
- onboarding;
- wallet and connection flow;
- the mobile app, if it is added later.

Project documentation should also be written in English so the whole codebase, design process, and gameplay language stay consistent.

## Platforms

The required platform for the first version is the mobile browser.

The game must run on a mobile phone without requiring app installation. The main usage flow is:

1. The player opens the game website on a phone.
2. The player connects a wallet.
3. The player creates a match or joins an existing match.
4. The player plays a PvP match in the browser.

A mobile app can be added as an extra client. It must not replace the browser version. It should be an additional shell or separate client for the same on-chain game.

Possible mobile app options:

- PWA with install-to-home-screen support;
- Capacitor app built around the web client;
- React Native client if a more native mobile UX is needed later.

## Game Mode

The main mode is PvP.

The first version only needs a one versus one mode:

- player versus player;
- one player creates the match;
- the second player joins through a link, code, or available match list;
- both players confirm that they are ready;
- the match proceeds in turns;
- the winner is determined by the smart contract.

An AI opponent, solo campaign, and training mode can be added later, but they are not the foundation of the project.

## On-chain Requirements

The game must be fully on-chain in terms of game state and rules:

- match creation happens through a smart contract;
- joining a match happens through a smart contract;
- fleet placement is committed on-chain in encrypted form;
- each player turn is submitted as a blockchain transaction;
- the result of each turn is determined by contract logic and cryptographic computation;
- move history is stored on-chain;
- victory is determined on-chain;
- the frontend only displays state and helps the player submit actions.

There must be no centralized game server that can change the match result, replace board state, or decide the winner.

Allowed external components:

- blockchain RPC;
- wallet provider;
- Fhenix/CoFHE infrastructure required for FHE operations;
- indexer or read-only service for faster history display, as long as it is not the source of truth.

## Encryption and Fhenix

The project must use Fhenix/CoFHE for private game state.

Fhenix enables confidential smart contracts with Fully Homomorphic Encryption. This matters for Battleship because players must commit their ships on-chain, but the opponent must not be able to see the hidden board before cells are attacked.

According to the Fhenix documentation, `@cofhe/sdk` is used on the client for encrypting inputs, managing permits, and decrypting authorized values. `FHE.sol` is used in Solidity contracts for operations on encrypted data.

For the game, this means:

- ship placement must be sent to the contract as encrypted input;
- the contract must store hidden board state in encrypted form;
- hit detection must happen without revealing the entire map;
- players should only see results that the game rules allow them to see;
- decryption must be used carefully and only for authorized game events, such as hit, miss, sunk, or final reveal after match completion.

Important architectural interpretation: the game must be on-chain in its rules and state, but Fhenix/CoFHE can use its own cryptographic infrastructure for FHE computation and decryption flows. This is not considered a centralized game backend as long as it does not make game decisions on behalf of the game.

## 3D Direction

The game must have a 3D representation of the board and ships.

Basic visual direction:

- the board looks like an ocean grid or tactical holographic table;
- ships on the player's own board are visible in 3D;
- the opponent's board is hidden and only attacked cells are visible;
- shots, splashes, hits, and ship destruction have 3D animations;
- the camera and scale are adapted for a vertical phone screen.

For the first version, 3D should not get in the way of usability. The player must be able to choose cells, understand match state, and confirm transactions easily.

## Mobile-first Requirements

The mobile browser is the main target environment, so the interface must be designed mobile-first.

Required behavior:

- comfortable use on a vertical screen;
- large interactive areas for cell selection;
- clear confirmation of the selected move before sending a transaction;
- fast loading on mobile networks;
- optimized 3D scene;
- readable UI without tiny text;
- correct behavior with mobile wallets;
- support for deep links or a WalletConnect-style flow;
- graceful degradation on weaker devices.

The desktop version can exist, but it must not be the primary design target.

## Main User Flow

1. The player opens the game website on a phone.
2. The player sees a short onboarding.
3. The player taps "Connect Wallet".
4. The player enters the main menu.
5. The player taps "Play".
6. The player chooses "Play Against Friend".
7. The player creates a friend match on-chain.
8. The player places the fleet manually or uses auto placement.
9. The player confirms encrypted placement on-chain.
10. The player shares the invite link with a friend.
11. The friend joins, places a fleet, and confirms encrypted placement on-chain.
12. The friend takes the first shot.
13. Players alternate turns until the game ends.
14. The contract records each move and result.
15. The winner is determined on-chain.

## First Project Version

The MVP should focus on the smallest honest version:

- mobile browser web app;
- 3D board;
- wallet connection;
- one versus one PvP match;
- match creation and joining;
- encrypted ship placement through Fhenix/CoFHE;
- on-chain turn system;
- on-chain win condition;
- English interface;
- basic shot, miss, and hit animations;
- simple move history.

Manual ship placement is desirable, but the first version can start with auto placement if it makes fleet validation easier.

## Out of Scope for the First Version

The first version does not need:

- solo campaign;
- complex ranking;
- tournaments;
- NFT ships;
- marketplace;
- fleet customization;
- chat;
- clans;
- full native mobile app.

These features can be considered after the base PvP on-chain match becomes stable.

## Technical Direction

The initial stack can look like this:

- frontend: React or Next.js;
- 3D: Three.js or React Three Fiber;
- smart contracts: Solidity;
- confidential computation: Fhenix/CoFHE;
- client encryption: `@cofhe/sdk`;
- wallet connection: wagmi/viem or another compatible web3 stack;
- mobile app later: PWA, Capacitor, or React Native.

The final stack should be selected after a separate technical design phase.

## Fhenix Sources

- [Build with AI - Fhenix Documentation](https://cofhe-docs.fhenix.zone/get-started/build-with-ai/build-with-ai)
- [Fhenix documentation index](https://cofhe-docs.fhenix.zone/llms.txt)
- [@cofhe/sdk overview](https://cofhe-docs.fhenix.zone/client-sdk/introduction/overview)
- [FHE library overview](https://cofhe-docs.fhenix.zone/fhe-library/introduction/overview)
- [Fhenix introduction](https://cofhe-docs.fhenix.zone/get-started/introduction/fhenix)
