import { describe, expect, it } from 'vitest'
import { FLEET } from './constants'
import { autoPlaceFleet, canPlace, isFleetComplete, shipCells } from './board'
import type { Placement } from './types'
import { COMPLETE_FLEET, seededRandom } from '../test/gameFixtures'

describe('shipCells', () => {
  it('covers every fleet length horizontally and vertically', () => {
    for (const ship of FLEET) {
      expect(shipCells({ slot: ship.slot, row: 1, col: 1, orientation: 'h' }, ship.length))
        .toEqual(Array.from({ length: ship.length }, (_, index) => 11 + index))
      expect(shipCells({ slot: ship.slot, row: 1, col: 1, orientation: 'v' }, ship.length))
        .toEqual(Array.from({ length: ship.length }, (_, index) => 11 + index * 10))
    }
  })

  it('rejects placements crossing every board edge', () => {
    expect(shipCells({ slot: 0, row: 0, col: 7, orientation: 'h' }, 4)).toBeNull()
    expect(shipCells({ slot: 0, row: 7, col: 0, orientation: 'v' }, 4)).toBeNull()
    expect(shipCells({ slot: 0, row: -1, col: 0, orientation: 'h' }, 4)).toBeNull()
    expect(shipCells({ slot: 0, row: 0, col: -1, orientation: 'v' }, 4)).toBeNull()
  })
})

describe('canPlace', () => {
  const existing: (Placement | null)[] = FLEET.map(() => null)
  existing[3] = { slot: 3, row: 4, col: 4, orientation: 'h' }

  it('accepts a valid empty-board placement', () => {
    expect(canPlace(FLEET.map(() => null), existing[3]!)).toBe(true)
  })

  it('rejects overlap and orthogonal or diagonal adjacency', () => {
    expect(canPlace(existing, { slot: 4, row: 4, col: 4, orientation: 'v' })).toBe(false)
    expect(canPlace(existing, { slot: 4, row: 3, col: 4, orientation: 'h' })).toBe(false)
    expect(canPlace(existing, { slot: 4, row: 3, col: 3, orientation: 'h' })).toBe(false)
  })

  it('accepts a ship separated by one empty row or column', () => {
    expect(canPlace(existing, { slot: 4, row: 2, col: 4, orientation: 'h' })).toBe(true)
    expect(canPlace(existing, { slot: 4, row: 4, col: 7, orientation: 'v' })).toBe(true)
  })

  it('excludes the candidate slot when re-validating a placement', () => {
    expect(canPlace(existing, existing[3]!)).toBe(true)
    expect(canPlace(existing, { ...existing[3]!, row: 2 })).toBe(true)
  })

  it('rejects off-board candidates', () => {
    expect(canPlace(existing, { slot: 0, row: 9, col: 8, orientation: 'h' })).toBe(false)
  })
})

describe('isFleetComplete', () => {
  it('accepts a known-good ten-ship layout', () => {
    expect(isFleetComplete(COMPLETE_FLEET)).toBe(true)
  })

  it('rejects missing, touching, and wrong-length layouts', () => {
    const missing = COMPLETE_FLEET.map((placement) => ({ ...placement })) as (Placement | null)[]
    missing[4] = null
    expect(isFleetComplete(missing)).toBe(false)

    const touching = COMPLETE_FLEET.map((placement) => ({ ...placement }))
    touching[9] = { slot: 9, row: 4, col: 2, orientation: 'h' }
    expect(isFleetComplete(touching)).toBe(false)
    expect(isFleetComplete(COMPLETE_FLEET.slice(0, -1))).toBe(false)
  })
})

describe('autoPlaceFleet', () => {
  it('is deterministic and complete for a fixed seed', () => {
    const first = autoPlaceFleet(seededRandom(42))
    const second = autoPlaceFleet(seededRandom(42))

    expect(first).toEqual(second)
    expect(isFleetComplete(first)).toBe(true)
  })

  it('produces complete fleets across hundreds of seeds', () => {
    for (let seed = 0; seed < 400; seed++) {
      expect(isFleetComplete(autoPlaceFleet(seededRandom(seed)))).toBe(true)
    }
  })
})
