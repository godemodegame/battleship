/**
 * Practice render adapter (GAME-104 / GAME-107).
 *
 * Translates the practice-only plaintext `MatchState` into the shared scene
 * `BattleRenderModel` so `src/three` consumes the same mode-neutral shape as the
 * on-chain adapter. This adapter is practice-only (it reads the local engine's
 * sunk-halo) and lives behind the practice boundary; the scene itself stays free
 * of plaintext match knowledge.
 */
import { sunkHalo } from '../game/engine'
import type { BoardState, MatchState, PlacedShip } from '../game/types'
import {
  EMPTY_DIMMED,
  emptyBattleRenderModel,
  type BattleRenderModel,
  type BoardRenderData,
  type RenderShip,
} from '../render/model'

function renderShip(ship: PlacedShip): RenderShip {
  return {
    key: String(ship.slot),
    classId: ship.classId,
    length: ship.length,
    row: ship.row,
    col: ship.col,
    orientation: ship.orientation,
    sunk: ship.sunk,
  }
}

function boardData(
  board: BoardState,
  opts: { revealLive: boolean; dim: boolean },
): BoardRenderData {
  // The owner's board reveals every hull; the opponent's board reveals only
  // sunk hulls (live placements stay hidden), matching the prior scene.
  const source = opts.revealLive ? board.ships : board.ships.filter((s) => s.sunk)
  const ships = source.map(renderShip)
  const dimmed = opts.dim ? sunkHalo(board) : EMPTY_DIMMED
  return { shots: board.shots, dimmed, ships }
}

/**
 * Build the shared render model for a practice match. The player's own board
 * reveals its live fleet; the enemy board reveals only sunk hulls and dims the
 * no-touch halo, exactly as the local scene rendered before this refactor.
 */
export function practiceBattleModel(match: MatchState | null): BattleRenderModel {
  if (!match) return emptyBattleRenderModel()
  return {
    player: boardData(match.boards.player, { revealLive: true, dim: false }),
    enemy: boardData(match.boards.bot, { revealLive: false, dim: true }),
  }
}
