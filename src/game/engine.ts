import { BOARD_SIZE, CELL_COUNT, FLEET, cellIndex } from './constants'
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
    hidden: true,
  }
}

/**
 * A match whose enemy fleet is hidden from this client (every on-chain mode):
 * the opponent board carries no ship geometry, so every player→enemy shot is
 * resolved from the chain and applied with `applyResolvedShot` — the client can
 * never know a hit/miss before the transaction.
 *
 * `playerPlacements` is the player's own fleet when this client still holds it
 * (it placed the fleet in this session). Pass `null` when it does not — a
 * reload drops the plaintext, since fleets are never persisted — and the
 * player's board is hidden too: incoming shots then land from the chain's
 * finalized results via `applyResolvedShotBy` instead of local geometry.
 */
export function createMatchVsHiddenEnemy(
  playerPlacements: Placement[] | null,
  firstTurn: Side = 'player',
): MatchState {
  return {
    boards: {
      player: playerPlacements ? buildBoard(playerPlacements) : emptyBoard(),
      bot: emptyBoard(),
    },
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

/** Orthogonally-connected run of hit/sunk cells through `from` (one ship). */
function connectedHitRun(shots: ReadonlyArray<CellShot>, from: number): number[] {
  const run: number[] = []
  const seen = new Set<number>()
  const stack = [from]
  while (stack.length > 0) {
    const c = stack.pop()!
    if (seen.has(c) || (shots[c] !== 2 && shots[c] !== 3)) continue
    seen.add(c)
    run.push(c)
    const row = Math.floor(c / BOARD_SIZE)
    const col = c % BOARD_SIZE
    if (row > 0) stack.push(cellIndex(row - 1, col))
    if (row < BOARD_SIZE - 1) stack.push(cellIndex(row + 1, col))
    if (col > 0) stack.push(cellIndex(row, col - 1))
    if (col < BOARD_SIZE - 1) stack.push(cellIndex(row, col + 1))
  }
  return run.sort((a, b) => a - b)
}

/** First FLEET def of a given length, for the rare null sunkShipSlot. */
function fleetByLength(length: number) {
  return FLEET.find((def) => def.length === length) ?? FLEET[FLEET.length - 1]
}

/**
 * Reveal a just-sunk enemy ship on the otherwise-hidden board. The ship's
 * footprint is reconstructed purely from public shot markers — the connected run
 * of hit/sunk cells through the final cell, which the no-touch rule guarantees is
 * exactly one ship — so this leaks nothing the player couldn't already deduce.
 * The reconstructed hull is appended (sunk) so the scene renders its destroyed
 * model, the whole run reads as sunk, and the no-touch halo is marked as misses.
 */
function revealSunkEnemyShip(
  board: BoardState,
  finalCell: number,
  shipSlot: number | null,
): BoardState {
  const cells = connectedHitRun(board.shots, finalCell)
  const rows = cells.map((c) => Math.floor(c / BOARD_SIZE))
  const cols = cells.map((c) => c % BOARD_SIZE)
  const orientation: 'h' | 'v' = new Set(rows).size === 1 ? 'h' : 'v'
  const def = shipSlot !== null ? FLEET[shipSlot] : fleetByLength(cells.length)

  const shots = board.shots.slice()
  for (const c of cells) shots[c] = 3
  const ships = board.ships.slice()
  const shipAt = board.shipAt.slice()
  const shipIndex = ships.length
  ships.push({
    slot: def.slot,
    classId: def.classId,
    label: def.label,
    length: cells.length,
    row: Math.min(...rows),
    col: Math.min(...cols),
    orientation,
    cells,
    hitMask: (1 << cells.length) - 1,
    sunk: true,
  })
  for (const c of cells) shipAt[c] = shipIndex
  const next: BoardState = { ...board, ships, shipAt, shots }
  markSunkHaloMisses(shots, next, shipIndex)
  return next
}

/**
 * Apply a chain-decided shot result to the board the shot was fired at. Unlike
 * `applyShot` it never consults a known fleet — it stamps the cell marker
 * (miss/hit/sunk) and threads the turn + winner the contract reported. On a
 * sink it additionally reveals the ship's destroyed hull and the no-touch halo,
 * reconstructed from the now-public markers (see `revealSunkEnemyShip`), so no
 * geometry was known before the kill.
 *
 * `by` is the attacker: 'player' marks the hidden enemy board (both on-chain
 * modes), 'bot' marks the player's own board, which is how an opponent's shot
 * lands when this client no longer holds its own plaintext fleet.
 */
export function applyResolvedShotBy(
  match: MatchState,
  by: Side,
  cell: number,
  resolved: ResolvedShot,
): { match: MatchState; move: Move } {
  const defender: Side = by === 'player' ? 'bot' : 'player'
  const board = match.boards[defender]
  const shots = board.shots.slice()
  shots[cell] = resolved.result === 'miss' ? 1 : resolved.result === 'hit' ? 2 : 3
  const move: Move = { by, cell, result: resolved.result, shipSlot: resolved.shipSlot }
  const nextBoard =
    resolved.result === 'sunk'
      ? revealSunkEnemyShip({ ...board, shots }, cell, resolved.shipSlot)
      : { ...board, shots }
  return {
    match: {
      boards: { ...match.boards, [defender]: nextBoard },
      // A miss passes the turn to the defender; anything else keeps it.
      turn: resolved.result === 'miss' ? defender : by,
      moves: [...match.moves, move],
      winner: resolved.winner ? by : null,
    },
    move,
  }
}

/** Chain-resolved player shot against the hidden enemy board. */
export function applyResolvedShot(
  match: MatchState,
  cell: number,
  resolved: ResolvedShot,
): { match: MatchState; move: Move } {
  return applyResolvedShotBy(match, 'player', cell, resolved)
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
