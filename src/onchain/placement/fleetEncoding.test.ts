import { describe, expect, it } from 'vitest'
import { COMPLETE_FLEET } from '../../test/gameFixtures'
import { encodeFleetSegments, ENCRYPTED_FLEET_SEGMENT_COUNT } from './fleetEncoding'

describe('encrypted fleet encoding (GAME-602/603)', () => {
  it('encodes a complete fleet in public ship-slot order', () => {
    expect(encodeFleetSegments(COMPLETE_FLEET)).toEqual([
      93, 94, 95, 96,
      7, 17, 27,
      78, 88, 98,
      40, 41,
      5, 15,
      57, 58,
      81,
      74,
      39,
      43,
    ])
    expect(encodeFleetSegments(COMPLETE_FLEET)).toHaveLength(
      ENCRYPTED_FLEET_SEGMENT_COUNT,
    )
  })

  it('rejects incomplete and locally invalid fleets before encryption', () => {
    expect(() => encodeFleetSegments(COMPLETE_FLEET.slice(0, 9))).toThrow(
      'Fleet must be complete',
    )

    const touching = COMPLETE_FLEET.map((placement) => ({ ...placement }))
    touching[7] = { slot: 7, row: 8, col: 2, orientation: 'h' }
    expect(() => encodeFleetSegments(touching)).toThrow('Fleet must be complete')
  })
})
