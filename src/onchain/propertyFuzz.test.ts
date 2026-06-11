/**
 * GAME-902 (frontend half): property/fuzz tests for the public cell and mask
 * encodings that bridge the contract and the renderer.
 *
 * A seeded PRNG drives hundreds of random fleets and masks through:
 * - `encodeFleetSegments`: every random valid local fleet must produce the
 *   frozen 20-segment contract encoding (in-range, per-ship contiguous with
 *   deltas of exactly 1 or 10, horizontal ships inside one row);
 * - `maskToCells`: bigint mask → cells must round-trip and stay sorted;
 * - `decodePublicBoard` (via `decodeChainBoard`): random consistent mask
 *   triples must partition cells with the documented precedence
 *   (sunk > hit > miss).
 */

import { describe, expect, it } from 'vitest'
import { autoPlaceFleet, shipCells } from '../game/board'
import { BOARD_SIZE, CELL_COUNT, FLEET } from '../game/constants'
import type { Placement } from '../game/types'
import { decodeChainBoard, maskToCells } from './battle/publicBattleModel'
import { encodeFleetSegments } from './placement/fleetEncoding'

const SEED = 0x902

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function cellsToMask(cells: Iterable<number>): bigint {
  let mask = 0n
  for (const cell of cells) mask |= 1n << BigInt(cell)
  return mask
}

describe('fleet segment encoding properties (GAME-902)', () => {
  it('encodes 300 random valid fleets into the frozen contract shape', () => {
    const rng = mulberry32(SEED)
    for (let round = 0; round < 300; round++) {
      const placements = autoPlaceFleet(rng)
      const segments = encodeFleetSegments(placements)

      expect(segments).toHaveLength(20)
      // Slot order is part of the ABI: each ship's block must equal its own
      // shipCells in order.
      let offset = 0
      for (const def of FLEET) {
        const expected = shipCells(placements[def.slot], def.length)
        expect(expected).not.toBeNull()
        expect(segments.slice(offset, offset + def.length)).toEqual(expected)
        offset += def.length
      }

      for (const cell of segments) {
        expect(cell).toBeGreaterThanOrEqual(0)
        expect(cell).toBeLessThan(CELL_COUNT)
      }

      // The contract's validity predicate must hold for every encoded fleet:
      // consecutive deltas of exactly 1 (same row) or 10 throughout a ship.
      offset = 0
      for (const def of FLEET) {
        const block = segments.slice(offset, offset + def.length)
        if (def.length > 1) {
          const delta = block[1] - block[0]
          expect([1, BOARD_SIZE]).toContain(delta)
          for (let i = 1; i < block.length; i++) {
            expect(block[i] - block[i - 1]).toBe(delta)
          }
          if (delta === 1) {
            const row = Math.floor(block[0] / BOARD_SIZE)
            expect(Math.floor(block[block.length - 1] / BOARD_SIZE)).toBe(row)
          }
        }
        offset += def.length
      }

      // Local validity also means no overlap: 20 distinct cells.
      expect(new Set(segments).size).toBe(20)
    }
  })

  it('rejects incomplete fleets instead of encoding partial data', () => {
    const rng = mulberry32(SEED + 1)
    const placements: Array<Placement | null> = [...autoPlaceFleet(rng)]
    placements[3] = null
    expect(() => encodeFleetSegments(placements)).toThrow()
  })
})

describe('public mask decoding properties (GAME-902)', () => {
  it('mask → cells round-trips for 500 random masks and stays sorted', () => {
    const rng = mulberry32(SEED + 2)
    for (let round = 0; round < 500; round++) {
      const cells = new Set<number>()
      const count = Math.floor(rng() * 40)
      for (let i = 0; i < count; i++) cells.add(Math.floor(rng() * CELL_COUNT))

      const mask = cellsToMask(cells)
      const decoded = maskToCells(mask)
      expect(decoded).toEqual([...cells].sort((a, b) => a - b))
      expect(cellsToMask(decoded)).toBe(mask)
    }
    expect(maskToCells(0n)).toEqual([])
  })

  it('decodes 200 random consistent board masks with sunk > hit > miss precedence', () => {
    const rng = mulberry32(SEED + 3)
    for (let round = 0; round < 200; round++) {
      // Build a consistent triple the way the contract does: disjoint miss and
      // hit sets, sunk a subset of hit.
      const miss = new Set<number>()
      const hit = new Set<number>()
      for (let i = 0; i < 30; i++) {
        const cell = Math.floor(rng() * CELL_COUNT)
        if (hit.has(cell) || miss.has(cell)) continue
        if (rng() < 0.5) miss.add(cell)
        else hit.add(cell)
      }
      const hitList = [...hit]
      const sunk = new Set(hitList.filter(() => rng() < 0.3))

      // A stale miss on an already-hit cell must lose to the hit.
      const staleMissCell = hitList.length > 0 && rng() < 0.5 ? hitList[0] : null
      const missInput = staleMissCell === null ? miss : new Set([...miss, staleMissCell])

      const board = decodeChainBoard(
        {
          attackedMask: cellsToMask([...missInput, ...hit]),
          missMask: cellsToMask(missInput),
          hitMask: cellsToMask(hit),
          sunkMask: cellsToMask(sunk),
        },
        10,
      )

      expect(board.sunk).toEqual(sunk)
      expect(board.hits).toEqual(hit)
      expect(board.misses).toEqual(miss) // the stale miss is dropped
      expect(board.attacked).toEqual(new Set([...miss, ...hit]))
      expect(board.shipsRemaining).toBe(10)
      for (const cell of board.sunk) expect(board.hits.has(cell)).toBe(true)
      for (const cell of board.misses) expect(board.hits.has(cell)).toBe(false)
    }
  })
})
