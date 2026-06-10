import { BOARD_SIZE, CELL_COUNT, FLEET, cellIndex } from './constants'
import type { Orientation, Placement } from './types'

/** Cells covered by a placement, or null when it runs off the board. */
export function shipCells(p: Placement, length: number): number[] | null {
  const cells: number[] = []
  for (let i = 0; i < length; i++) {
    const row = p.row + (p.orientation === 'v' ? i : 0)
    const col = p.col + (p.orientation === 'h' ? i : 0)
    if (row >= BOARD_SIZE || col >= BOARD_SIZE || row < 0 || col < 0) return null
    cells.push(cellIndex(row, col))
  }
  return cells
}

export function neighborhood(cell: number): number[] {
  const row = Math.floor(cell / BOARD_SIZE)
  const col = cell % BOARD_SIZE
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr
      const c = col + dc
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        out.push(cellIndex(r, c))
      }
    }
  }
  return out
}

function occupancyExcluding(
  placements: ReadonlyArray<Placement | null>,
  excludeSlot: number,
): Int8Array {
  const occupied = new Int8Array(CELL_COUNT).fill(0)
  for (const p of placements) {
    if (!p || p.slot === excludeSlot) continue
    const cells = shipCells(p, FLEET[p.slot].length)
    if (!cells) continue
    for (const cell of cells) occupied[cell] = 1
  }
  return occupied
}

/**
 * Classic no-touch rule: the candidate ship must stay on the board and no
 * cell of its 3x3 neighborhood may belong to another ship.
 */
export function canPlace(
  placements: ReadonlyArray<Placement | null>,
  candidate: Placement,
): boolean {
  const cells = shipCells(candidate, FLEET[candidate.slot].length)
  if (!cells) return false
  const occupied = occupancyExcluding(placements, candidate.slot)
  for (const cell of cells) {
    for (const near of neighborhood(cell)) {
      if (occupied[near]) return false
    }
  }
  return true
}

export function isFleetComplete(
  placements: ReadonlyArray<Placement | null>,
): placements is Placement[] {
  return (
    placements.length === FLEET.length &&
    placements.every((p, slot) => p !== null && canPlace(placements, { ...p!, slot }))
  )
}

export function autoPlaceFleet(rnd: () => number = Math.random): Placement[] {
  for (let attempt = 0; attempt < 100; attempt++) {
    const placements: (Placement | null)[] = FLEET.map(() => null)
    let failed = false
    for (const def of [...FLEET].sort((a, b) => b.length - a.length)) {
      let placed = false
      for (let tries = 0; tries < 300; tries++) {
        const candidate: Placement = {
          slot: def.slot,
          row: Math.floor(rnd() * BOARD_SIZE),
          col: Math.floor(rnd() * BOARD_SIZE),
          orientation: rnd() < 0.5 ? 'h' : 'v',
        }
        if (canPlace(placements, candidate)) {
          placements[def.slot] = candidate
          placed = true
          break
        }
      }
      if (!placed) {
        failed = true
        break
      }
    }
    if (!failed) return placements as Placement[]
  }
  throw new Error('Auto placement failed')
}

export function rotated(orientation: Orientation): Orientation {
  return orientation === 'h' ? 'v' : 'h'
}
