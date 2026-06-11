/**
 * GAME-805: required model-load failures offer a retry action, and the app
 * shell shows a visible offline state that clears when connectivity returns.
 */

import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const progressState = {
  active: false,
  progress: 100,
  errors: [] as string[],
}

vi.mock('@react-three/drei', () => ({
  useProgress: () => ({ ...progressState }),
}))

vi.mock('../three/Scene', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas" />,
}))

import { appRoutes } from '../app/routes/appRoutes'
import { LoadingOverlay } from './common'

afterEach(() => {
  cleanup()
  progressState.active = false
  progressState.progress = 100
  progressState.errors = []
})

describe('model-load retry (GAME-805)', () => {
  it('shows progress while assets load', () => {
    progressState.active = true
    progressState.progress = 42
    render(<LoadingOverlay />)
    expect(screen.getByText('Loading Models — 42%')).toBeTruthy()
  })

  it('offers a retry action when a required asset fails', async () => {
    progressState.errors = ['/models/ship-carrier.fbx']
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    })
    try {
      render(<LoadingOverlay />)
      expect(screen.getByRole('alert')).toBeTruthy()
      const retry = screen.getByTestId('asset-retry')
      expect(retry.textContent).toBe('Retry Loading')
      await userEvent.click(retry)
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })
})

describe('offline state (GAME-805)', () => {
  function renderShell() {
    return render(
      <MemoryRouter initialEntries={['/practice']}>
        <Routes>{appRoutes}</Routes>
      </MemoryRouter>,
    )
  }

  it('shows the offline banner and clears it when connectivity returns', () => {
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get')
    onLine.mockReturnValue(false)
    renderShell()
    expect(screen.getByTestId('offline-banner').textContent).toContain('offline')

    act(() => {
      onLine.mockReturnValue(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByTestId('offline-banner')).toBeNull()

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByTestId('offline-banner')).toBeTruthy()
  })

  it('renders no banner while online', () => {
    renderShell()
    expect(screen.queryByTestId('offline-banner')).toBeNull()
  })
})
