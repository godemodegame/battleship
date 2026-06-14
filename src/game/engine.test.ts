import { describe, expect, it } from 'vitest'
import { COMPLETE_FLEET, cloneMatch } from '../test/gameFixtures'
import {
  applyAttack,
  applyResolvedShot,
  buildBoard,
  createMatch,
  createMatchVsHiddenEnemy,
  emptyBoard,
  sunkHalo,
} from './engine'
import type { Placement } from './types'

const twoCellShip: Placement[] = [
  { slot: 3, row: 0, col: 0, orientation: 'h' },
]
const oneCellShip: Placement[] = [
  { slot: 6, row: 0, col: 0, orientation: 'h' },
]

describe('buildBoard', () => {
  it('builds mutually consistent cells, ship lookup, and shots', () => {
    const board = buildBoard(COMPLETE_FLEET)

    expect(board.shots).toEqual(new Array(100).fill(0))
    for (const [shipIndex, ship] of board.ships.entries()) {
      for (const cell of ship.cells) expect(board.shipAt[cell]).toBe(shipIndex)
    }
    for (const [cell, shipIndex] of board.shipAt.entries()) {
      if (shipIndex >= 0) expect(board.ships[shipIndex].cells).toContain(cell)
    }
  })

  it('throws for an off-board placement', () => {
    expect(() => buildBoard([{ slot: 0, row: 9, col: 9, orientation: 'h' }]))
      .toThrow('Invalid placement')
  })
})

describe('applyAttack', () => {
  it('marks a miss and passes the turn', () => {
    const resolved = applyAttack(createMatch(twoCellShip, twoCellShip), 'player', 10)

    expect(resolved.move).toMatchObject({ result: 'miss', shipSlot: null })
    expect(resolved.match.boards.bot.shots[10]).toBe(1)
    expect(resolved.match.turn).toBe('bot')
  })

  it('marks a hit and keeps the turn', () => {
    const resolved = applyAttack(createMatch(twoCellShip, twoCellShip), 'player', 0)

    expect(resolved.move).toMatchObject({ result: 'hit', shipSlot: 3 })
    expect(resolved.match.boards.bot.shots[0]).toBe(2)
    expect(resolved.match.turn).toBe('player')
  })

  it('marks every cell sunk and keeps the turn while ships remain', () => {
    const defenderFleet: Placement[] = [
      { slot: 3, row: 0, col: 0, orientation: 'h' },
      { slot: 6, row: 2, col: 0, orientation: 'h' },
    ]
    const afterHit = applyAttack(createMatch(twoCellShip, defenderFleet), 'player', 0).match
    const resolved = applyAttack(afterHit, 'player', 1)

    expect(resolved.move).toMatchObject({ result: 'sunk', shipSlot: 3 })
    expect(resolved.match.boards.bot.shots.slice(0, 2)).toEqual([3, 3])
    expect(resolved.match.boards.bot.shots[11]).toBe(1)
    expect(resolved.match.winner).toBeNull()
    expect(resolved.match.turn).toBe('player')
  })

  it('sets the winner after sinking the last ship', () => {
    const afterHit = applyAttack(createMatch(twoCellShip, twoCellShip), 'player', 0).match
    const resolved = applyAttack(afterHit, 'player', 1)

    expect(resolved.move.result).toBe('sunk')
    expect(resolved.match.winner).toBe('player')
  })

  it('rejects wrong-turn, repeated, and post-win attacks', () => {
    const initial = createMatch(twoCellShip, twoCellShip)
    expect(() => applyAttack(initial, 'bot', 10)).toThrow('Invalid attack')

    const afterMiss = applyAttack(initial, 'player', 10).match
    expect(() => applyAttack({ ...afterMiss, turn: 'player' }, 'player', 10))
      .toThrow('Invalid attack')

    const won = applyAttack(createMatch(oneCellShip, oneCellShip), 'player', 0).match
    expect(() => applyAttack(won, 'player', 1)).toThrow('Invalid attack')
  })

  it('does not mutate the input match', () => {
    const match = createMatch(twoCellShip, twoCellShip)
    const snapshot = cloneMatch(match)

    applyAttack(match, 'player', 0)

    expect(match).toEqual(snapshot)
  })
})

describe('createMatchVsHiddenEnemy', () => {
  it('builds a known player board and a geometry-less enemy board', () => {
    const match = createMatchVsHiddenEnemy(twoCellShip)

    expect(match.boards.player.ships).toHaveLength(1)
    // The enemy fleet is hidden: no ships, no lookup, no shots yet.
    expect(match.boards.bot.ships).toEqual([])
    expect(match.boards.bot.shipAt).toEqual(new Array(100).fill(-1))
    expect(match.boards.bot.shots).toEqual(new Array(100).fill(0))
    expect(match.turn).toBe('player')
  })

  it('emptyBoard has no ships and an all-empty lookup', () => {
    const board = emptyBoard()
    expect(board.ships).toEqual([])
    expect(board.shipAt.every((v) => v === -1)).toBe(true)
    expect(board.shots.every((v) => v === 0)).toBe(true)
  })
})

describe('applyResolvedShot', () => {
  it('stamps a chain miss and passes the turn — without any geometry', () => {
    const resolved = applyResolvedShot(createMatchVsHiddenEnemy(twoCellShip), 10, {
      result: 'miss',
      shipSlot: null,
      winner: false,
    })

    expect(resolved.move).toEqual({ by: 'player', cell: 10, result: 'miss', shipSlot: null })
    expect(resolved.match.boards.bot.shots[10]).toBe(1)
    expect(resolved.match.turn).toBe('bot')
    expect(resolved.match.winner).toBeNull()
  })

  it('stamps a chain hit and keeps the turn', () => {
    const resolved = applyResolvedShot(createMatchVsHiddenEnemy(twoCellShip), 5, {
      result: 'hit',
      shipSlot: null,
      winner: false,
    })

    expect(resolved.match.boards.bot.shots[5]).toBe(2)
    expect(resolved.match.turn).toBe('player')
  })

  it('stamps only the final cell on a chain sunk and records the ship slot', () => {
    const resolved = applyResolvedShot(createMatchVsHiddenEnemy(twoCellShip), 7, {
      result: 'sunk',
      shipSlot: 2,
      winner: false,
    })

    expect(resolved.move).toMatchObject({ result: 'sunk', shipSlot: 2 })
    expect(resolved.match.boards.bot.shots[7]).toBe(3)
    // No geometry is known, so no no-touch halo is inferred for the enemy.
    expect(resolved.match.boards.bot.shots.filter((s) => s !== 0)).toEqual([3])
    expect(resolved.match.turn).toBe('player')
  })

  it('sets the player as winner on a chain win', () => {
    const resolved = applyResolvedShot(createMatchVsHiddenEnemy(twoCellShip), 9, {
      result: 'sunk',
      shipSlot: 0,
      winner: true,
    })

    expect(resolved.match.winner).toBe('player')
  })

  it('does not mutate the input match', () => {
    const match = createMatchVsHiddenEnemy(twoCellShip)
    const before = JSON.stringify(match)
    applyResolvedShot(match, 3, { result: 'hit', shipSlot: null, winner: false })
    expect(JSON.stringify(match)).toBe(before)
  })
})

describe('sunkHalo', () => {
  it('is empty before a ship sinks', () => {
    expect(sunkHalo(buildBoard(oneCellShip))).toEqual(new Set())
  })

  it('clips corner neighbors and excludes the sunk ship cell', () => {
    const sunkBoard = applyAttack(createMatch(oneCellShip, oneCellShip), 'player', 0)
      .match.boards.bot

    expect(sunkHalo(sunkBoard)).toEqual(new Set([1, 10, 11]))
    expect(sunkHalo(sunkBoard).has(0)).toBe(false)
    for (const cell of [1, 10, 11]) expect(sunkBoard.shots[cell]).toBe(1)
  })

  it('never contains another ship cell in a valid no-touch fleet', () => {
    let match = createMatch(COMPLETE_FLEET, COMPLETE_FLEET)
    const target = match.boards.bot.ships.find((ship) => ship.slot === 6)!
    for (const cell of target.cells) match = applyAttack(match, 'player', cell).match

    const halo = sunkHalo(match.boards.bot)
    for (const cell of halo) expect(match.boards.bot.shipAt[cell]).toBe(-1)
  })

  it('marks the full perimeter when a four-cell ship sinks', () => {
    const carrierOnly: Placement[] = [
      { slot: 0, row: 4, col: 3, orientation: 'h' },
    ]
    let match = createMatch(twoCellShip, carrierOnly)
    for (const cell of [43, 44, 45, 46]) {
      match = applyAttack(match, 'player', cell).match
    }

    const board = match.boards.bot
    const halo = sunkHalo(board)
    expect(halo.size).toBeGreaterThan(0)
    for (const cell of halo) expect(board.shots[cell]).toBe(1)
    for (const cell of [43, 44, 45, 46]) expect(board.shots[cell]).toBe(3)
  })

  it('does not overwrite a halo cell already marked miss before the sink', () => {
    const defenderFleet: Placement[] = [
      { slot: 3, row: 0, col: 0, orientation: 'h' },
    ]
    const afterHit = applyAttack(createMatch(twoCellShip, defenderFleet), 'player', 0).match
    const withPriorMiss = {
      ...afterHit,
      boards: {
        ...afterHit.boards,
        bot: {
          ...afterHit.boards.bot,
          shots: afterHit.boards.bot.shots.map((shot, cell) => (cell === 11 ? 1 : shot)),
        },
      },
    }
    const resolved = applyAttack(withPriorMiss, 'player', 1)

    expect(resolved.match.boards.bot.shots[11]).toBe(1)
    expect(sunkHalo(resolved.match.boards.bot).has(11)).toBe(true)
  })
})
