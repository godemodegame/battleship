import { describe, expect, it } from 'vitest'
import { COMPLETE_FLEET, seededRandom } from '../test/gameFixtures'
import { autoPlaceFleet } from './board'
import { chooseBotTarget } from './bot'
import { applyAttack, buildBoard, createMatch, sunkHalo } from './engine'
import type { BoardState, CellShot, Difficulty, Placement } from './types'

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard']

function cloneBoard(board: BoardState): BoardState {
  return {
    ships: board.ships.map((ship) => ({ ...ship, cells: [...ship.cells] })),
    shipAt: [...board.shipAt],
    shots: [...board.shots],
  }
}

function markShots(
  board: BoardState,
  entries: Array<[number, CellShot]>,
): BoardState {
  const next = cloneBoard(board)
  for (const [cell, shot] of entries) next.shots[cell] = shot
  return next
}

function sinkSlot(board: BoardState, slot: number): BoardState {
  const next = cloneBoard(board)
  const ship = next.ships.find((candidate) => candidate.slot === slot)!
  ship.sunk = true
  ship.hitMask = (1 << ship.length) - 1
  for (const cell of ship.cells) next.shots[cell] = 3
  return next
}

describe.each(DIFFICULTIES)('%s bot fundamentals', (difficulty) => {
  it('never returns an attacked cell and throws only when none remain', () => {
    const board = buildBoard([])
    const rnd = seededRandom(17)

    for (let remaining = 100; remaining > 0; remaining--) {
      const target = chooseBotTarget(board, difficulty, rnd)
      expect(board.shots[target]).toBe(0)
      board.shots[target] = 1
    }

    expect(() => chooseBotTarget(board, difficulty, rnd)).toThrow('No cells left')
  })

  it('uses only public information', () => {
    const sunk: Placement = { slot: 6, row: 0, col: 0, orientation: 'h' }
    const boardA = sinkSlot(buildBoard([
      sunk,
      { slot: 3, row: 4, col: 4, orientation: 'h' },
    ]), 6)
    const boardB = sinkSlot(buildBoard([
      sunk,
      { slot: 3, row: 7, col: 7, orientation: 'h' },
    ]), 6)
    const publicShots: Array<[number, CellShot]> = [[22, 1], [55, 1], [88, 1]]
    const visibleA = markShots(boardA, publicShots)
    const visibleB = markShots(boardB, publicShots)

    for (let seed = 0; seed < 30; seed++) {
      expect(chooseBotTarget(visibleA, difficulty, seededRandom(seed)))
        .toBe(chooseBotTarget(visibleB, difficulty, seededRandom(seed)))
    }
  })
})

describe('easy bot', () => {
  it('covers the available target set over many seeds', () => {
    const board = buildBoard([])
    board.shots.fill(1)
    for (const cell of [4, 27, 63, 99]) board.shots[cell] = 0

    const choices = new Set<number>()
    for (let seed = 0; seed < 200; seed++) {
      choices.add(chooseBotTarget(board, 'easy', seededRandom(seed)))
    }

    expect(choices).toEqual(new Set([4, 27, 63, 99]))
  })

  it('may target a sunk-ship halo cell', () => {
    const board = sinkSlot(buildBoard([
      { slot: 6, row: 0, col: 0, orientation: 'h' },
    ]), 6)
    board.shots.fill(1)
    board.shots[1] = 0

    expect(sunkHalo(board).has(1)).toBe(true)
    expect(chooseBotTarget(board, 'easy', seededRandom(1))).toBe(1)
  })
})

describe('normal bot', () => {
  it('follows a single hit through an orthogonal neighbor', () => {
    const board = markShots(buildBoard(COMPLETE_FLEET), [[44, 2]])
    const target = chooseBotTarget(board, 'normal', seededRandom(8))

    expect([34, 43, 45, 54]).toContain(target)
  })

  it('extends the open ends of collinear hits', () => {
    const board = markShots(buildBoard(COMPLETE_FLEET), [[44, 2], [45, 2]])
    const target = chooseBotTarget(board, 'normal', seededRandom(8))

    expect([43, 46]).toContain(target)
  })

  it('avoids sunk halo cells while other hunt cells remain', () => {
    const board = sinkSlot(buildBoard(COMPLETE_FLEET), 6)
    const halo = sunkHalo(board)

    for (let seed = 0; seed < 100; seed++) {
      expect(halo.has(chooseBotTarget(board, 'normal', seededRandom(seed)))).toBe(false)
    }
  })
})

describe('hard bot', () => {
  it('never targets misses, sunk cells, or sunk halo cells', () => {
    let board = sinkSlot(buildBoard(COMPLETE_FLEET), 6)
    board = markShots(board, [[0, 1], [10, 1], [20, 1], [30, 1]])
    const halo = sunkHalo(board)

    for (let seed = 0; seed < 100; seed++) {
      const target = chooseBotTarget(board, 'hard', seededRandom(seed))
      expect(board.shots[target]).toBe(0)
      expect(halo.has(target)).toBe(false)
    }
  })

  it('prioritizes an orthogonal neighbor of an open hit', () => {
    const board = markShots(buildBoard(COMPLETE_FLEET), [[44, 2]])

    for (let seed = 0; seed < 50; seed++) {
      expect([34, 43, 45, 54])
        .toContain(chooseBotTarget(board, 'hard', seededRandom(seed)))
    }
  })

  it('pins a scripted mid-game target', () => {
    let board = sinkSlot(buildBoard(COMPLETE_FLEET), 6)
    board = markShots(board, [
      [0, 1], [1, 1], [2, 1], [3, 1], [10, 1],
      [20, 1], [30, 1], [44, 2], [55, 1], [65, 1],
    ])

    expect(chooseBotTarget(board, 'hard', seededRandom(123))).toBe(43)
  })

  it('finishes seeded boards in fewer average shots than easy', () => {
    const finishIn = (difficulty: Difficulty, seed: number) => {
      const fleet = autoPlaceFleet(seededRandom(seed + 10_000))
      let match = createMatch(fleet, fleet)
      const rnd = seededRandom(seed)
      let shots = 0
      while (!match.winner) {
        const target = chooseBotTarget(match.boards.bot, difficulty, rnd)
        match = applyAttack({ ...match, turn: 'player' }, 'player', target).match
        shots++
      }
      return shots
    }

    const seeds = Array.from({ length: 30 }, (_, index) => index + 1)
    const average = (difficulty: Difficulty) =>
      seeds.reduce((sum, seed) => sum + finishIn(difficulty, seed), 0) / seeds.length

    expect(average('hard')).toBeLessThan(average('easy'))
  })
})
