import { FLEET } from '../../game/constants'
import { isFleetComplete, shipCells } from '../../game/board'
import type { Placement } from '../../game/types'

export const ENCRYPTED_FLEET_SEGMENT_COUNT = 20

/**
 * Encode a locally valid fleet into the Phase 4 contract order:
 * carrier(4), battleship(3), cruiser(3), three length-2 ships, four patrols.
 *
 * Ship identity is the public array position, so preserving `FLEET` slot order
 * is part of the contract ABI. Only cell indexes are encrypted.
 */
export function encodeFleetSegments(
  placements: ReadonlyArray<Placement | null>,
): readonly number[] {
  if (!isFleetComplete(placements)) {
    throw new Error('Fleet must be complete before encryption')
  }

  const segments = placements.flatMap((placement, slot) => {
    const cells = shipCells(placement, FLEET[slot].length)
    if (!cells) throw new Error('Fleet contains an out-of-bounds ship')
    return cells
  })

  if (segments.length !== ENCRYPTED_FLEET_SEGMENT_COUNT) {
    throw new Error('Fleet encoding must contain exactly 20 segments')
  }
  return segments
}
