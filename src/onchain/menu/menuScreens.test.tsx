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

  it('skips onboarding entirely for a connected wallet and lands on the menu', () => {
    renderApp({ route: '/', wallet: connectedWalletValue(CREATOR) })
    expect(screen.queryByTestId('entry-screen')).toBeNull()
    expect(screen.getByTestId('main-menu')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Command Deck' })).toBeTruthy()
  })

  it('keeps practice reachable through Skip without a wallet', async () => {
    renderApp({ route: '/', wallet: makeWalletValue() })
    await userEvent.click(screen.getByTestId('entry-skip'))
    expect(screen.getByRole('button', { name: 'Practice vs Bot' })).toBeTruthy()
  })

  it('shows the config-missing note instead of a connect button', () => {
    renderApp({ route: '/', wallet: makeWalletValue({ configMissing: true }) })
    expect(screen.getByTestId('entry-config-missing')).toBeTruthy()
    expect(screen.queryByTestId('entry-connect')).toBeNull()
  })
})

describe('MainMenuScreen (GAME-504)', () => {
  it('returns disconnected visitors to the entry route', () => {
    renderApp({ route: '/menu', wallet: makeWalletValue() })
    expect(screen.queryByTestId('main-menu')).toBeNull()
    expect(screen.getByTestId('entry-screen')).toBeTruthy()
  })

  it('shows wallet identity and routes Play Against Friend to match creation', async () => {
    renderApp({ route: '/menu', wallet: connectedWalletValue(CREATOR) })
    expect(screen.getByTestId('wallet-address').textContent).toBe('0xaaaa…0001')
    await userEvent.click(screen.getByTestId('menu-play-friend'))
    expect(screen.getByTestId('create-match-screen')).toBeTruthy()
  })

  it('notes that on-chain play is locked while the deployment is pending', () => {
    // No client override: the committed manifest's record has no live contract.
    renderApp({ route: '/menu', wallet: connectedWalletValue(CREATOR) })
    expect(screen.getByTestId('menu-deployment-pending')).toBeTruthy()
  })

  it('surfaces the wrong-network panel for a connected wallet on another chain', () => {
    const wallet = makeWalletValue({
      session: {
        status: 'wrong-network',
        address: CREATOR,
        chainId: 1,
        isCorrectChain: false,
        isConnected: true,
      },
    })
    renderApp({ route: '/menu', wallet })
    expect(screen.getByTestId('wrong-network-panel')).toBeTruthy()
  })
})
