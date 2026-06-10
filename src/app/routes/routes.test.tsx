import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../three/Scene', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas" />,
}))

import { PracticeApp } from '../../practice/PracticeApp'
import { MatchRouteShell } from '../../onchain/MatchRouteShell'
import { AppShell } from './AppShell'
import { NotFoundScreen } from './NotFoundScreen'

function TestRouter({ initialEntries }: { initialEntries: string[] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<PracticeApp />} />
          <Route path="practice" element={<PracticeApp />} />
          <Route path="match/:deploymentId/:matchId" element={<MatchRouteShell />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

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