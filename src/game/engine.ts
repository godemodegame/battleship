import { CELL_COUNT, PlacedShip, ShotResult } from "./types";

export interface FireOutcome {
  result: ShotResult;
  ship?: PlacedShip;
  /** True when this shot ended the match (last ship sunk). */
  gameOver: boolean;
}

/**
 * One side's hidden board: the placed fleet plus the record of incoming shots.
 * `fire` is the authoritative hit/miss/sunk resolver for this local build.
 */
export class BoardState {
  readonly ships: PlacedShip[];
  /** Incoming attacked cell indices -> their result. */
  readonly shots = new Map<number, ShotResult>();
  /** Fast lookup: cell index -> owning ship (only for occupied cells). */
  private readonly cellToShip = new Map<number, PlacedShip>();

  constructor(ships: PlacedShip[]) {
    // Deep-ish clone so engine owns mutable hit state.
    this.ships = ships.map((s) => ({ ...s, cells: [...s.cells], hits: s.cells.map(() => false) }));
    for (const ship of this.ships) {
      ship.cells.forEach((c) => this.cellToShip.set(c, ship));
    }
  }

  alreadyAttacked(index: number): boolean {
    return this.shots.has(index);
  }

  fire(index: number): FireOutcome {
    const ship = this.cellToShip.get(index);
    if (!ship) {
      this.shots.set(index, "miss");
      return { result: "miss", gameOver: false };
    }
    const pos = ship.cells.indexOf(index);
    ship.hits[pos] = true;
    const sunk = ship.hits.every(Boolean);
    const result: ShotResult = sunk ? "sunk" : "hit";
    this.shots.set(index, result);
    return { result, ship, gameOver: sunk && this.allSunk() };
  }

  allSunk(): boolean {
    return this.ships.every((s) => s.hits.every(Boolean));
  }

  shipsRemaining(): number {
    return this.ships.filter((s) => !s.hits.every(Boolean)).length;
  }

  get hitCount(): number {
    let n = 0;
    this.shots.forEach((r) => {
      if (r !== "miss") n++;
    });
    return n;
  }

  get missCount(): number {
    let n = 0;
    this.shots.forEach((r) => {
      if (r === "miss") n++;
    });
    return n;
  }

  get shotCount(): number {
    return this.shots.size;
  }
}

export { CELL_COUNT };
