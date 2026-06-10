import { describe, expect, it } from 'vitest'
import { EMPTY_SHOTS, emptyBattleRenderModel, emptyBoardRenderData } from './model'

describe('shared render model (GAME-106)', () => {
  it('empty board data is a 100-cell zeroed board with no hulls', () => {
    const board = emptyBoardRenderData()
    expect(board.shots.length).toBe(100)
    expect(board.shots.every((cell) => cell === 0)).toBe(true)
    expect(board.ships).toEqual([])
    expect(board.dimmed.size).toBe(0)
  })

  it('empty battle model has both boards empty and shares stable references', () => {
    const model = emptyBattleRenderModel()
    expect(model.player.shots).toBe(EMPTY_SHOTS)
    expect(model.enemy.shots).toBe(EMPTY_SHOTS)
    expect(model.enemy.ships).toEqual([])
  })
})
