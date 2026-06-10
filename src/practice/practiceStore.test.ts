import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyAttack, createMatch } from '../game/engine'
import type { MatchState, Placement } from '../game/types'
import { seededRandom } from '../test/gameFixtures'

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

import { matchSummary, resetPracticeState, setPracticeRandomSource, useStore } from './practiceStore'

const twoCellShip: Placement[] = [
  { slot: 3, row: 0, col: 0, orientation: 'h' },
]
const oneCellShip: Placement[] = [
  { slot: 6, row: 0, col: 0, orientation: 'h' },
]

function startBattle(
  selectedCell: number | null,
  playerFleet = twoCellShip,
  botFleet = twoCellShip,
  firstTurn: 'player' | 'bot' = 'player',
) {
  useStore.setState({
    screen: 'battle',
    match: createMatch(playerFleet, botFleet, firstTurn),
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
    setPracticeRandomSource(seededRandom(1))
    resetPracticeState()
  })

  afterEach(() => {
    setPracticeRandomSource()
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

  it('ignores fire while busy, off-turn, or aimed at an attacked cell', async () => {
    startBattle(10)
    useStore.setState({ busy: true })
    await useStore.getState().fire()
    expect(useStore.getState().match?.moves).toHaveLength(0)

    startBattle(10, twoCellShip, twoCellShip, 'bot')
    await useStore.getState().fire()
    expect(useStore.getState().match?.moves).toHaveLength(0)

    startBattle(10)
    const match = useStore.getState().match!
    match.boards.bot.shots[10] = 1
    await useStore.getState().fire()
    expect(useStore.getState().match?.moves).toHaveLength(0)
  })

  it('moves directly to game over after a player win', async () => {
    startBattle(0, oneCellShip, oneCellShip)

    const firing = useStore.getState().fire()
    await vi.runAllTimersAsync()
    await firing

    expect(useStore.getState()).toMatchObject({
      screen: 'gameover',
      busy: false,
    })
    expect(useStore.getState().match?.winner).toBe('player')
    expect(mocks.chooseBotTarget).not.toHaveBeenCalled()
  })

  it('aborts a pending shot when the player forfeits', async () => {
    startBattle(0)

    const firing = useStore.getState().fire()
    await vi.advanceTimersByTimeAsync(100)
    useStore.getState().forfeit()
    await vi.runAllTimersAsync()
    await firing

    expect(useStore.getState()).toMatchObject({
      screen: 'gameover',
      busy: false,
      forfeited: true,
    })
    expect(useStore.getState().match?.winner).toBe('bot')
    expect(useStore.getState().match?.moves).toHaveLength(0)
    expect(useStore.getState().projectiles).toHaveLength(0)
  })

  it('rejects attacked and sunk-halo cell selection', () => {
    const botFleet: Placement[] = [
      { slot: 6, row: 0, col: 0, orientation: 'h' },
      { slot: 3, row: 3, col: 3, orientation: 'h' },
    ]
    const sunk = applyAttack(createMatch(twoCellShip, botFleet), 'player', 0).match
    useStore.setState({ screen: 'battle', match: sunk, selectedCell: null, busy: false })

    useStore.getState().selectCell(0)
    expect(useStore.getState().selectedCell).toBeNull()
    useStore.getState().selectCell(1)
    expect(useStore.getState().selectedCell).toBeNull()
    useStore.getState().selectCell(22)
    expect(useStore.getState().selectedCell).toBe(22)
  })
})

describe('resetPracticeState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setPracticeRandomSource(seededRandom(3))
    resetPracticeState()
  })

  afterEach(() => {
    setPracticeRandomSource()
    vi.useRealTimers()
  })

  it('resets all practice fields to their baseline', () => {
    useStore.getState().startPlacement()
    useStore.setState({ difficulty: 'hard', howItWorksOpen: true, busy: true })

    resetPracticeState()

    expect(useStore.getState()).toMatchObject({
      screen: 'home',
      difficulty: 'normal',
      howItWorksOpen: false,
      selectedSlot: null,
      match: null,
      busy: false,
      effects: [],
      projectiles: [],
      toast: null,
      forfeited: false,
    })
    expect(useStore.getState().placements).toEqual(new Array(10).fill(null))
  })

  it('aborts in-flight fire when the practice session is reset', async () => {
    startBattle(0)

    const firing = useStore.getState().fire()
    await vi.advanceTimersByTimeAsync(100)
    resetPracticeState()
    await vi.runAllTimersAsync()
    await firing

    expect(useStore.getState().screen).toBe('home')
    expect(useStore.getState().match).toBeNull()
    expect(useStore.getState().busy).toBe(false)
  })
})

describe('placement and match lifecycle', () => {
  beforeEach(() => {
    resetPracticeState()
    setPracticeRandomSource(seededRandom(7))
  })

  afterEach(() => {
    setPracticeRandomSource()
  })

  it('refuses to confirm an incomplete fleet', () => {
    useStore.setState({ screen: 'placement', placements: new Array(10).fill(null) })

    useStore.getState().confirmFleet()

    expect(useStore.getState().screen).toBe('placement')
    expect(useStore.getState().match).toBeNull()
  })

  it('rematch clears placement and transient battle presentation', () => {
    startBattle(0)
    useStore.setState({
      effects: [{ id: 1, kind: 'hit', board: 'bot', cell: 0 }],
      projectiles: [{ id: 2, from: 'player', cell: 0 }],
      toast: { id: 3, text: 'Hit', tone: 'amber' },
      forfeited: true,
      busy: true,
    })

    useStore.getState().rematch()

    expect(useStore.getState()).toMatchObject({
      screen: 'placement',
      selectedSlot: 0,
      selectedCell: null,
      match: null,
      effects: [],
      projectiles: [],
      toast: null,
      forfeited: false,
      busy: false,
    })
    expect(useStore.getState().placements).toEqual(new Array(10).fill(null))
  })
})

describe('matchSummary', () => {
  it('reports moves, rounded accuracy, ships left, and forfeit state', () => {
    const match: MatchState = createMatch(twoCellShip, twoCellShip)
    match.moves = [
      { by: 'player', cell: 10, result: 'miss', shipSlot: null },
      { by: 'player', cell: 0, result: 'hit', shipSlot: 3 },
      { by: 'player', cell: 1, result: 'sunk', shipSlot: 3 },
    ]
    match.boards.bot.ships[0].sunk = true
    match.winner = 'player'

    expect(matchSummary(match, true)).toEqual({
      winner: 'player',
      forfeited: true,
      turns: 3,
      playerShots: 3,
      botShots: 0,
      playerAccuracy: 67,
      botAccuracy: 0,
      playerShipsLeft: 1,
      botShipsLeft: 0,
    })
  })
})
