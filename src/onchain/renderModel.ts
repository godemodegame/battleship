/**
 * Public on-chain battle render model and board adapters (GAME-106).
 *
 * These types describe the render-only view of a friend match derived purely
 * from public contract data. They must never carry enemy placements, `shipAt`,
 * encrypted fleet values, ciphertext-derived guesses, or unresolved results.
 *
 * This module is part of the on-chain boundary: it must not import the local
 * attack engine (`../game/engine`) or the practice bot (`../game/bot`). It maps
 * public board masks into the shared scene `BattleRenderModel` so the 3D scene
 * can render a contract-driven match without any plaintext `MatchState`.
 */
import { CELL_COUNT } from '../game/constants'
import type { CellShot } from '../game/types'
import type { BattleRenderModel, BoardRenderData } from '../render/model'
import { EMPTY_DIMMED } from '../render/model'

export type Address = `0x${string}`

export type PublicPhase =
  | 'waiting'
  | 'player-turn'
  | 'opponent-turn'
  | 'resolving'
  | 'finished'

export type PublicResult = 'miss' | 'hit' | 'sunk'

export interface PublicMove {
  /** Monotonic finalized move id; used to key visual effects idempotently. */
  moveId: number
  cell: number
  result: PublicResult
}

/**
 * Decoded public state of one board. Cells are 0..99 indices. `attacked` is the
 * union of misses, hits, and sunk cells. `shipsRemaining` is public ship-count
 * metadata only — never per-cell placement.
 */
export interface PublicBoardRenderState {
  attacked: ReadonlySet<number>
  misses: ReadonlySet<number>
  hits: ReadonlySet<number>
  sunk: ReadonlySet<number>
  shipsRemaining: number
}

export interface PublicBattleRenderModel {
  phase: PublicPhase
  perspective: 'creator' | 'opponent'
  currentTurn: Address | null
  winner: Address | null
  playerBoard: PublicBoardRenderState
  opponentBoard: PublicBoardRenderState
  selectedCell: number | null
  latestFinalizedMove: PublicMove | null
}

/** Raw public board masks as the contract would expose them, before decoding. */
export interface PublicBoardMasks {
  misses: ReadonlyArray<number>
  hits: ReadonlyArray<number>
  sunk: ReadonlyArray<number>
  shipsRemaining: number
}

function assertCell(cell: number): void {
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) {
    throw new RangeError(`public board cell out of range: ${cell}`)
  }
}

/**
 * Decode raw public masks into a `PublicBoardRenderState`. Sunk cells are
 * authoritative hits, so they are also counted as hits and attacked.
 */
export function decodePublicBoard(masks: PublicBoardMasks): PublicBoardRenderState {
  const misses = new Set<number>()
  const hits = new Set<number>()
  const sunk = new Set<number>()
  const attacked = new Set<number>()

  for (const cell of masks.sunk) {
    assertCell(cell)
    sunk.add(cell)
    hits.add(cell)
    attacked.add(cell)
  }
  for (const cell of masks.hits) {
    assertCell(cell)
    hits.add(cell)
    attacked.add(cell)
  }
  for (const cell of masks.misses) {
    assertCell(cell)
    if (hits.has(cell)) continue // a finalized hit/sunk wins over a stale miss mask
    misses.add(cell)
    attacked.add(cell)
  }

  return {
    attacked,
    misses,
    hits,
    sunk,
    shipsRemaining: Math.max(0, Math.trunc(masks.shipsRemaining)),
  }
}

/** Per-cell `CellShot` array for a decoded public board (sunk > hit > miss). */
export function publicBoardShots(board: PublicBoardRenderState): CellShot[] {
  const shots: CellShot[] = new Array(CELL_COUNT).fill(0)
  for (const cell of board.misses) shots[cell] = 1
  for (const cell of board.hits) shots[cell] = 2
  for (const cell of board.sunk) shots[cell] = 3
  return shots
}

/**
 * Adapt one decoded public board into shared scene `BoardRenderData`. No hull
 * geometry is exposed: sunk ships render through the per-cell `sunk` tiles, and
 * `ships` stays empty because public on-chain data never reveals exact enemy or
 * post-submission owner placements.
 */
export function publicBoardRenderData(board: PublicBoardRenderState): BoardRenderData {
  return {
    shots: publicBoardShots(board),
    dimmed: EMPTY_DIMMED,
    ships: [],
  }
}

/** Adapt a `PublicBattleRenderModel` into the shared scene `BattleRenderModel`. */
export function publicBattleToRenderModel(
  model: PublicBattleRenderModel,
): BattleRenderModel {
  return {
    player: publicBoardRenderData(model.playerBoard),
    enemy: publicBoardRenderData(model.opponentBoard),
  }
}
