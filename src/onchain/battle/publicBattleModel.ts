/**
 * Contract → public battle render model (GAME-701 / GAME-702).
 *
 * Decodes the public board bitmasks and finalized move history from the
 * authoritative `ChainMatchView` into the mode-neutral
 * `PublicBattleRenderModel`. Everything here is public on-chain data: attacked,
 * miss, hit, and sunk cell masks, finalized results, and ship-count metadata.
 * No hit/sunk/winner computation happens on the frontend — this module only
 * reshapes values the contract already resolved.
 */

import { CELL_COUNT } from '../../game/constants'
import type {
  Address,
  PublicBattleRenderModel,
  PublicBoardRenderState,
  PublicMove,
  PublicPhase,
  PublicResult,
} from '../renderModel'
import { decodePublicBoard } from '../renderModel'
import type {
  ChainMatchView,
  ChainMoveView,
  PublicBoardView,
} from '../client/mapping'

export const TOTAL_SHIPS = 10

/** Decode a uint128 board mask (bit index == cell index) into cell numbers. */
export function maskToCells(mask: bigint): number[] {
  const cells: number[] = []
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if ((mask >> BigInt(cell)) & 1n) cells.push(cell)
  }
  return cells
}

/**
 * Count a defender's remaining ships from finalized moves: every finalized
 * `Sunk` or `Win` against them sank exactly one ship (the contract's encrypted
 * pipeline guarantees this), so no per-cell placement data is needed.
 */
export function shipsRemainingFor(
  defender: Address | null,
  moves: ReadonlyArray<ChainMoveView>,
): number {
  if (!defender) return TOTAL_SHIPS
  let sunkShips = 0
  for (const move of moves) {
    if (!move.finalized || move.defender !== defender) continue
    if (move.result === 'Sunk' || move.result === 'Win') sunkShips += 1
  }
  return Math.max(0, TOTAL_SHIPS - sunkShips)
}

/** Decode one player's public board masks plus their remaining-ship count. */
export function decodeChainBoard(
  board: PublicBoardView,
  shipsRemaining: number,
): PublicBoardRenderState {
  return decodePublicBoard({
    misses: maskToCells(board.missMask),
    hits: maskToCells(board.hitMask),
    sunk: maskToCells(board.sunkMask),
    shipsRemaining,
  })
}

function toPublicResult(move: ChainMoveView): PublicResult | null {
  switch (move.result) {
    case 'Miss':
      return 'miss'
    case 'Hit':
      return 'hit'
    // A Win is the final sunk ship; the render result is 'sunk'.
    case 'Sunk':
    case 'Win':
      return 'sunk'
    default:
      return null
  }
}

/** The newest finalized move as a render `PublicMove`, or null. */
export function latestFinalizedMove(
  moves: ReadonlyArray<ChainMoveView> | undefined,
): PublicMove | null {
  if (!moves) return null
  for (let i = moves.length - 1; i >= 0; i--) {
    const move = moves[i]
    if (!move.finalized) continue
    const result = toPublicResult(move)
    if (!result) continue
    return { moveId: move.moveId, cell: move.cellIndex, result }
  }
  return null
}

function toPublicPhase(match: ChainMatchView, viewer: Address): PublicPhase {
  switch (match.status) {
    case 'InProgress':
      return match.currentTurn === viewer ? 'player-turn' : 'opponent-turn'
    case 'ResolvingShot':
      return 'resolving'
    case 'Finished':
    case 'Forfeited':
      return 'finished'
    default:
      return 'waiting'
  }
}

/**
 * Build the viewer's `PublicBattleRenderModel` from authoritative contract
 * reads. Returns `null` when the viewer is not a player or the player boards
 * have not been loaded — spectators never receive a battle model.
 */
export function buildPublicBattleModel(
  match: ChainMatchView,
  viewer: Address,
  selectedCell: number | null = null,
): PublicBattleRenderModel | null {
  const players = match.players
  if (!players) return null

  const isCreator = match.creator === viewer
  const isOpponent = match.opponent === viewer
  if (!isCreator && !isOpponent) return null

  const mySlot = isCreator ? players.creator : players.opponent
  const theirSlot = isCreator ? players.opponent : players.creator
  const myAddress = isCreator ? match.creator : match.opponent
  const theirAddress = isCreator ? match.opponent : match.creator
  const moves = match.moves ?? []

  return {
    phase: toPublicPhase(match, viewer),
    perspective: isCreator ? 'creator' : 'opponent',
    currentTurn: match.currentTurn,
    winner: match.winner,
    // The viewer's own board records shots *against* them (they defend it).
    playerBoard: decodeChainBoard(
      mySlot.publicBoard,
      shipsRemainingFor(myAddress, moves),
    ),
    opponentBoard: decodeChainBoard(
      theirSlot.publicBoard,
      shipsRemainingFor(theirAddress, moves),
    ),
    selectedCell,
    latestFinalizedMove: latestFinalizedMove(match.moves),
  }
}
