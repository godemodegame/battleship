import type { ShipDef } from './types'

export const BOARD_SIZE = 10
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE

/**
 * Classic fleet from docs/game-mechanics.md: 1x4, 2x3, 3x2, 4x1.
 * Class ids map to the runtime ship models; the carrier is the
 * four-cell flagship per assets/3d-models/README.md.
 */
export const FLEET: ShipDef[] = [
  { slot: 0, classId: 'carrier', length: 4, label: 'Carrier' },
  { slot: 1, classId: 'battleship', length: 3, label: 'Battleship' },
  { slot: 2, classId: 'cruiser', length: 3, label: 'Cruiser' },
  { slot: 3, classId: 'destroyer', length: 2, label: 'Destroyer' },
  { slot: 4, classId: 'submarine', length: 2, label: 'Submarine' },
  { slot: 5, classId: 'destroyer', length: 2, label: 'Destroyer' },
  { slot: 6, classId: 'patrol-boat', length: 1, label: 'Patrol Boat' },
  { slot: 7, classId: 'patrol-boat', length: 1, label: 'Patrol Boat' },
  { slot: 8, classId: 'patrol-boat', length: 1, label: 'Patrol Boat' },
  { slot: 9, classId: 'patrol-boat', length: 1, label: 'Patrol Boat' },
]

const COLUMN_LETTERS = 'ABCDEFGHIJ'

export const cellRow = (cell: number) => Math.floor(cell / BOARD_SIZE)
export const cellCol = (cell: number) => cell % BOARD_SIZE
export const cellIndex = (row: number, col: number) => row * BOARD_SIZE + col

export const cellLabel = (cell: number) =>
  `${COLUMN_LETTERS[cellCol(cell)]}${cellRow(cell) + 1}`
