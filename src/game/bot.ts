import { BoardState, FireOutcome } from "./engine";
import { BOARD_SIZE } from "./types";
import { idx, xy } from "./fleet";

// On-chain design (docs/computer-opponent-design.md) keeps the *target choice*
// out of the caller's hands. This local Bot mirrors the documented strategies:
//   easy   - random unattacked cell
//   normal - random hunt, then chase neighbours of a hit until the ship sinks
//   hard   - parity hunt + directional follow-up along the line of hits

export class Bot {
  private readonly difficulty: "easy" | "normal" | "hard";
  /** Promising cells to try next (target mode). */
  private queue: number[] = [];
  /** Cells hit on the ship currently being hunted. */
  private chain: number[] = [];

  constructor(difficulty: "easy" | "normal" | "hard") {
    this.difficulty = difficulty;
  }

  private candidates(board: BoardState): number[] {
    const out: number[] = [];
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
      if (!board.alreadyAttacked(i)) out.push(i);
    }
    return out;
  }

  private orthoNeighbors(index: number): number[] {
    const { x, y } = xy(index);
    const n: number[] = [];
    if (x > 0) n.push(idx(x - 1, y));
    if (x < BOARD_SIZE - 1) n.push(idx(x + 1, y));
    if (y > 0) n.push(idx(x, y - 1));
    if (y < BOARD_SIZE - 1) n.push(idx(x, y + 1));
    return n;
  }

  /** Choose the next cell to attack on the given (player) board. */
  chooseTarget(board: BoardState): number {
    // Target mode: drain the queue of live candidates first.
    while (this.queue.length) {
      const c = this.queue.shift()!;
      if (!board.alreadyAttacked(c)) {
        // For hard mode, once we have two hits in a line, prefer extending
        // that line by reordering the queue toward the same axis.
        return c;
      }
    }

    const open = this.candidates(board);
    if (this.difficulty === "easy") {
      return open[Math.floor(Math.random() * open.length)];
    }

    // normal / hard hunt mode
    if (this.difficulty === "hard") {
      const parity = open.filter((i) => {
        const { x, y } = xy(i);
        return (x + y) % 2 === 0;
      });
      const pool = parity.length ? parity : open;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    return open[Math.floor(Math.random() * open.length)];
  }

  /** Feed back the outcome so the bot can chase or reset its hunt. */
  notify(index: number, outcome: FireOutcome): void {
    if (this.difficulty === "easy") return;

    if (outcome.result === "sunk") {
      this.queue = [];
      this.chain = [];
      return;
    }
    if (outcome.result === "hit") {
      this.chain.push(index);
      let next = this.orthoNeighbors(index);
      // With two+ hits, we know the ship's axis; keep only in-line neighbours.
      if (this.chain.length >= 2) {
        const sameRow = this.chain.every((c) => xy(c).y === xy(this.chain[0]).y);
        next = next.filter((c) =>
          sameRow ? xy(c).y === xy(index).y : xy(c).x === xy(index).x,
        );
      }
      this.queue.unshift(...next);
    }
  }
}
