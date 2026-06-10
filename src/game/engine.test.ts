import { describe, expect, it } from 'vitest'
import { applyAttack, createMatch } from './engine'
import type { Placement } from './types'

const twoCellShip: Placement[] = [
  { slot: 3, row: 0, col: 0, orientation: 'h' },
]

describe('applyAttack turn rules', () => {
  it('passes the turn after a miss', () => {
    const match = createMatch(twoCellShip, twoCellShip)

    const resolved = applyAttack(match, 'player', 10)

    expect(resolved.move.result).toBe('miss')
    expect(resolved.match.turn).toBe('bot')
  })

  it('keeps the turn after a hit', () => {
    const match = createMatch(twoCellShip, twoCellShip)

    const resolved = applyAttack(match, 'player', 0)

    expect(resolved.move.result).toBe('hit')
    expect(resolved.match.turn).toBe('player')
  })

  it('keeps the turn after sinking a ship when the match continues', () => {
    const defenderFleet: Placement[] = [
      { slot: 3, row: 0, col: 0, orientation: 'h' },
      { slot: 6, row: 2, col: 0, orientation: 'h' },
    ]
    const match = createMatch(twoCellShip, defenderFleet)
    const afterFirstHit = applyAttack(match, 'player', 0).match
    const afterSunk = applyAttack(afterFirstHit, 'player', 1)

    expect(afterSunk.move.result).toBe('sunk')
    expect(afterSunk.match.winner).toBeNull()
    expect(afterSunk.match.turn).toBe('player')
  })

  it('ends the match on the winning hit', () => {
    const match = createMatch(twoCellShip, twoCellShip)
    const afterFirstHit = applyAttack(match, 'player', 0).match
    const afterWinningHit = applyAttack(afterFirstHit, 'player', 1)

    expect(afterWinningHit.move.result).toBe('sunk')
    expect(afterWinningHit.match.winner).toBe('player')
    expect(afterWinningHit.match.turn).toBe('player')
  })
})
