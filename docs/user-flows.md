# User Flows

## Purpose

This document defines the first user flow for the mobile-first 3D on-chain Battleship game.

The first implemented flow should focus on playing against a friend. Other modes, such as open match and practice versus bot, can be added later after the friend flow is stable.

All UI labels and player-facing text must be written in English.

## Primary MVP Flow

The first MVP flow:

1. Player opens the app.
2. If no wallet is connected, player sees a short onboarding.
3. Onboarding ends with `Connect Wallet`.
4. If a wallet is already connected, onboarding is skipped.
5. Player sees the main menu.
6. Player taps `Play`.
7. Player chooses `Play Against Friend`.
8. Player creates a friend match.
9. Player places ships.
10. Player confirms encrypted fleet placement on-chain.
11. Player sends the invite link to a friend.
12. Friend opens the link.
13. If no wallet is connected, friend sees the short onboarding.
14. Friend connects a wallet.
15. Friend joins the match.
16. Friend places ships.
17. Friend confirms encrypted fleet placement on-chain.
18. Friend makes the first shot.
19. Players alternate turns until the game ends.
20. The winner is determined on-chain.

## Flow Check

The proposed user flow is good for the MVP because it is simple, social, and focused on the core game.

It needs three technical clarifications:

- a match must be created on-chain before the invite link can exist;
- both fleet placements must be encrypted, submitted, and validated before the first shot;
- if the friend should shoot first, the smart contract must explicitly use that turn-order rule.

The corrected technical rule:

- the creator sets up the match and fleet first;
- the invited friend joins later;
- after both fleets are valid, the invited friend takes the first turn.

## Invite Style

There are two possible friend-invite styles.

## Strict Friend Invite

The creator enters the friend's wallet address before creating the match.

Benefits:

- only the intended friend can join;
- strongest fit for a private friend match;
- matches the smart contract design.

Tradeoff:

- the creator must know the friend's wallet address.

## Link-only Friend Invite

The creator creates a link, and the first wallet that opens the link can claim the opponent slot.

Benefits:

- simpler UX;
- the creator does not need the friend's wallet address in advance.

Tradeoff:

- less private;
- the link must be protected because anyone with the link can join first.

MVP recommendation:

- use `Strict Friend Invite` if the product wants stronger privacy;
- use `Link-only Friend Invite` if the product wants the fastest social sharing flow.

The current documentation should support strict friend invite as the default, with link-only invite as a possible later UX option.

## Flow 1: First Launch and Onboarding

Goal:

- introduce the game quickly without blocking the player.
- show onboarding only when no wallet is connected.

Player actions:

1. Player opens the app on a mobile phone.
2. App checks wallet connection state.
3. If a wallet is already connected, app skips onboarding.
4. If no wallet is connected, player sees a short animated onboarding.
5. Player swipes or taps through no more than three onboarding screens.
6. Player taps `Connect Wallet` at the end of onboarding.

UI states:

- `Encrypted Battleship`
- `Play private on-chain matches`
- `Hide your fleet with Fhenix`
- `Every move is a transaction`

Primary button:

- `Connect Wallet`

Secondary button:

- `Skip`

Notes:

- onboarding must be short;
- onboarding must not appear when a wallet is already connected;
- wallet connection is the final onboarding action;
- no long tutorial before wallet connection;
- onboarding can show a lightweight visual preview, but the actual gameplay field must wait for the game field loading gate.

## Game Field Loading Gate

Goal:

- prevent the player from seeing an incomplete gameplay field before required 3D models are loaded.

Player actions:

1. Player enters a screen that needs the gameplay field.
2. App starts loading required board, ship, and effect models for that screen.
3. Player sees a dedicated loading screen.
4. App shows loading progress or a clear loading status.
5. After all required field models are loaded, app reveals the gameplay field.

UI states:

- `Loading Battlefield`
- `Loading Models`
- `Preparing Board`
- `Entering Match`

Notes:

- the gameplay field must not be visible until required models are ready;
- optional decorative props may continue loading after the field appears;
- if required models fail to load, show a recoverable error instead of a partially rendered field;
- wallet, network, and transaction status can remain visible while the field is loading.

## Flow 2: Wallet Connection

Goal:

- connect the player wallet and ensure the player is on Arbitrum Sepolia.

Player actions:

1. Player taps `Connect Wallet`.
2. Wallet modal opens.
3. Player selects wallet.
4. Player confirms connection.
5. App checks network.
6. If needed, player taps `Switch to Arbitrum Sepolia`.

UI states:

- `Connecting Wallet`
- `Wallet Connected`
- `Wrong Network`
- `Switch to Arbitrum Sepolia`

Contract calls:

- none.

Wallet actions:

- wallet connection;
- optional network switch.

Errors:

- `Wallet not connected`
- `Connection rejected`
- `Wrong network`

Success result:

- player enters the main menu.

## Flow 3: Main Menu

Goal:

- let the player choose the next action.

Player actions:

1. Player sees the main menu.
2. Player taps `Play`.

Main menu buttons:

- `Play`
- `Join Match`
- `Match History`
- `Settings`

Top status:

- connected wallet short address;
- Arbitrum Sepolia status;
- pending transaction indicator if any.

Success result:

- player enters opponent selection.

## Flow 4: Opponent Selection

Goal:

- choose who to play against.

Player actions:

1. Player sees `Choose Opponent`.
2. Player taps `Play Against Friend`.

Available MVP option:

- `Play Against Friend`

Optional future options:

- `Open Match`
- `Practice vs Bot`

Success result:

- player enters friend match creation.

## Flow 5: Create Friend Match

Goal:

- create a match that can be shared with a friend.

Player actions:

1. Player sees `Invite Friend`.
2. Player enters friend wallet address.
3. Player taps `Create Match`.
4. Player confirms transaction in wallet.
5. Contract creates the match.
6. App receives `MatchCreated`.
7. Player moves to fleet placement.

Primary button:

- `Create Match`

Secondary buttons:

- `Paste Address`
- `Back`

Contract call:

```solidity
createMatch(address invitedOpponent)
```

Expected event:

```solidity
MatchCreated(matchId, creator, invitedOpponent)
```

UI states:

- `Creating Match`
- `Confirm in Wallet`
- `Transaction Pending`
- `Match Created`

Errors:

- `Invalid address`
- `Transaction rejected`
- `Transaction failed`

Success result:

- match exists on-chain;
- creator can place fleet;
- invite link can be generated from `matchId`.

## Flow 6: Creator Fleet Placement

Goal:

- let the creator place ships and submit encrypted placement.

Player actions:

1. Player sees the 3D fleet placement board.
2. Player places ships manually or taps `Auto Place`.
3. Player taps `Confirm Fleet`.
4. App encrypts fleet placement through Fhenix/CoFHE.
5. Player confirms transaction in wallet.
6. Contract receives encrypted fleet placement.
7. Placement validation begins.
8. App waits for validation result.

Primary buttons:

- `Auto Place`
- `Confirm Fleet`

Secondary buttons:

- `Rotate`
- `Reset`
- `Back`

Contract call:

```solidity
submitFleet(uint256 matchId, encryptedPlacement)
```

Expected events:

```solidity
FleetSubmitted(matchId, player)
FleetValidated(matchId, player, valid)
```

UI states:

- `Place your fleet`
- `Encrypting fleet`
- `Confirm in Wallet`
- `Submitting fleet`
- `Validating placement`
- `Fleet confirmed`

Errors:

- `Fleet placement invalid`
- `Transaction rejected`
- `Transaction failed`

Success result:

- creator fleet is encrypted and accepted;
- invite link can be shared.

## Flow 7: Share Invite Link

Goal:

- send the match to the invited friend.

Player actions:

1. Player sees the invite screen.
2. Player taps `Copy Invite Link` or `Share Invite`.
3. Player sends the link to a friend.
4. Player waits for the friend to join and place fleet.

Buttons:

- `Copy Invite Link`
- `Share Invite`
- `Cancel Match`

UI states:

- `Waiting for friend`
- `Invite link copied`
- `Friend joined`
- `Waiting for opponent fleet`

Contract calls:

- none for copy or share;
- optional `cancelMatch(matchId)` if the creator cancels.

Success result:

- friend receives the link.

## Flow 8: Friend Opens Invite

Goal:

- let the invited friend join the match.

Friend actions:

1. Friend opens the invite link.
2. App opens directly to the match invite screen.
3. Friend sees short context for the match.
4. Friend connects wallet if not connected.
5. App checks that the wallet matches the invited address.
6. Friend taps `Join Match`.
7. Friend confirms transaction in wallet.

Primary button:

- `Join Match`

Secondary button:

- `Back`

Contract call:

```solidity
joinMatch(uint256 matchId)
```

Expected event:

```solidity
MatchJoined(matchId, opponent)
```

UI states:

- `Checking match`
- `Connect Wallet`
- `Join Match`
- `Confirm in Wallet`
- `Joining Match`
- `Match Joined`

Errors:

- `Match not found`
- `This invite is for another wallet`
- `Match already started`
- `Transaction rejected`
- `Transaction failed`

Success result:

- friend becomes the opponent for the match;
- friend enters fleet placement.

## Flow 9: Friend Fleet Placement

Goal:

- let the friend place ships and submit encrypted placement.

Friend actions:

1. Friend sees the fleet placement board.
2. Friend places ships manually or taps `Auto Place`.
3. Friend taps `Confirm Fleet`.
4. App encrypts fleet placement through Fhenix/CoFHE.
5. Friend confirms transaction in wallet.
6. Contract receives encrypted placement.
7. Placement validation begins.
8. App waits for validation result.

Contract call:

```solidity
submitFleet(uint256 matchId, encryptedPlacement)
```

Expected events:

```solidity
FleetSubmitted(matchId, player)
FleetValidated(matchId, player, valid)
```

Success result:

- both players have valid encrypted fleets;
- match can start;
- first turn is assigned to the invited friend.

## Flow 10: Match Start

Goal:

- move from setup to active battle.

Trigger:

- both fleets are valid.

Contract behavior:

1. Contract confirms both players are present.
2. Contract confirms both placements are valid.
3. Contract starts the match.
4. Contract sets current turn to the invited friend.
5. Contract emits `MatchStarted`.

Expected event:

```solidity
MatchStarted(matchId, firstPlayer)
```

UI states:

- creator sees `Opponent Turn`;
- friend sees `Your Turn`.

Success result:

- friend can make the first shot.

## Flow 11: Friend First Shot

Goal:

- let the friend make the first attack.

Friend actions:

1. Friend views the target board.
2. Friend selects a cell.
3. Friend taps `Fire`.
4. App opens confirmation sheet.
5. Friend confirms `Fire at {cell}`.
6. Wallet opens.
7. Friend confirms transaction.
8. Contract receives attack.
9. Fhenix/CoFHE resolves hit, miss, sunk, or win.

Contract call:

```solidity
attack(uint256 matchId, uint8 cellIndex)
```

Expected events:

```solidity
ShotSubmitted(matchId, moveId, attacker, defender, cellIndex)
ShotResolved(matchId, moveId, result)
TurnChanged(matchId, currentTurn)
```

UI states:

- `Select Target`
- `Fire`
- `Confirm in Wallet`
- `Transaction Pending`
- `Resolving Shot`
- `Miss`
- `Hit`
- `Sunk`

Errors:

- `Not your turn`
- `Cell already attacked`
- `Transaction rejected`
- `Shot resolution pending`

Success result:

- result is shown;
- after a miss, turn passes to the creator;
- after a hit or sunk ship, the opponent fires again.

## Flow 12: Battle Turn Loop

Goal:

- continue the match until one player wins.

Loop:

1. Current player selects a target cell.
2. Current player taps `Fire`.
3. Current player confirms transaction.
4. A miss passes the turn to the opponent.
5. A hit or sunk ship lets the current player fire again.
4. Contract validates turn and target.
5. Contract resolves shot through Fhenix/CoFHE.
6. UI shows result.
7. Contract checks win condition.
8. If no win, contract changes turn.
9. Other player repeats the same process.

Rules:

- only the current player can attack;
- repeated attacks are rejected;
- coordinates of attacks are public;
- hidden fleet state remains encrypted;
- frontend never decides hit or miss;
- every attack is a transaction.

Turn labels:

- `Your Turn`
- `Opponent Turn`
- `Resolving Shot`

Result labels:

- `Miss`
- `Hit`
- `Sunk`
- `Victory`
- `Defeat`

## Flow 13: Game Over

Goal:

- show the final result after the contract determines a winner.

Trigger:

- contract resolves a shot as winning.

Expected event:

```solidity
MatchFinished(matchId, winner, moveCount)
```

Winner UI:

- title: `Victory`;
- highlight final shot;
- show compact stats.

Loser UI:

- title: `Defeat`;
- show damaged own board;
- show compact stats.

Buttons:

- `View Match`
- `Play Again`
- `Back to Menu`

Stats:

- turns;
- hits;
- misses;
- accuracy;
- sunk ships.

Default reveal rule:

- do not reveal the full hidden boards automatically;
- show known hits, misses, sunk results, and final match result;
- optional full reveal can be added later if the contract supports it safely.

## Flow 14: Timeout and Cancel States

Goal:

- prevent matches from being stuck forever.

Creator waiting for friend:

- UI state: `Waiting for friend`;
- available action: `Cancel Match`.

Friend joined but did not submit fleet:

- UI state: `Waiting for opponent fleet`;
- future action: `Claim Timeout`.

Player does not take turn:

- UI state: `Opponent Turn`;
- future action: `Claim Timeout`.

MVP recommendation:

- include `Cancel Match` before the match starts;
- document timeout win in contract design;
- implement full timeout claiming after the base friend flow works.

## Final Validated Flow

The user flow is valid with these final rules:

1. App opens with short onboarding.
2. Wallet connection happens before the main menu.
3. Main menu leads to `Play`.
4. `Play` leads to `Play Against Friend`.
5. Creator creates an on-chain friend match.
6. Creator places fleet.
7. Creator submits encrypted placement.
8. Creator shares invite link.
9. Friend opens link.
10. Friend connects wallet.
11. Friend joins match.
12. Friend places fleet.
13. Friend submits encrypted placement.
14. Contract starts match after both fleets are valid.
15. Friend makes the first shot.
16. Players alternate turns.
17. Every move is an on-chain transaction.
18. Fhenix/CoFHE resolves hidden-state checks.
19. Contract determines the winner.

This is a good MVP user flow.
