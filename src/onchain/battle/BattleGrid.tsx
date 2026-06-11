/**
 * Public battle board grid (GAME-702 / GAME-703).
 *
 * Renders one decoded `PublicBoardRenderState` as a tappable 10×10 grid. Cell
 * states come only from finalized public contract data (miss/hit/sunk masks);
 * untried cells on an interactive grid are the only enabled targets, so an
 * already-attacked cell can never be selected (the contract would revert it
 * with `CellAlreadyAttacked` anyway).
 */

import { cellLabel } from '../../game/constants'
import type { PublicBoardRenderState } from '../renderModel'

const CELLS = Array.from({ length: 100 }, (_, cell) => cell)

function cellState(board: PublicBoardRenderState, cell: number): string {
  if (board.sunk.has(cell)) return 'sunk'
  if (board.hits.has(cell)) return 'hit'
  if (board.misses.has(cell)) return 'miss'
  return 'untried'
}

export interface BattleGridProps {
  board: PublicBoardRenderState
  /** Accessible name for the grid. */
  label: string
  /** Allow selecting untried cells (the viewer's valid turn only, GAME-703). */
  interactive: boolean
  selectedCell?: number | null
  onSelect?: (cell: number) => void
  /** Cell of the most recent finalized move, briefly highlighted (GAME-707). */
  flashCell?: number | null
  testId: string
}

export function BattleGrid({
  board,
  label,
  interactive,
  selectedCell = null,
  onSelect,
  flashCell = null,
  testId,
}: BattleGridProps) {
  return (
    <div className="battle-grid" role="grid" aria-label={label} data-testid={testId}>
      {CELLS.map((cell) => {
        const state = cellState(board, cell)
        const attacked = state !== 'untried'
        const canTarget = interactive && !attacked
        return (
          <button
            key={cell}
            type="button"
            role="gridcell"
            className={[
              'battle-cell',
              state,
              selectedCell === cell ? 'selected' : '',
              flashCell === cell ? 'flash' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={`${cellLabel(cell)}, ${state}`}
            data-cell={cell}
            data-cell-state={state}
            disabled={!canTarget}
            onClick={canTarget ? () => onSelect?.(cell) : undefined}
          >
            {state === 'miss' ? '·' : state === 'hit' || state === 'sunk' ? '✕' : ''}
          </button>
        )
      })}
    </div>
  )
}
