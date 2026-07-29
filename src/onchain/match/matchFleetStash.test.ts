import { afterEach, describe, expect, it } from 'vitest'
import type { Placement } from '../../game/types'
import {
  clearMatchFleet,
  peekMatchFleet,
  resetMatchFleetStash,
  stashMatchFleet,
} from './matchFleetStash'

const fleet = (slot: number): Placement[] => [{ slot, row: 0, col: 0, orientation: 'h' }]

afterEach(() => resetMatchFleetStash())

describe('matchFleetStash', () => {
  it('returns null when nothing is stashed (refresh / direct link)', () => {
    expect(peekMatchFleet('dep', '1')).toBeNull()
  })

  it('stashes and peeks the player fleet by (deployment, match)', () => {
    stashMatchFleet('dep', '7', { player: fleet(0) })
    // Only the player's own placement is ever held; the opponent's stays
    // encrypted on-chain.
    expect(peekMatchFleet('dep', '7')).toEqual(fleet(0))
  })

  it('isolates entries per deployment and per match id', () => {
    stashMatchFleet('dep-a', '1', { player: fleet(0) })
    expect(peekMatchFleet('dep-b', '1')).toBeNull()
    expect(peekMatchFleet('dep-a', '2')).toBeNull()
  })

  it('peeks without consuming — a match spans many shots', () => {
    stashMatchFleet('dep', '1', { player: fleet(0) })
    expect(peekMatchFleet('dep', '1')).not.toBeNull()
    expect(peekMatchFleet('dep', '1')).not.toBeNull()
  })

  it('stores defensive copies so a later store wipe cannot mutate the stash', () => {
    const player = fleet(0)
    stashMatchFleet('dep', '1', { player })
    player.length = 0 // simulate the placement store clearing its array
    expect(peekMatchFleet('dep', '1')).toHaveLength(1)
  })

  it('clears a single match', () => {
    stashMatchFleet('dep', '1', { player: fleet(0) })
    clearMatchFleet('dep', '1')
    expect(peekMatchFleet('dep', '1')).toBeNull()
  })
})
