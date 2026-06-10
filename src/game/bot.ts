import { BOARD_SIZE, CELL_COUNT, cellCol, cellIndex, cellRow } from './constants'
import { sunkHalo } from './engine'
import type { BoardState, Difficulty } from './types'

/**
 * Computer opponent per docs/computer-opponent-design.md, working only from
 * public shot results on the defender's board (never from ship positions):
 * - easy: uniform random over untried cells, no follow-up.
 * - normal: random hunt, then orthogonal follow-up around open hits.
 * - hard: placement-count heatmap over remaining ship lengths (subsumes
 *   parity search) with hit-adjacency weighting.
 */
export function chooseBotTarget(
  defender: BoardState,
  difficulty: Difficulty,
  rnd: () => number = Math.random,
): number {
  const untried: number[] = []
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (defender.shots[cell] === 0) untried.push(cell)
  }
  if (untried.length === 0) throw new Error('No cells left to attack')

  if (difficulty === 'easy') return untried[Math.floor(rnd() * untried.length)]

  const halo = sunkHalo(defender)
  const candidates = untried.filter((cell) => !halo.has(cell))
  const pool = candidates.length > 0 ? candidates : untried

  const openHits: number[] = []
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (defender.shots[cell] === 2) openHits.push(cell)
  }

  if (difficulty === 'normal') {
    if (openHits.length > 0) {
      const follow = followUpTargets(defender, openHits)
      if (follow.length > 0) return follow[Math.floor(rnd() * follow.length)]
    }
    return pool[Math.floor(rnd() * pool.length)]
  }

  return heatmapTarget(defender, pool, openHits, rnd)
}

/** Orthogonal neighbors worth trying around open hits; extends hit lines first. */
function followUpTargets(defender: BoardState, openHits: number[]): number[] {
  const hitSet = new Set(openHits)
  const tryable = (row: number, col: number) =>
    row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE &&
    defender.shots[cellIndex(row, col)] === 0

  // Two or more hits in a row/column: aim at the open ends of that line.
  const lineEnds: number[] = []
  for (const cell of openHits) {
    const row = cellRow(cell)
    const col = cellCol(cell)
    for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
      if (!hitSet.has(cellIndex(row + dr, col + dc))) continue
      let lo = 0
      while (hitSet.has(cellIndex(row - dr * (lo + 1), col - dc * (lo + 1)))) lo++
      let hi = 1
      while (hitSet.has(cellIndex(row + dr * (hi + 1), col + dc * (hi + 1)))) hi++
      const before = [row - dr * (lo + 1), col - dc * (lo + 1)] as const
      const after = [row + dr * (hi + 1), col + dc * (hi + 1)] as const
      if (tryable(...before)) lineEnds.push(cellIndex(...before))
      if (tryable(...after)) lineEnds.push(cellIndex(...after))
    }
  }
  if (lineEnds.length > 0) return [...new Set(lineEnds)]

  const around: number[] = []
  for (const cell of openHits) {
    const row = cellRow(cell)
    const col = cellCol(cell)
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      if (tryable(row + dr, col + dc)) around.push(cellIndex(row + dr, col + dc))
    }
  }
  return [...new Set(around)]
}

/**
 * Count every legal placement of each remaining ship length consistent with
 * the public shot map, weight placements that explain open hits, and fire at
 * the highest-scoring untried cell.
 */
function heatmapTarget(
  defender: BoardState,
  pool: number[],
  openHits: number[],
  rnd: () => number,
): number {
  const remaining = defender.ships.filter((s) => !s.sunk).map((s) => s.length)
  const halo = sunkHalo(defender)
  const heat = new Float32Array(CELL_COUNT)

  for (const length of remaining) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
          const endRow = row + dr * (length - 1)
          const endCol = col + dc * (length - 1)
          if (endRow >= BOARD_SIZE || endCol >= BOARD_SIZE) continue
          let hits = 0
          let blocked = false
          const cells: number[] = []
          for (let i = 0; i < length; i++) {
            const cell = cellIndex(row + dr * i, col + dc * i)
            const shot = defender.shots[cell]
            if (shot === 1 || shot === 3 || (shot === 0 && halo.has(cell))) {
              blocked = true
              break
            }
            if (shot === 2) hits++
            else cells.push(cell)
          }
          if (blocked) continue
          // Placements overlapping open hits are far more likely; weight
          // them so follow-up dominates the hunt heatmap.
          const weight = hits > 0 ? 50 * hits : 1
          for (const cell of cells) heat[cell] += weight
        }
      }
    }
  }

  // When hits exist but no placement explains them (shouldn't happen with
  // consistent rules), fall back to plain neighbor follow-up.
  if (openHits.length > 0 && pool.every((cell) => heat[cell] === 0)) {
    const follow = followUpTargets(defender, openHits)
    if (follow.length > 0) return follow[Math.floor(rnd() * follow.length)]
  }

  let best = -1
  let bestCells: number[] = []
  for (const cell of pool) {
    if (heat[cell] > best) {
      best = heat[cell]
      bestCells = [cell]
    } else if (heat[cell] === best) {
      bestCells.push(cell)
    }
  }
  return bestCells[Math.floor(rnd() * bestCells.length)]
}
