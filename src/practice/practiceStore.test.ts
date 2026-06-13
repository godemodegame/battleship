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

vi.mock('../lib/haptics', () => ({
  haptics: {
    prime: vi.fn(),
    tap: vi.fn(),
    select: vi.fn(),
    confirm: vi.fn(),
    place: vi.fn(),
    deny: vi.fn(),
    fire: vi.fn(),
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
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

describe('on-chain battle driver', () => {
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

  it('mirrors the player shot and takes the bot target from the driver', async () => {
    startBattle(10)
    const submitPlayerShot = vi.fn().mockResolvedValue(undefined)
    const resolveBotShot = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(10)
    useStore.setState({ battleDriver: { submitPlayerShot, resolveBotShot } })

    const firing = useStore.getState().fire()
    await vi.runAllTimersAsync()
    await firing

    const state = useStore.getState()
    expect(submitPlayerShot).toHaveBeenCalledWith(10)
    // The local bot is never consulted on the driver path — the contract picks.
    expect(mocks.chooseBotTarget).not.toHaveBeenCalled()
    expect(resolveBotShot).toHaveBeenCalledTimes(2)
    expect(state.match?.moves.map((m) => [m.by, m.result])).toEqual([
      ['player', 'miss'],
      ['bot', 'hit'],
      ['bot', 'miss'],
    ])
    expect(state.match?.turn).toBe('player')
    expect(state.busy).toBe(false)
    expect(state.confirming).toBe(false)
  })

  it('does not run the bot driver when the player hits (player fires again)', async () => {
    startBattle(0)
    const submitPlayerShot = vi.fn().mockResolvedValue(undefined)
    const resolveBotShot = vi.fn()
    useStore.setState({ battleDriver: { submitPlayerShot, resolveBotShot } })

    const firing = useStore.getState().fire()
    await vi.runAllTimersAsync()
    await firing

    expect(submitPlayerShot).toHaveBeenCalledWith(0)
    expect(resolveBotShot).not.toHaveBeenCalled()
    expect(useStore.getState().match?.turn).toBe('player')
    expect(useStore.getState().busy).toBe(false)
  })

  it('routes forfeit through the driver and leaves the terminal state to the route', () => {
    startBattle(0)
    const forfeit = vi.fn().mockResolvedValue(undefined)
    useStore.setState({
      battleDriver: { submitPlayerShot: vi.fn(), resolveBotShot: vi.fn(), forfeit },
    })

    useStore.getState().forfeit()

    expect(forfeit).toHaveBeenCalledTimes(1)
    // No local game-over: the route refetch lands the contract summary.
    expect(useStore.getState().screen).toBe('battle')
    expect(useStore.getState().match?.winner).toBeNull()
  })

  it('aborts the turn and toasts when a shot fails on-chain', async () => {
    startBattle(0)
    const submitPlayerShot = vi.fn().mockRejectedValue(new Error('rpc down'))
    const resolveBotShot = vi.fn()
    useStore.setState({ battleDriver: { submitPlayerShot, resolveBotShot } })

    const firing = useStore.getState().fire()
    await vi.runAllTimersAsync()
    await firing

    const state = useStore.getState()
    expect(state.busy).toBe(false)
    expect(state.confirming).toBe(false)
    expect(state.toast?.tone).toBe('red')
    expect(state.driverError).toBe(true)
    expect(resolveBotShot).not.toHaveBeenCalled()
  })

  it('recovers a stalled bot move via resumeBattle without re-sending the player shot', async () => {
    startBattle(10)
    const submitPlayerShot = vi.fn().mockResolvedValue(undefined)
    const resolveBotShot = vi
      .fn()
      .mockRejectedValueOnce(new Error('rpc down')) // bot move stalls
      .mockResolvedValueOnce(0) // resume: bot hits
      .mockResolvedValueOnce(10) // resume: bot misses, turn passes back
    useStore.setState({ battleDriver: { submitPlayerShot, resolveBotShot } })

    const firing = useStore.getState().fire()
    await vi.runAllTimersAsync()
    await firing

    // Stalled: the bot's turn is wedged, but the state is recoverable — not a
    // dead end. The player's shot already landed, so there's no recovery cell.
    let state = useStore.getState()
    expect(state.driverError).toBe(true)
    expect(state.busy).toBe(false)
    expect(state.recoveryCell).toBeNull()
    expect(state.toast?.tone).toBe('red')
    expect(state.match?.turn).toBe('bot')
    expect(state.match?.moves.map((m) => [m.by, m.result])).toEqual([['player', 'miss']])

    const resuming = useStore.getState().resumeBattle()
    await vi.runAllTimersAsync()
    await resuming

    state = useStore.getState()
    expect(state.driverError).toBe(false)
    expect(state.busy).toBe(false)
    expect(state.match?.turn).toBe('player')
    expect(state.match?.moves.map((m) => [m.by, m.result])).toEqual([
      ['player', 'miss'],
      ['bot', 'hit'],
      ['bot', 'miss'],
    ])
    // The player's shot was never re-sent — only the bot turn was resumed.
    expect(submitPlayerShot).toHaveBeenCalledTimes(1)
    expect(resolveBotShot).toHaveBeenCalledTimes(3)
  })

  it('re-sends a stalled player shot, then resumes the bot turn, via resumeBattle', async () => {
    startBattle(10)
    const submitPlayerShot = vi
      .fn()
      .mockRejectedValueOnce(new Error('rpc down')) // the shot never lands
      .mockResolvedValueOnce(undefined) // resume re-sends it
    const resolveBotShot = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(10)
    useStore.setState({ battleDriver: { submitPlayerShot, resolveBotShot } })

    const firing = useStore.getState().fire()
    await vi.runAllTimersAsync()
    await firing

    // Player missed locally (turn → bot) but the shot never reached the chain,
    // so the cell is remembered and the bot driver has not run yet.
    let state = useStore.getState()
    expect(state.driverError).toBe(true)
    expect(state.recoveryCell).toBe(10)
    expect(state.match?.turn).toBe('bot')
    expect(resolveBotShot).not.toHaveBeenCalled()

    const resuming = useStore.getState().resumeBattle()
    await vi.runAllTimersAsync()
    await resuming

    state = useStore.getState()
    expect(submitPlayerShot).toHaveBeenCalledTimes(2)
    expect(submitPlayerShot).toHaveBeenLastCalledWith(10)
    expect(state.driverError).toBe(false)
    expect(state.recoveryCell).toBeNull()
    expect(state.busy).toBe(false)
    expect(state.match?.turn).toBe('player')
    expect(state.match?.moves.map((m) => [m.by, m.result])).toEqual([
      ['player', 'miss'],
      ['bot', 'hit'],
      ['bot', 'miss'],
    ])
  })

  it('ignores resumeBattle unless a stall is pending', async () => {
    startBattle(10)
    const submitPlayerShot = vi.fn()
    const resolveBotShot = vi.fn()
    useStore.setState({ battleDriver: { submitPlayerShot, resolveBotShot } })

    await useStore.getState().resumeBattle()

    expect(submitPlayerShot).not.toHaveBeenCalled()
    expect(resolveBotShot).not.toHaveBeenCalled()
    expect(useStore.getState().busy).toBe(false)
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
