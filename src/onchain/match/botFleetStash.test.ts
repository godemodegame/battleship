import { afterEach, describe, expect, it } from 'vitest'
import type { Placement } from '../../game/types'
import {
  clearBotFleets,
  peekBotFleets,
  resetBotFleetStash,
  stashBotFleets,
} from './botFleetStash'

const fleet = (slot: number): Placement[] => [{ slot, row: 0, col: 0, orientation: 'h' }]

afterEach(() => resetBotFleetStash())

describe('botFleetStash', () => {
  it('returns null when nothing is stashed (refresh / direct link)', () => {
    expect(peekBotFleets('dep', '1')).toBeNull()
  })

  it('stashes and peeks the player fleet by (deployment, match)', () => {
    stashBotFleets('dep', '7', { player: fleet(0) })
    const got = peekBotFleets('dep', '7')
    expect(got?.player).toEqual(fleet(0))
    // The bot fleet is deliberately never held: it stays encrypted on-chain.
    expect(got).not.toHaveProperty('bot')
  })

  it('isolates entries per deployment and per match id', () => {
    stashBotFleets('dep-a', '1', { player: fleet(0) })
    expect(peekBotFleets('dep-b', '1')).toBeNull()
    expect(peekBotFleets('dep-a', '2')).toBeNull()
  })

  it('peeks without consuming — a match spans many shots', () => {
    stashBotFleets('dep', '1', { player: fleet(0) })
    expect(peekBotFleets('dep', '1')).not.toBeNull()
    expect(peekBotFleets('dep', '1')).not.toBeNull()
  })

  it('stores defensive copies so a later store wipe cannot mutate the stash', () => {
    const player = fleet(0)
    stashBotFleets('dep', '1', { player })
    player.length = 0 // simulate the placement store clearing its array
    expect(peekBotFleets('dep', '1')?.player).toHaveLength(1)
  })

  it('clears a single match', () => {
    stashBotFleets('dep', '1', { player: fleet(0) })
    clearBotFleets('dep', '1')
    expect(peekBotFleets('dep', '1')).toBeNull()
  })
})
