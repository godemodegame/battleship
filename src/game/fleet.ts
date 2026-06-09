import {
  BOARD_SIZE,
  CELL_COUNT,
  Orientation,
  PlacedShip,
  ShipSpec,
} from "./types";

// Classic fleet set from docs/game-mechanics.md:
//   1 x length 4, 2 x length 3, 3 x length 2, 4 x length 1  (10 ships, 20 cells).
// Each instance is mapped to one of the provided ship models so every asset
// in assets/3d-models is used on the board.
export const FLEET: ShipSpec[] = [
  { id: "carrier", name: "Carrier", model: "carrier", length: 4 },
  { id: "battleship", name: "Battleship", model: "battleship", length: 3 },
  { id: "cruiser", name: "Cruiser", model: "cruiser", length: 3 },
  { id: "destroyer-1", name: "Destroyer", model: "destroyer", length: 2 },
  { id: "submarine", name: "Submarine", model: "submarine", length: 2 },
  { id: "destroyer-2", name: "Destroyer", model: "destroyer", length: 2 },
  { id: "patrol-1", name: "Patrol Boat", model: "patrol-boat", length: 1 },
  { id: "patrol-2", name: "Patrol Boat", model: "patrol-boat", length: 1 },
  { id: "patrol-3", name: "Patrol Boat", model: "patrol-boat", length: 1 },
  { id: "patrol-4", name: "Patrol Boat", model: "patrol-boat", length: 1 },
];

export const idx = (x: number, y: number) => y * BOARD_SIZE + x;
export const xy = (i: number) => ({ x: i % BOARD_SIZE, y: Math.floor(i / BOARD_SIZE) });

export function shipCells(x: number, y: number, len: number, o: Orientation): number[] {
  const cells: number[] = [];
  for (let i = 0; i < len; i++) {
    cells.push(o === "horizontal" ? idx(x + i, y) : idx(x, y + i));
  }
  return cells;
}

/** Within board bounds for the given anchor/length/orientation. */
export function inBounds(x: number, y: number, len: number, o: Orientation): boolean {
  if (x < 0 || y < 0) return false;
  if (o === "horizontal") return x + len <= BOARD_SIZE && y < BOARD_SIZE;
  return y + len <= BOARD_SIZE && x < BOARD_SIZE;
}

/**
 * Classic placement rule: ships may not touch, even diagonally.
 * Checks the candidate ship's cells plus their 8-neighborhood against occupied.
 */
export function fits(
  cells: number[],
  occupied: Set<number>,
): boolean {
  for (const c of cells) {
    const { x, y } = xy(c);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= BOARD_SIZE || ny >= BOARD_SIZE) continue;
        if (occupied.has(idx(nx, ny))) return false;
      }
    }
  }
  return true;
}

function toPlaced(spec: ShipSpec, x: number, y: number, o: Orientation): PlacedShip {
  const cells = shipCells(x, y, spec.length, o);
  return { ...spec, x, y, orientation: o, cells, hits: cells.map(() => false) };
}

/** Validate a full manual layout against bounds + classic non-touching rule. */
export function validateFleet(ships: PlacedShip[]): boolean {
  if (ships.length !== FLEET.length) return false;
  const occupied = new Set<number>();
  for (const s of ships) {
    if (!inBounds(s.x, s.y, s.length, s.orientation)) return false;
    const cells = shipCells(s.x, s.y, s.length, s.orientation);
    if (!fits(cells, occupied)) return false;
    cells.forEach((c) => occupied.add(c));
  }
  return true;
}

/** Random valid fleet using the classic non-touching rule. */
export function autoPlaceFleet(): PlacedShip[] {
  // Place longest ships first for higher success rate.
  const order = [...FLEET].sort((a, b) => b.length - a.length);
  for (let attempt = 0; attempt < 200; attempt++) {
    const occupied = new Set<number>();
    const placed: PlacedShip[] = [];
    let ok = true;
    for (const spec of order) {
      let positioned = false;
      for (let tries = 0; tries < 400; tries++) {
        const o: Orientation = Math.random() < 0.5 ? "horizontal" : "vertical";
        const maxX = o === "horizontal" ? BOARD_SIZE - spec.length : BOARD_SIZE - 1;
        const maxY = o === "horizontal" ? BOARD_SIZE - 1 : BOARD_SIZE - spec.length;
        const x = Math.floor(Math.random() * (maxX + 1));
        const y = Math.floor(Math.random() * (maxY + 1));
        const cells = shipCells(x, y, spec.length, o);
        if (fits(cells, occupied)) {
          cells.forEach((c) => occupied.add(c));
          placed.push(toPlaced(spec, x, y, o));
          positioned = true;
          break;
        }
      }
      if (!positioned) {
        ok = false;
        break;
      }
    }
    if (ok && placed.length === FLEET.length) {
      // Return in canonical FLEET order for stable rendering.
      return FLEET.map((f) => placed.find((p) => p.id === f.id)!);
    }
  }
  throw new Error("auto placement failed");
}

export { CELL_COUNT };
