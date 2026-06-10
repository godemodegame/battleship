import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetPracticeState, useStore } from '../../practice/practiceStore'
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

  it('resolves a known deployment on a deep refresh link (GAME-110)', () => {
    // A fresh MemoryRouter entry models a browser refresh straight onto the deep
    // match URL: the route reconstructs deployment + match identity with no prior
    // client-side navigation.
    render(<TestRouter initialEntries={['/match/arb-sepolia-v1/match-7f3a9c']} />)
    expect(screen.getByRole('heading', { name: 'Match Route' })).toBeTruthy()
    expect(screen.getByText(/Deployment arb-sepolia-v1 · Match match-7f3a9c/)).toBeTruthy()
    // A reserved-but-undeployed deployment surfaces the pending note, not a phantom contract.
    expect(screen.getByTestId('deployment-pending')).toBeTruthy()
  })

  it('shows a recoverable unavailable state for an unknown deployment id (GAME-110)', async () => {
    const user = userEvent.setup()
    render(<TestRouter initialEntries={['/match/retired-v0/42']} />)
    expect(screen.getByTestId('deployment-unavailable')).toBeTruthy()
    expect(screen.getByText(/unknown deployment \(retired-v0\)/i)).toBeTruthy()
    // No phantom match phase is rendered for an unknown deployment.
    expect(screen.queryByTestId('match-phase-kind')).toBeNull()
    // The player can recover back to practice.
    await user.click(screen.getByRole('link', { name: 'Back to Practice' }))
    expect(screen.getByRole('button', { name: 'Practice vs Bot' })).toBeTruthy()
  })

  it('shows not found for unknown routes', async () => {
    const user = userEvent.setup()
    render(<TestRouter initialEntries={['/unknown-route']} />)
    expect(screen.getByRole('heading', { name: 'Page Not Found' })).toBeTruthy()
    await user.click(screen.getByRole('link', { name: 'Back to Practice' }))
    expect(screen.getByRole('button', { name: 'Practice vs Bot' })).toBeTruthy()
  })

  it('resets practice state when leaving the practice route (e.g. client-side navigation to /match or 404)', () => {
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
    try {
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
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders mocked on-chain placement phase at a demo match route', () => {
    render(<TestRouter initialEntries={['/match/arb-sepolia-v1/demo-place-123']} />)
    expect(screen.getByRole('heading', { name: 'Match Route' })).toBeTruthy()
    expect(screen.getByTestId('match-phase-kind').textContent).toContain('placement')
    // demo-place-123 specifically produces the creator "Place your fleet" label
    expect(screen.getByTestId('match-phase-label').textContent).toBe('Place your fleet')
  })

  it('renders mocked on-chain join phase for invited wallet via demo route', () => {
    // Uses the demo viewer selection (invited wallet for ids containing "join")
    // so that the route shell + resolver integration exercises the 'join' phase.
    render(<TestRouter initialEntries={['/match/arb-sepolia-v1/demo-join-invited']} />)
    expect(screen.getByTestId('match-phase-kind').textContent).toContain('join')
    expect(screen.getByTestId('match-phase-label').textContent).toBe('Join this match')
  })

  it('renders mocked on-chain battle (your turn) phase', () => {
    render(<TestRouter initialEntries={['/match/arb-sepolia-v1/demo-battle-mine']} />)
    expect(screen.getByTestId('match-phase-kind').textContent).toContain('battle')
    expect(screen.getByTestId('match-phase-label').textContent).toBe('Your turn')
    expect(screen.getByTestId('battle-detail').textContent).toMatch(/You may fire/)
  })

  it('renders mocked finished (win) phase', () => {
    render(<TestRouter initialEntries={['/match/arb-sepolia-v1/demo-win']} />)
    expect(screen.getByTestId('match-phase-kind').textContent).toContain('finished')
    expect(screen.getByTestId('match-phase-label').textContent).toBe('You won')
  })

  it('renders mocked cancelled phase', () => {
    render(<TestRouter initialEntries={['/match/arb-sepolia-v1/demo-cancel']} />)
    expect(screen.getByTestId('match-phase-kind').textContent).toContain('cancelled')
  })

  it('renders non-participant (demo spectator) as waiting-for-opponent even on active phases', () => {
    // Exercises the participant guard + demo spectator wallet selection + hasDemoMarker hardening.
    // The id hits the 'battle-opp' rule (status InProgress) AND the 'observer' wallet selection,
    // so the resolver must downgrade an active phase to waiting-for-opponent for a non-participant.
    render(<TestRouter initialEntries={['/match/arb-sepolia-v1/demo-battle-opp-observer']} />)
    expect(screen.getByTestId('match-phase-kind').textContent).toContain('waiting-for-opponent')
    // No battle-detail or placement-detail should be present for a spectator.
    expect(screen.queryByTestId('battle-detail')).toBeNull()
    expect(screen.queryByTestId('placement-detail')).toBeNull()
  })
})
