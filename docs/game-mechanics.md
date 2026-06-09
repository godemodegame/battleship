# Game Mechanics

## Short Description

The game is based on the classic Battleship concept: two players place their ships on hidden grids, then take turns attacking cells on the opponent's grid. The goal is to be the first player to find and destroy the entire enemy fleet.

The base version should be simple, clear, and ready for future expansion. First, the game should implement standard rules. Later, it can add abilities, different ship types, obstacles, a campaign mode, or online features around the core PvP match.

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

Placement can be manual or automatic. For the first working version, automatic placement is enough because it lets the project reach the main gameplay loop faster. Manual placement can be added as a separate stage.

After both fleets are placed, the battle begins.

## Player Turn

The player chooses a cell on the opponent's board and attacks it.

Possible attack results:

- miss: the chosen cell does not contain a ship;
- hit: the chosen cell contains part of a ship;
- sunk: the hit destroyed the last remaining segment of a ship;
- repeated attack: the cell was already attacked before, so the move must not be counted.

In the base version, the turn passes to the opponent after every valid attack. If the project later wants to follow other Battleship rule variants, it can add an extra turn after a hit.

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
8. If there is no winner yet, the turn passes to the other player.

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
