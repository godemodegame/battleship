import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetPracticeState } from '../../state/store'
import { appRoutes } from './appRoutes'

vi.mock('../../three/Scene', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas" />,
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

describe('application routes', () => {
  it('renders the route-level shell on every route', () => {
    render(<TestRouter initialEntries={['/']} />)
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('renders practice at the root route', () => {
    render(<TestRouter initialEntries={['/']} />)
    expect(screen.getByRole('heading', { name: /Encrypted/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Practice vs Bot' })).toBeTruthy()
  })

  it('renders practice at the explicit practice route', () => {
    render(<TestRouter initialEntries={['/practice']} />)
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
    await user.click(screen.getByRole('link', { name: 'Back to Home' }))
    expect(screen.getByRole('button', { name: 'Practice vs Bot' })).toBeTruthy()
  })
})