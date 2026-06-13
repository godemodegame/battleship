import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Placement } from '../game/types'
import { createMatch } from '../game/engine'
import { seededRandom } from '../test/gameFixtures'

const mocks = vi.hoisted(() => {
  const sfx = {
    muted: false,
    setMuted: vi.fn((value: boolean) => {
      sfx.muted = value
    }),
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
    ensureAudio: vi.fn(),
  }
  return {
    progress: { active: false, progress: 100, errors: [] as string[] },
    sfx,
  }
})

vi.mock('../three/Scene', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas" />,
}))

vi.mock('@react-three/drei', () => ({
  useProgress: () => mocks.progress,
}))

vi.mock('../lib/sfx', () => ({
  sfx: mocks.sfx,
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
    // getters used by mute button etc.
    get muted() {
      return false
    },
    setMuted: vi.fn(),
  },
}))

import App from '../App'
import { LoadingOverlay, MuteButton } from './common'
import { resetPracticeState, setPracticeRandomSource, useStore } from '../practice/practiceStore'

const twoCellShip: Placement[] = [
  { slot: 3, row: 0, col: 0, orientation: 'h' },
]

function startBattle() {
  useStore.setState({
    screen: 'battle',
    match: createMatch(twoCellShip, twoCellShip),
    focus: 'enemy',
    selectedCell: null,
    busy: false,
    effects: [],
    projectiles: [],
    toast: null,
    forfeited: false,
  })
}

beforeEach(() => {
  resetPracticeState()
  setPracticeRandomSource(seededRandom(11))
  mocks.progress.active = false
  mocks.progress.progress = 100
  mocks.progress.errors = []
  mocks.sfx.muted = false
  mocks.sfx.setMuted.mockClear()
  // `/` is the wallet-aware entry since Phase 5 (GAME-504); these suites cover
  // the practice screens, so mount the app on the practice route.
  window.history.replaceState(null, '', '/practice')
})

afterEach(() => {
  setPracticeRandomSource()
})

describe('HomeScreen', () => {
  it('opens help and routes the live match modes (bot is now on-chain)', async () => {
    const user = userEvent.setup()
    render(<App />)

    // The offline difficulty selector is gone — the bot match is fully on-chain
    // and always hard. Play Against Friend (→ /match/new), Find a Game
    // (→ /lobby), and Practice vs Bot (→ /match/bot) are all live.
    await screen.findByRole('button', { name: 'Practice vs Bot' })
    expect(screen.queryByRole('radio', { name: 'Hard' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Play Against Friend' }) as HTMLButtonElement).disabled)
      .toBe(false)
    expect((screen.getByRole('button', { name: 'Find a Game' }) as HTMLButtonElement).disabled)
      .toBe(false)

    await user.click(screen.getByRole('button', { name: 'How It Works' }))
    expect(screen.getByRole('heading', { name: 'How It Works' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('heading', { name: 'How It Works' })).toBeNull()

    // Practice vs Bot now navigates to the on-chain bot create route rather than
    // starting a local game, so the practice store stays on the home screen.
    await user.click(screen.getByRole('button', { name: 'Practice vs Bot' }))
    expect(window.location.pathname).toBe('/match/bot')
    expect(useStore.getState().screen).toBe('home')
  })
})

describe('PlacementScreen', () => {
  it('selects chips, rotates, auto-places, and clears the fleet', async () => {
    const user = userEvent.setup()
    useStore.getState().startPlacement()
    render(<App />)

    const confirm = (await screen.findByRole('button', { name: 'Confirm Fleet' })) as HTMLButtonElement
    const clear = screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement
    expect(screen.getByText(/0\/10 placed/)).toBeTruthy()
    expect(confirm.disabled).toBe(true)
    expect(clear.disabled).toBe(true)

    await user.click(screen.getByRole('button', { name: /Battleship/ }))
    await user.click(screen.getByRole('button', { name: /Rotate/ }))
    expect(screen.getByRole('button', { name: /Rotate · Vertical/ })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Auto Place' }))
    expect(screen.getByText(/10\/10 placed/)).toBeTruthy()
    expect(confirm.disabled).toBe(false)
    expect(clear.disabled).toBe(false)

    await user.click(clear)
    expect(screen.getByText(/0\/10 placed/)).toBeTruthy()
    expect(confirm.disabled).toBe(true)
  })
})

describe('BattleHUD', () => {
  it('shows turn states, target labels, and both forfeit modal paths', async () => {
    const user = userEvent.setup()
    startBattle()
    render(<App />)

    const fire = screen.getByRole('button', { name: 'Select a target cell' }) as HTMLButtonElement
    expect(screen.getByText('Your Turn')).toBeTruthy()
    expect(fire.disabled).toBe(true)

    act(() => useStore.getState().selectCell(10))
    const aimed = screen.getByRole('button', { name: 'Fire at A2' }) as HTMLButtonElement
    expect(aimed.disabled).toBe(false)

    act(() => useStore.setState({ busy: true }))
    expect(screen.getAllByText('Resolving Shot')).toHaveLength(2)

    const match = useStore.getState().match!
    act(() => useStore.setState({ match: { ...match, turn: 'bot' }, busy: true }))
    expect(screen.getAllByText('Opponent Turn')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Forfeit' }))
    expect(screen.getByRole('heading', { name: 'Forfeit Match' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('heading', { name: 'Forfeit Match' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Forfeit' }))
    await user.click(screen.getAllByRole('button', { name: 'Forfeit' })[1])
    expect(screen.getByRole('heading', { name: 'Defeat' })).toBeTruthy()
    expect(screen.getByText('Match forfeited')).toBeTruthy()
  })
})

describe('GameOverScreen', () => {
  it('renders victory and defeat variants with summary values', () => {
    const victory = createMatch(twoCellShip, twoCellShip)
    victory.moves = [
      { by: 'player', cell: 0, result: 'hit', shipSlot: 3 },
      { by: 'player', cell: 1, result: 'sunk', shipSlot: 3 },
    ]
    victory.boards.bot.ships[0].sunk = true
    victory.winner = 'player'
    useStore.setState({ screen: 'gameover', match: victory, forfeited: false })

    const view = render(<App />)
    expect(screen.getByRole('heading', { name: 'Victory' })).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()

    view.unmount()
    const defeat = createMatch(twoCellShip, twoCellShip)
    defeat.moves = [{ by: 'bot', cell: 0, result: 'sunk', shipSlot: 3 }]
    defeat.boards.player.ships[0].sunk = true
    defeat.winner = 'bot'
    useStore.setState({ screen: 'gameover', match: defeat, forfeited: true })
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Defeat' })).toBeTruthy()
    expect(screen.getByText('Match forfeited')).toBeTruthy()
    expect(screen.getByText('You abandoned the engagement.')).toBeTruthy()
  })
})

describe('shared UI states', () => {
  it('hides loading after completion and shows asset failures', () => {
    mocks.progress.active = true
    mocks.progress.progress = 37
    const view = render(<LoadingOverlay />)
    expect(screen.getByText('Loading Battlefield')).toBeTruthy()
    expect(screen.getByText(/37%/)).toBeTruthy()

    mocks.progress.active = false
    mocks.progress.progress = 100
    view.rerender(<LoadingOverlay />)
    expect(screen.queryByText('Loading Battlefield')).toBeNull()

    mocks.progress.errors = ['ship-carrier.fbx']
    view.rerender(<LoadingOverlay />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Battlefield Unavailable')).toBeTruthy()
  })

  it('toggles mute state through the sound service', async () => {
    const user = userEvent.setup()
    render(<MuteButton />)

    await user.click(screen.getByRole('button', { name: 'Mute sound' }))

    expect(mocks.sfx.setMuted).toHaveBeenCalledWith(true)
    expect(screen.getByRole('button', { name: 'Unmute sound' })).toBeTruthy()
  })
})
