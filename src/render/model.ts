/**
 * Shared scene render model (GAME-106 / GAME-107).
 *
 * This is the mode-neutral contract the 3D scene consumes. Both the practice
 * adapter (`practice/practiceRenderModel.ts`, from the local `MatchState`) and
 * the on-chain adapter (`onchain/renderModel.ts`, from public contract data)
 * produce this same shape, so `src/three` never imports the local attack engine
 * or a plaintext match.
 *
 * It carries only what the scene needs to draw a board: per-cell shot state, the
 * dimmed no-touch halo, and the hulls to draw with their sunk state. Hulls that
 * must stay hidden — an opponent's un-sunk ships, or an owner's fleet after
 * encrypted submission — are simply absent from `ships`.
 */
import type { CellShot, Orientation, ShipClassId } from '../game/types'

export interface ShipOutline {
  classId: ShipClassId
  length: number
  row: number
  col: number
  orientation: Orientation
}

export interface RenderShip extends ShipOutline {
  /** Stable identity for React keys across re-renders. */
  key: string
  sunk: boolean
}

export interface BoardRenderData {
  /** Per-cell shot state, length 100. 0 untried, 1 miss, 2 hit, 3 sunk-part. */
  shots: ReadonlyArray<CellShot>
  /** Cells visually dimmed — the no-touch ring around a sunk ship. */
  dimmed: ReadonlySet<number>
  /** Hulls to draw with their sunk state; hidden hulls are simply absent. */
  ships: ReadonlyArray<RenderShip>
}

export interface BattleRenderModel {
  /** The board the viewer defends (their own fleet). */
  player: BoardRenderData
  /** The board the viewer attacks (opponent / enemy). */
  enemy: BoardRenderData
}

/** Stable empty references so adapters don't churn scene memoization. */
export const EMPTY_SHOTS: ReadonlyArray<CellShot> = Object.freeze(
  new Array(100).fill(0),
) as ReadonlyArray<CellShot>
export const EMPTY_DIMMED: ReadonlySet<number> = Object.freeze(
  new Set<number>(),
) as ReadonlySet<number>
const EMPTY_SHIPS: ReadonlyArray<RenderShip> = Object.freeze([]) as ReadonlyArray<RenderShip>

export function emptyBoardRenderData(): BoardRenderData {
  return { shots: EMPTY_SHOTS, dimmed: EMPTY_DIMMED, ships: EMPTY_SHIPS }
}

export function emptyBattleRenderModel(): BattleRenderModel {
  return { player: emptyBoardRenderData(), enemy: emptyBoardRenderData() }
}
