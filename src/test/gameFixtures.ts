import type { MatchState, Placement } from '../game/types'

export function seededRandom(seed: number): () => number {
  return () => {
    let value = (seed += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export const COMPLETE_FLEET: Placement[] = [
  { slot: 0, row: 9, col: 3, orientation: 'h' },
  { slot: 1, row: 0, col: 7, orientation: 'v' },
  { slot: 2, row: 7, col: 8, orientation: 'v' },
  { slot: 3, row: 4, col: 0, orientation: 'h' },
  { slot: 4, row: 0, col: 5, orientation: 'v' },
  { slot: 5, row: 5, col: 7, orientation: 'h' },
  { slot: 6, row: 8, col: 1, orientation: 'h' },
  { slot: 7, row: 7, col: 4, orientation: 'h' },
  { slot: 8, row: 3, col: 9, orientation: 'v' },
  { slot: 9, row: 4, col: 3, orientation: 'h' },
]

export function cloneMatch(match: MatchState): MatchState {
  return structuredClone(match)
}
