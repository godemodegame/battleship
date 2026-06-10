import { CELL_COUNT, FLEET } from './constants'
import { neighborhood, shipCells } from './board'
import type {
  BoardState,
  CellShot,
  MatchState,
  Move,
  Placement,
  ShotResult,
  Side,
} from './types'

export function buildBoard(placements: Placement[]): BoardState {
  const ships = placements.map((p) => {
    const def = FLEET[p.slot]
    const cells = shipCells(p, def.length)
    if (!cells) throw new Error(`Invalid placement for slot ${p.slot}`)
    return {
      ...def,
      row: p.row,
      col: p.col,
      orientation: p.orientation,
      cells,
      hitMask: 0,
      sunk: false,
    }
  })
  const shipAt = new Array<number>(CELL_COUNT).fill(-1)
  ships.forEach((ship, index) => {
    for (const cell of ship.cells) shipAt[cell] = index
  })
  return { ships, shipAt, shots: new Array<CellShot>(CELL_COUNT).fill(0) }
}

export function createMatch(
  playerPlacements: Placement[],
  botPlacements: Placement[],
  firstTurn: Side = 'player',
): MatchState {
  return {
    boards: {
      player: buildBoard(playerPlacements),
      bot: buildBoard(botPlacements),
    },
    turn: firstTurn,
    moves: [],
    winner: null,
  }
}

export const otherSide = (side: Side): Side => (side === 'player' ? 'bot' : 'player')

function applyShot(board: BoardState, cell: number): { board: BoardState; result: ShotResult; shipSlot: number | null } {
  const shots = board.shots.slice()
  const shipIndex = board.shipAt[cell]
  if (shipIndex < 0) {
    shots[cell] = 1
    return { board: { ...board, shots }, result: 'miss', shipSlot: null }
  }
  const ships = board.ships.slice()
  const ship = { ...ships[shipIndex] }
  ships[shipIndex] = ship
  ship.hitMask |= 1 << ship.cells.indexOf(cell)
  const sunk = ship.hitMask === (1 << ship.length) - 1
  if (sunk) {
    ship.sunk = true
    for (const c of ship.cells) shots[c] = 3
  } else {
    shots[cell] = 2
  }
  return {
    board: { ...board, ships, shots },
    result: sunk ? 'sunk' : 'hit',
    shipSlot: ship.slot,
  }
}

export const allSunk = (board: BoardState) => board.ships.every((s) => s.sunk)

export const isAttacked = (board: BoardState, cell: number) => board.shots[cell] !== 0

/**
 * Resolve an attack by `by` against the opposing board. Returns a new match
 * state; per docs/game-mechanics.md the turn passes after every valid attack.
 */
export function applyAttack(
  match: MatchState,
  by: Side,
  cell: number,
): { match: MatchState; move: Move } {
  const defender = otherSide(by)
  if (match.winner || match.turn !== by || isAttacked(match.boards[defender], cell)) {
    throw new Error('Invalid attack')
  }
  const { board, result, shipSlot } = applyShot(match.boards[defender], cell)
  const move: Move = { by, cell, result, shipSlot }
  const winner = allSunk(board) ? by : null
  return {
    match: {
      boards: { ...match.boards, [defender]: board },
      turn: winner ? match.turn : defender,
      moves: [...match.moves, move],
      winner,
    },
    move,
  }
}

/**
 * Cells that are provably empty because they touch a sunk ship under the
 * classic no-touch rule. Pure deduction from public results — used for UI
 * dimming and to keep the bot from wasting shots.
 */
export function sunkHalo(board: BoardState): Set<number> {
  const halo = new Set<number>()
  for (const ship of board.ships) {
    if (!ship.sunk) continue
    for (const cell of ship.cells) {
      for (const near of neighborhood(cell)) {
        if (board.shipAt[near] !== board.shipAt[cell]) halo.add(near)
      }
    }
  }
  return halo
}
