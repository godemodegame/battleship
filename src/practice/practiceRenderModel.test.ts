import { describe, expect, it } from 'vitest'
import { applyAttack, createMatch } from '../game/engine'
import { emptyBattleRenderModel } from '../render/model'
import { practiceBattleModel } from './practiceRenderModel'

// A single two-cell ship at A1-B1 (cells 0 and 1) for both fleets.
const ship = [{ slot: 3, row: 0, col: 0, orientation: 'h' as const }]

describe('practiceBattleModel (GAME-104/107)', () => {
  it('returns an empty model when there is no match', () => {
    expect(practiceBattleModel(null)).toEqual(emptyBattleRenderModel())
  })

  it('hides un-sunk enemy hulls but reveals the full player fleet', () => {
    const match = createMatch(ship, ship)
    const model = practiceBattleModel(match)
    expect(model.player.ships).toHaveLength(1)
    expect(model.player.ships[0].sunk).toBe(false)
    expect(model.enemy.ships).toHaveLength(0)
  })

  it('reveals sunk enemy hulls and dims the no-touch halo', () => {
    let match = createMatch(ship, ship)
    // A hit grants another shot, so the player sinks the lone enemy ship in two shots.
    match = applyAttack(match, 'player', 0).match
    match = applyAttack(match, 'player', 1).match

    const model = practiceBattleModel(match)
    expect(model.enemy.ships).toHaveLength(1)
    expect(model.enemy.ships[0].sunk).toBe(true)
    expect(model.enemy.shots[0]).toBe(3)
    expect(model.enemy.shots[1]).toBe(3)
    expect(model.enemy.dimmed.size).toBeGreaterThan(0)
    // The player's own board is not dimmed.
    expect(model.player.dimmed.size).toBe(0)
  })
})
