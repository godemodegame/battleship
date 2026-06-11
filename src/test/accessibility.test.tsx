/**
 * GAME-806: accessibility hardening checks.
 *
 * - Stylesheet invariants: 44px touch targets, visible :focus-visible styles,
 *   safe-area padding, and reduced-motion support are asserted against
 *   `src/styles.css` so a refactor cannot silently drop them (jsdom does not
 *   apply the stylesheet, so the source is the testable artifact).
 * - Accessible names: every button rendered on the key screens must expose a
 *   non-empty accessible name (text content or aria-label).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../three/Scene', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas" />,
}))
vi.mock('../lib/sfx', () => ({
  sfx: new Proxy({ muted: false }, { get: (_t, p) => (p === 'muted' ? false : () => {}) }),
}))

import { appRoutes } from '../app/routes/appRoutes'
import {
  CREATOR,
  INVITED,
  connectedWalletValue,
  makeFakeContract,
  renderApp,
} from '../onchain/testSupport'

const cssPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css')
const css = readFileSync(cssPath, 'utf8')

afterEach(cleanup)

describe('stylesheet accessibility invariants (GAME-806)', () => {
  it('keeps the 44px minimum touch target on buttons', () => {
    const btnRule = css.match(/\.btn \{[^}]+\}/)?.[0] ?? ''
    expect(btnRule).toContain('min-height: 44px')
    const smallRule = css.match(/\.btn\.small \{[^}]+\}/)?.[0] ?? ''
    expect(smallRule).toContain('min-height: 44px')
    const iconRule = css.match(/\.icon-btn \{[^}]+\}/)?.[0] ?? ''
    expect(iconRule).toContain('width: 44px')
    expect(iconRule).toContain('height: 44px')
  })

  it('keeps a visible :focus-visible style', () => {
    expect(css).toContain(':focus-visible')
    const focusRule = css.match(/:focus-visible \{[^}]+\}/)?.[0] ?? ''
    expect(focusRule).toContain('outline')
  })

  it('keeps safe-area insets wired into the layout', () => {
    expect(css).toContain('env(safe-area-inset-top')
    expect(css).toContain('env(safe-area-inset-bottom')
    expect(css).toContain('var(--sat)')
    expect(css).toContain('var(--sab)')
  })

  it('keeps reduced-motion handling for system preference and in-app setting', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain("[data-motion='reduced']")
  })
})

function expectAllButtonsNamed() {
  const buttons = screen.getAllByRole('button')
  expect(buttons.length).toBeGreaterThan(0)
  for (const button of buttons) {
    const name = button.getAttribute('aria-label') || button.textContent?.trim()
    expect(name, `button without accessible name: ${button.outerHTML}`).toBeTruthy()
  }
}

describe('accessible names on key screens (GAME-806)', () => {
  it('practice home exposes named controls only', async () => {
    render(
      <MemoryRouter initialEntries={['/practice']}>
        <Routes>{appRoutes}</Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0))
    expectAllButtonsNamed()
  })

  it('on-chain battle panel exposes named controls only', async () => {
    const contract = makeFakeContract()
    contract.startBattle()
    renderApp({
      route: '/match/arb-sepolia-v1/1',
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })
    await waitFor(() => expect(screen.getByTestId('onchain-battle-panel')).toBeTruthy())
    expectAllButtonsNamed()
    // Battle cells carry coordinate + state names for screen readers.
    const grid = screen.getByTestId('enemy-battle-grid')
    const cell = grid.querySelector('[data-cell="0"]') as HTMLButtonElement
    expect(cell.getAttribute('aria-label')).toMatch(/^A1, (untried|miss|hit|sunk)$/)
  })

  it('join screen exposes named controls only', async () => {
    const contract = makeFakeContract()
    await contract.writeClientFor(CREATOR).createMatch(INVITED, () => {})
    renderApp({
      route: '/match/arb-sepolia-v1/1',
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })
    await waitFor(() => expect(screen.getByTestId('join-panel')).toBeTruthy())
    expectAllButtonsNamed()
  })
})
