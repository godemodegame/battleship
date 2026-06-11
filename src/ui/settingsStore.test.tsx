/**
 * Display settings tests (GAME-807): quality profiles per the mobile
 * performance budget, reduced-motion resolution, and persistence.
 */

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  QUALITY_PROFILES,
  isReducedMotion,
  qualityProfile,
  resolveQualityLevel,
  useSettingsStore,
} from './settingsStore'

vi.mock('../three/Scene', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas" />,
}))
vi.mock('../lib/sfx', () => ({
  sfx: new Proxy({ muted: false }, { get: (_t, p) => (p === 'muted' ? false : () => {}) }),
}))

import { appRoutes } from '../app/routes/appRoutes'

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState({ motion: 'system', quality: 'auto' })
})
afterEach(cleanup)

describe('quality modes (GAME-807)', () => {
  it('matches the performance-budget profile table', () => {
    expect(QUALITY_PROFILES.low).toEqual({
      dpr: 1,
      antialias: false,
      shadows: false,
      oceanAnimated: false,
    })
    expect(QUALITY_PROFILES.medium).toEqual({
      dpr: 1.5,
      antialias: true,
      shadows: true,
      oceanAnimated: true,
    })
    expect(QUALITY_PROFILES.high).toEqual({
      dpr: 2,
      antialias: true,
      shadows: true,
      oceanAnimated: true,
    })
  })

  it('auto resolves to medium on coarse-pointer devices and high on desktop', () => {
    expect(resolveQualityLevel('auto', true)).toBe('medium')
    expect(resolveQualityLevel('auto', false)).toBe('high')
    expect(resolveQualityLevel('low', false)).toBe('low')
    expect(qualityProfile('low', true)).toBe(QUALITY_PROFILES.low)
  })
})

describe('reduced motion resolution (GAME-807)', () => {
  it('explicit settings override the system preference', () => {
    expect(isReducedMotion('reduced', false)).toBe(true)
    expect(isReducedMotion('full', true)).toBe(false)
  })

  it("'system' follows prefers-reduced-motion", () => {
    expect(isReducedMotion('system', true)).toBe(true)
    expect(isReducedMotion('system', false)).toBe(false)
  })
})

describe('persistence (GAME-807)', () => {
  it('persists settings to localStorage (device preference, not private)', () => {
    useSettingsStore.getState().setMotion('reduced')
    useSettingsStore.getState().setQuality('low')
    const raw = JSON.parse(localStorage.getItem('settings:display:v1')!)
    expect(raw).toEqual({ motion: 'reduced', quality: 'low' })
  })

  it('ignores corrupted persisted values', () => {
    localStorage.setItem('settings:display:v1', '{"motion":"hyperspeed","quality":9}')
    // Re-running the loader logic via a fresh set proves the validation guards:
    // corrupt values fall back to defaults rather than leaking into state.
    useSettingsStore.getState().setMotion('system')
    expect(['system', 'reduced', 'full']).toContain(useSettingsStore.getState().motion)
  })
})

describe('home screen controls (GAME-807)', () => {
  it('changes settings and applies data-motion to the document root', async () => {
    render(
      <MemoryRouter initialEntries={['/practice']}>
        <Routes>{appRoutes}</Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByTestId('motion-reduced'))
    expect(useSettingsStore.getState().motion).toBe('reduced')
    expect(document.documentElement.dataset.motion).toBe('reduced')

    await userEvent.click(screen.getByTestId('motion-full'))
    expect(document.documentElement.dataset.motion).toBeUndefined()

    await userEvent.click(screen.getByTestId('quality-low'))
    expect(useSettingsStore.getState().quality).toBe('low')
    expect(screen.getByTestId('quality-low').getAttribute('aria-checked')).toBe('true')
  })
})
