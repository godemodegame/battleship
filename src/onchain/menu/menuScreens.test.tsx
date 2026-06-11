import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  CREATOR,
  connectedWalletValue,
  makeWalletValue,
  renderApp,
} from '../testSupport'

vi.mock('../../three/Scene', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas" />,
}))

vi.mock('../../lib/sfx', () => ({
  sfx: new Proxy({}, { get: () => vi.fn() }),
}))

vi.mock('../../lib/haptics', () => ({
  haptics: new Proxy({}, { get: () => vi.fn() }),
}))

describe('EntryScreen (GAME-504)', () => {
  it('shows the short onboarding with Connect Wallet while disconnected', async () => {
    const wallet = makeWalletValue()
    renderApp({ route: '/', wallet })

    expect(screen.getByTestId('entry-screen')).toBeTruthy()
    expect(screen.getByTestId('onboarding-slides').textContent).toContain(
      'Hide your fleet with Fhenix',
    )
    await userEvent.click(screen.getByTestId('entry-connect'))
    expect(wallet.actions.connect).toHaveBeenCalledOnce()
  })

  it('skips onboarding for a connected wallet and lands on the practice hub', () => {
    renderApp({ route: '/', wallet: connectedWalletValue(CREATOR) })
    expect(screen.queryByTestId('entry-screen')).toBeNull()
    // Practice doubles as the menu; the connected wallet bar is shown there so
    // disconnect stays reachable.
    expect(screen.getByRole('button', { name: 'Practice vs Bot' })).toBeTruthy()
    expect(screen.getByTestId('wallet-address').textContent).toBe('0xaaaa…0001')
  })

  it('keeps practice reachable through Skip without a wallet', async () => {
    renderApp({ route: '/', wallet: makeWalletValue() })
    await userEvent.click(screen.getByTestId('entry-skip'))
    expect(screen.getByRole('button', { name: 'Practice vs Bot' })).toBeTruthy()
    // No wallet bar clutters the pure-practice menu when disconnected.
    expect(screen.queryByTestId('wallet-address')).toBeNull()
  })

  it('shows the config-missing note instead of a connect button', () => {
    renderApp({ route: '/', wallet: makeWalletValue({ configMissing: true }) })
    expect(screen.getByTestId('entry-config-missing')).toBeTruthy()
    expect(screen.queryByTestId('entry-connect')).toBeNull()
  })
})

describe('practice hub wallet bar (GAME-504)', () => {
  it('routes Play Against Friend from the practice hub to match creation', async () => {
    renderApp({ route: '/practice', wallet: connectedWalletValue(CREATOR) })
    await userEvent.click(screen.getByRole('button', { name: 'Play Against Friend' }))
    expect(screen.getByTestId('create-match-screen')).toBeTruthy()
  })

  it('lets a connected wallet disconnect from the practice hub', async () => {
    const wallet = connectedWalletValue(CREATOR)
    renderApp({ route: '/practice', wallet })
    await userEvent.click(screen.getByTestId('wallet-disconnect'))
    expect(wallet.actions.disconnect).toHaveBeenCalledOnce()
  })
})
