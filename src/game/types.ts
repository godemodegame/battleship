export type Orientation = 'h' | 'v'

export type ShipClassId =
  | 'carrier'
  | 'battleship'
  | 'cruiser'
  | 'destroyer'
  | 'submarine'
  | 'patrol-boat'

export interface ShipDef {
  slot: number
  classId: ShipClassId
  length: number
  label: string
}

export interface Placement {
  slot: number
  row: number
  col: number
  orientation: Orientation
}

export type ShotResult = 'miss' | 'hit' | 'sunk'

/** Per-cell shot state on a board: 0 untried, 1 miss, 2 hit, 3 part of a sunk ship. */
export type CellShot = 0 | 1 | 2 | 3

export interface PlacedShip extends ShipDef {
  row: number
  col: number
  orientation: Orientation
  cells: number[]
  hitMask: number
  sunk: boolean
}

export interface BoardState {
  ships: PlacedShip[]
  /** Index into ships[] for each cell, -1 when empty. */
  shipAt: number[]
  shots: CellShot[]
  /**
   * True for the on-chain enemy board, whose fleet is hidden: `ships` only ever
   * holds hulls reconstructed when a ship sinks (for rendering), so fleet
   * accounting must come from finalized moves, not from `ships`.
   */
  hidden?: boolean
}

export type Side = 'player' | 'bot'

export interface Move {
  by: Side
  cell: number
  result: ShotResult
  shipSlot: number | null
}

export interface MatchState {
  boards: Record<Side, BoardState>
  turn: Side
  moves: Move[]
  winner: Side | null
}

export type Difficulty = 'easy' | 'normal' | 'hard'
