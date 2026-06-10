# Game Mechanics

## Short Description

The game is based on the classic Battleship concept: two players place their ships on hidden grids, then take turns attacking cells on the opponent's grid. The goal is to be the first player to find and destroy the entire enemy fleet.

The base version should be simple, clear, and ready for future expansion. First, the game should implement standard rules. Later, it can add abilities, different ship types, obstacles, a campaign mode, or online features around the core PvP match.

## Implementation Status

The local practice build implements these mechanics: the 10 by 10 board, the
classic ten-ship fleet, the classic no-touch placement rule, manual and
automatic placement, attack resolution with miss/hit/sunk results, turn
passing after a miss, an extra shot after a hit or sunk ship, victory check,
and the game-over summary.

The opponent in the current build is a local practice bot rather than a second
human player; on-chain PvP is the planned MVP. See
`docs/current-playable-build.md` for build scope,
`docs/local-game-engine.md` for the exact rule implementation, and
`docs/practice-mode-and-bot-ai.md` for bot behavior.

## Game Board

Each player has their own fixed-size board. For the first version, a 10 by 10 board is a good default.

Each cell can be in one of several states:

- empty cell;
- cell containing part of a ship;
- miss;
- hit;
- destroyed ship segment.

The player can see their own board completely, including their placed ships. The opponent's board is hidden. It only shows the results of attacks that have already been made.

## Ships

The fleet contains several ships of different lengths. The base version can use the classic set:

- one ship with a length of 4 cells;
- two ships with a length of 3 cells;
- three ships with a length of 2 cells;
- four ships with a length of 1 cell.

Ships are placed horizontally or vertically. The first version should not allow diagonal placement or overlapping ships.

There are two possible placement rules:

- classic: ships cannot touch each other, even diagonally;
- simplified: ships cannot overlap, but they can stand next to each other.

The project should start with the classic rule because it is familiar for Battleship and makes the board easier to read.

## Game Setup

Before the battle starts, each player places their fleet on the board.

Placement can be manual or automatic. The local build already implements both:
manual tap-to-place with rotation and pick-up, plus an `Auto Place` button
(the original plan treated automatic placement as enough for the first
working version, but manual placement landed with it).

After both fleets are placed, the battle begins.

## Player Turn

The player chooses a cell on the opponent's board and attacks it.

Possible attack results:

- miss: the chosen cell does not contain a ship;
- hit: the chosen cell contains part of a ship;
- sunk: the hit destroyed the last remaining segment of a ship;
- repeated attack: the cell was already attacked before, so the move must not be counted.

The turn passes to the opponent after a miss. A hit or sunk ship keeps the
turn with the attacker, who may fire again.

## Sinking a Ship

A ship is considered sunk when every cell it occupies has been hit.

After a ship is sunk, the game should clearly show the player that the ship has been destroyed. In the interface, this can be shown with a separate marker on the ship cells or with a message such as "Ship sunk".

## Victory and Defeat

A player wins when all enemy ships have been destroyed.

The game ends immediately after the winning attack. After the match ends, the game can show a summary:

- winner;
- number of turns;
- attack accuracy;
- how many ships the losing player had left.

## Basic Game Loop

1. Create boards for two players.
2. Place each player's fleet.
3. Choose the first player.
4. The player attacks a cell on the opponent's board.
5. The game checks the attack result.
6. The game updates the board state.
7. If all opponent ships are destroyed, the game ends.
8. If there is no winner and the result is a miss, the turn passes to the
   other player.
9. If the result is a hit or sunk ship, the attacker takes another shot.

## First Version

The first version only needs the following features:

- 10 by 10 board;
- two players: human versus human PvP;
- automatic ship placement;
- cell attack;
- display of misses, hits, and sunk ships;
- victory check;
- simple game over screen.

This version provides a foundation that can later support a better interface, development-only simulation tools, and additional game modes.

The current build already covers this list - and goes further on placement
(manual placement is in) - with one substitution: the second human player is
stood in for by a local practice bot until on-chain PvP ships.
