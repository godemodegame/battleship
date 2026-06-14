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

/** A board with no known geometry: only shot markers ever land on it. */
export function emptyBoard(): BoardState {
  return {
    ships: [],
    shipAt: new Array<number>(CELL_COUNT).fill(-1),
    shots: new Array<CellShot>(CELL_COUNT).fill(0),
  }
}

/**
 * A match whose enemy fleet is hidden from this client (on-chain bot mode): the
 * player's own board is fully known, but the opponent board carries no ship
 * geometry. Every player→enemy shot is resolved from the chain and applied with
 * `applyResolvedShot`, so the client can never know a hit/miss before the tx —
 * exactly like a human opponent in PvP.
 */
export function createMatchVsHiddenEnemy(
  playerPlacements: Placement[],
  firstTurn: Side = 'player',
): MatchState {
  return {
    boards: { player: buildBoard(playerPlacements), bot: emptyBoard() },
    turn: firstTurn,
    moves: [],
    winner: null,
  }
}

/** A shot outcome decided elsewhere (the chain), not by local fleet geometry. */
export interface ResolvedShot {
  result: ShotResult
  /** FLEET slot of the ship this shot sank, or null when nothing sank. */
  shipSlot: number | null
  /** True when this shot ended the match for the attacker. */
  winner: boolean
}

/**
 * Apply a chain-decided result of a player's shot to the hidden enemy board.
 * Unlike `applyShot`, it never consults ship geometry (there is none) — it only
 * stamps the cell marker (miss/hit/sunk) and threads the turn + winner the
 * contract reported. The contract's MVP sunk rule marks just the final cell, so
 * no no-touch halo is drawn for the enemy.
 */
export function applyResolvedShot(
  match: MatchState,
  cell: number,
  resolved: ResolvedShot,
): { match: MatchState; move: Move } {
  const board = match.boards.bot
  const shots = board.shots.slice()
  shots[cell] = resolved.result === 'miss' ? 1 : resolved.result === 'hit' ? 2 : 3
  const move: Move = { by: 'player', cell, result: resolved.result, shipSlot: resolved.shipSlot }
  return {
    match: {
      boards: { ...match.boards, bot: { ...board, shots } },
      turn: resolved.result === 'miss' ? 'bot' : 'player',
      moves: [...match.moves, move],
      winner: resolved.winner ? 'player' : null,
    },
    move,
  }
}

const otherSide = (side: Side): Side => (side === 'player' ? 'bot' : 'player')

/** Adjacent cells that are empty or belong to a different ship (classic no-touch halo). */
function haloCellsAroundShip(board: BoardState, shipIndex: number): number[] {
  const cells: number[] = []
  const seen = new Set<number>()
  for (const cell of board.ships[shipIndex].cells) {
    for (const near of neighborhood(cell)) {
      if (board.shipAt[near] !== board.shipAt[cell] && !seen.has(near)) {
        seen.add(near)
        cells.push(near)
      }
    }
  }
  return cells
}

/** Mark provably empty halo cells as misses without overwriting prior shots. */
export function markSunkHaloMisses(
  shots: CellShot[],
  board: BoardState,
  shipIndex: number,
): void {
  for (const near of haloCellsAroundShip(board, shipIndex)) {
    if (shots[near] === 0) shots[near] = 1
  }
}

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
    markSunkHaloMisses(shots, board, shipIndex)
  } else {
    shots[cell] = 2
  }
  return {
    board: { ...board, ships, shots },
    result: sunk ? 'sunk' : 'hit',
    shipSlot: ship.slot,
  }
}

const allSunk = (board: BoardState) => board.ships.every((s) => s.sunk)

const isAttacked = (board: BoardState, cell: number) => board.shots[cell] !== 0

/**
 * Resolve an attack by `by` against the opposing board. Returns a new match
 * state. A miss passes the turn; a hit or sunk ship grants another shot.
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
      turn: result === 'miss' ? defender : by,
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
  for (const [shipIndex, ship] of board.ships.entries()) {
    if (!ship.sunk) continue
    for (const near of haloCellsAroundShip(board, shipIndex)) halo.add(near)
  }
  return halo
}
