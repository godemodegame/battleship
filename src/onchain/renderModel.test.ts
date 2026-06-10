import { describe, expect, it } from 'vitest'
import {
  decodePublicBoard,
  publicBattleToRenderModel,
  publicBoardRenderData,
  publicBoardShots,
  type PublicBattleRenderModel,
} from './renderModel'

describe('decodePublicBoard (GAME-106)', () => {
  it('unions misses, hits, and sunk; sunk implies hit and attacked', () => {
    const board = decodePublicBoard({ misses: [5], hits: [6], sunk: [7, 8], shipsRemaining: 2 })
    expect([...board.misses]).toEqual([5])
    expect(board.hits.has(6)).toBe(true)
    expect(board.hits.has(7)).toBe(true)
    expect(board.sunk.has(8)).toBe(true)
    expect(board.attacked.size).toBe(4)
    expect(board.shipsRemaining).toBe(2)
  })

  it('drops a stale miss when the same cell is a finalized hit', () => {
    const board = decodePublicBoard({ misses: [6], hits: [6], sunk: [], shipsRemaining: 1 })
    expect(board.misses.has(6)).toBe(false)
    expect(board.hits.has(6)).toBe(true)
  })

  it('rejects out-of-range cells', () => {
    expect(() => decodePublicBoard({ misses: [100], hits: [], sunk: [], shipsRemaining: 0 })).toThrow()
    expect(() => decodePublicBoard({ misses: [-1], hits: [], sunk: [], shipsRemaining: 0 })).toThrow()
  })

  it('clamps a negative ships-remaining to zero', () => {
    expect(
      decodePublicBoard({ misses: [], hits: [], sunk: [], shipsRemaining: -3 }).shipsRemaining,
    ).toBe(0)
  })
})

describe('publicBoardShots (GAME-106)', () => {
  it('encodes sunk > hit > miss into the 100-cell array', () => {
    const board = decodePublicBoard({ misses: [1], hits: [2], sunk: [3], shipsRemaining: 0 })
    const shots = publicBoardShots(board)
    expect(shots).toHaveLength(100)
    expect(shots[0]).toBe(0)
    expect(shots[1]).toBe(1)
    expect(shots[2]).toBe(2)
    expect(shots[3]).toBe(3)
  })
})

describe('public board adapters (GAME-106)', () => {
  it('never exposes hull geometry', () => {
    const board = decodePublicBoard({ misses: [], hits: [], sunk: [4], shipsRemaining: 1 })
    const data = publicBoardRenderData(board)
    expect(data.ships).toEqual([])
    expect(data.shots[4]).toBe(3)
  })

  it('maps a public battle model into the shared scene model', () => {
    const model: PublicBattleRenderModel = {
      phase: 'player-turn',
      perspective: 'creator',
      currentTurn: '0x1111111111111111111111111111111111111111',
      winner: null,
      playerBoard: decodePublicBoard({ misses: [10], hits: [], sunk: [], shipsRemaining: 5 }),
      opponentBoard: decodePublicBoard({ misses: [], hits: [20], sunk: [], shipsRemaining: 4 }),
      selectedCell: null,
      latestFinalizedMove: null,
    }
    const scene = publicBattleToRenderModel(model)
    expect(scene.player.shots[10]).toBe(1)
    expect(scene.enemy.shots[20]).toBe(2)
    expect(scene.player.ships).toEqual([])
    expect(scene.enemy.ships).toEqual([])
  })
})
