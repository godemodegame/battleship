import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetPracticeState, useStore } from '../../state/store'
import { appRoutes } from './appRoutes'

vi.mock('../../three/Scene', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas" />,
}))

vi.mock('../../lib/sfx', () => ({
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

function TestRouter({ initialEntries }: { initialEntries: string[] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>{appRoutes}</Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  resetPracticeState()
})

afterEach(() => {
  resetPracticeState()
})

describe('application routes', () => {
  it('renders the route-level shell on every route', () => {
    render(<TestRouter initialEntries={['/practice']} />)
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('redirects the root route to practice', () => {
    render(<TestRouter initialEntries={['/']} />)
    expect(screen.getByRole('button', { name: 'Practice vs Bot' })).toBeTruthy()
  })

  it('renders practice at the explicit practice route', () => {
    render(<TestRouter initialEntries={['/practice']} />)
    expect(screen.getByRole('heading', { name: /Encrypted/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Practice vs Bot' })).toBeTruthy()
  })

  it('restores the versioned match route after direct navigation', () => {
    render(<TestRouter initialEntries={['/match/arb-sepolia-v1/42']} />)
    expect(screen.getByRole('heading', { name: 'Match Route' })).toBeTruthy()
    expect(screen.getByText(/Deployment arb-sepolia-v1 · Match 42/)).toBeTruthy()
  })

  it('shows not found for unknown routes', async () => {
    const user = userEvent.setup()
    render(<TestRouter initialEntries={['/unknown-route']} />)
    expect(screen.getByRole('heading', { name: 'Page Not Found' })).toBeTruthy()
    await user.click(screen.getByRole('link', { name: 'Back to Practice' }))
    expect(screen.getByRole('button', { name: 'Practice vs Bot' })).toBeTruthy()
  })

  it('resets practice state when leaving the practice route', () => {
    const { unmount } = render(<TestRouter initialEntries={['/practice']} />)
    useStore.getState().startPlacement()
    expect(useStore.getState().screen).toBe('placement')

    unmount()

    expect(useStore.getState().screen).toBe('home')
    expect(useStore.getState().match).toBeNull()
    expect(useStore.getState().placements).toEqual(new Array(10).fill(null))
  })

  it('aborts in-flight fire when leaving the practice route', async () => {
    vi.useFakeTimers()
    const { createMatch } = await import('../../game/engine')
    const twoCellShip = [{ slot: 3, row: 0, col: 0, orientation: 'h' as const }]

    const { unmount } = render(<TestRouter initialEntries={['/practice']} />)
    useStore.setState({
      screen: 'battle',
      match: createMatch(twoCellShip, twoCellShip),
      focus: 'enemy',
      selectedCell: 0,
      busy: false,
      effects: [],
      projectiles: [],
      toast: null,
      forfeited: false,
    })

    const firing = useStore.getState().fire()
    await vi.advanceTimersByTimeAsync(100)
    unmount()
    await vi.runAllTimersAsync()
    await firing

    expect(useStore.getState().screen).toBe('home')
    expect(useStore.getState().match).toBeNull()
    expect(useStore.getState().busy).toBe(false)

    vi.useRealTimers()
  })
})