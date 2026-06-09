// Core domain types for the Battleship game engine.
// The engine is framework-agnostic and is the single source of truth for
// rules in this local build. It is deliberately shaped so an on-chain /
// Fhenix authority could replace it later (see docs/technical-architecture.md).

export const BOARD_SIZE = 10;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

export type ModelKey =
  | "carrier"
  | "battleship"
  | "cruiser"
  | "destroyer"
  | "submarine"
  | "patrol-boat";

export type Orientation = "horizontal" | "vertical";

export interface ShipSpec {
  id: string;
  name: string;
  model: ModelKey;
  length: number;
}

export interface PlacedShip extends ShipSpec {
  /** Top-left anchor cell. */
  x: number;
  y: number;
  orientation: Orientation;
  /** Flat cell indices this ship occupies. */
  cells: number[];
  /** Which of this ship's cells have been hit. */
  hits: boolean[];
}

export type ShotResult = "miss" | "hit" | "sunk";

export interface Shot {
  index: number;
  result: ShotResult;
  sunkShipName?: string;
}

export type Player = "you" | "enemy";

export type Difficulty = "easy" | "normal" | "hard";
