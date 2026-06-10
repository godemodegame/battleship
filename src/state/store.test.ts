import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMatch } from '../game/engine'
import type { Placement } from '../game/types'

const mocks = vi.hoisted(() => ({
  chooseBotTarget: vi.fn(),
}))

vi.mock('../game/bot', () => ({
  chooseBotTarget: mocks.chooseBotTarget,
}))

vi.mock('../lib/sfx', () => ({
  sfx: {
    ui: vi.fn(),
    deny: vi.fn(),
    place: vi.fn(),
    confirm: vi.fn(),
    fire: vi.fn(),
    miss: vi.fn(),
    hit: vi.fn(),
    sunk: vi.fn(),
    win: vi.fn(),
    lose: vi.fn(),
  },
}))

import { useStore } from './store'

const twoCellShip: Placement[] = [
  { slot: 3, row: 0, col: 0, orientation: 'h' },
]

function startBattle(selectedCell: number) {
  useStore.setState({
    screen: 'battle',
    match: createMatch(twoCellShip, twoCellShip),
    focus: 'enemy',
    selectedCell,
    busy: false,
    effects: [],
    projectiles: [],
    toast: null,
    forfeited: false,
  })
}

describe('battle turn orchestration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.chooseBotTarget.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns control to the player after a hit without a bot reply', async () => {
    startBattle(0)

    const firing = useStore.getState().fire()
    await vi.runAllTimersAsync()
    await firing

    const state = useStore.getState()
    expect(state.match?.moves.map((move) => [move.by, move.result])).toEqual([
      ['player', 'hit'],
    ])
    expect(state.match?.turn).toBe('player')
    expect(state.busy).toBe(false)
    expect(mocks.chooseBotTarget).not.toHaveBeenCalled()
  })

  it('lets the bot keep firing after a hit until it misses', async () => {
    startBattle(10)
    mocks.chooseBotTarget.mockReturnValueOnce(0).mockReturnValueOnce(10)

    const firing = useStore.getState().fire()
    await vi.runAllTimersAsync()
    await firing

    const state = useStore.getState()
    expect(state.match?.moves.map((move) => [move.by, move.result])).toEqual([
      ['player', 'miss'],
      ['bot', 'hit'],
      ['bot', 'miss'],
    ])
    expect(state.match?.turn).toBe('player')
    expect(state.busy).toBe(false)
    expect(mocks.chooseBotTarget).toHaveBeenCalledTimes(2)
  })
})
