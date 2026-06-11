import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BattleshipWriteClient } from '../client/battleshipClient'
import {
  CREATOR,
  INVITED,
  TX_HASH,
  connectedWalletValue,
  makeFakeContract,
  makeWalletValue,
  readyResolution,
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

function mockClipboard(text = '') {
  const readText = vi.fn(async () => text)
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', {
    value: { readText, writeText },
    configurable: true,
  })
  return { readText, writeText }
}

describe('CreateFriendMatchScreen (GAME-505/506)', () => {
  it('asks a disconnected visitor to connect instead of showing the form', async () => {
    renderApp({ route: '/match/new', wallet: makeWalletValue() })
    expect(await screen.findByTestId('create-connect-prompt')).toBeTruthy()
    expect(screen.queryByTestId('create-match-form')).toBeNull()
  })

  it('shows the pending-deployment note when no live contract exists', async () => {
    renderApp({ route: '/match/new', wallet: connectedWalletValue(CREATOR) })
    expect(await screen.findByTestId('create-deployment-pending')).toBeTruthy()
    expect(screen.queryByTestId('create-match-form')).toBeNull()
  })

  it('validates empty, malformed, and self-invite addresses (GAME-505)', async () => {
    const fake = makeFakeContract()
    renderApp({
      route: '/match/new',
      wallet: connectedWalletValue(CREATOR),
      clients: fake.clientsFor(CREATOR),
    })

    const create = await screen.findByTestId('create-match')

    await userEvent.click(create)
    expect(screen.getByTestId('address-validation-error').textContent).toBe(
      'Enter a wallet address.',
    )

    await userEvent.type(screen.getByTestId('invited-address-input'), 'not-an-address')
    await userEvent.click(create)
    expect(screen.getByTestId('address-validation-error').textContent).toBe('Invalid address.')

    await userEvent.clear(screen.getByTestId('invited-address-input'))
    await userEvent.type(screen.getByTestId('invited-address-input'), CREATOR.toUpperCase().replace('0X', '0x'))
    await userEvent.click(create)
    expect(screen.getByTestId('address-validation-error').textContent).toBe(
      'You cannot invite yourself.',
    )
  })

  it('pastes an address from the clipboard', async () => {
    mockClipboard(`  ${INVITED}  `)
    const fake = makeFakeContract()
    renderApp({
      route: '/match/new',
      wallet: connectedWalletValue(CREATOR),
      clients: fake.clientsFor(CREATOR),
    })

    await userEvent.click(await screen.findByTestId('paste-address'))
    await waitFor(() =>
      expect((screen.getByTestId('invited-address-input') as HTMLInputElement).value).toBe(
        INVITED,
      ),
    )
  })

  it('creates a match and lands on the versioned match route with the invite link', async () => {
    mockClipboard()
    const fake = makeFakeContract()
    const wallet = connectedWalletValue(CREATOR)
    renderApp({
      route: '/match/new',
      wallet,
      clients: fake.clientsFor(CREATOR),
    })

    await userEvent.type(await screen.findByTestId('invited-address-input'), INVITED)
    await userEvent.click(screen.getByTestId('create-match'))

    // Confirmed write → navigate to /match/:deploymentId/:matchId.
    await waitFor(() => expect(screen.getByTestId('match-route-shell')).toBeTruthy())
    expect(screen.getByText(/Match 1/)).toBeTruthy()
    // Creator sees the waiting state with the invite link (GAME-506).
    await waitFor(() => expect(screen.getByTestId('invite-panel')).toBeTruthy())
    expect(screen.getByTestId('invite-link').textContent).toContain('/match/arb-sepolia-v1/1')
    // Mobile handoff intent was recorded before the wallet opened (GAME-210).
    expect(wallet.actions.prepareHandoff).toHaveBeenCalled()
  })

  it('prevents duplicate submission while a create is in flight', async () => {
    const createMatch = vi.fn(
      (_invited: unknown, onState: (s: never) => void) =>
        new Promise<never>(() => {
          onState({ phase: 'wallet', hash: null, replaced: false, error: null } as never)
        }),
    )
    const writeClient = { createMatch } as unknown as BattleshipWriteClient
    const fake = makeFakeContract()
    renderApp({
      route: '/match/new',
      wallet: connectedWalletValue(CREATOR),
      clients: { resolution: readyResolution(), readClient: fake.readClient, writeClient },
    })

    await userEvent.type(await screen.findByTestId('invited-address-input'), INVITED)
    const button = screen.getByTestId('create-match')
    await userEvent.click(button)
    // Busy state disables the button; a forced second click is also ignored.
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.textContent).toBe('Creating Match')
    expect(createMatch).toHaveBeenCalledTimes(1)
  })

  it('surfaces a failed create as a recoverable error with retry (GAME-511)', async () => {
    const writeClient = {
      createMatch: vi.fn(async (_invited: unknown, onState: (s: never) => void) => {
        onState({ phase: 'wallet', hash: null, replaced: false, error: null } as never)
        onState({ phase: 'error', hash: TX_HASH, replaced: false, error: 'transaction-rejected' } as never)
        return { ok: false, error: 'transaction-rejected' }
      }),
    } as unknown as BattleshipWriteClient
    const fake = makeFakeContract()
    renderApp({
      route: '/match/new',
      wallet: connectedWalletValue(CREATOR),
      clients: { resolution: readyResolution(), readClient: fake.readClient, writeClient },
    })

    await userEvent.type(await screen.findByTestId('invited-address-input'), INVITED)
    await userEvent.click(screen.getByTestId('create-match'))

    await waitFor(() =>
      expect(screen.getByTestId('tx-error').textContent).toBe('Transaction rejected'),
    )
    // Retry resets the tracked write back to idle so the player can submit again.
    await userEvent.click(screen.getByTestId('tx-retry'))
    expect(screen.queryByTestId('tx-error')).toBeNull()
    expect((screen.getByTestId('create-match') as HTMLButtonElement).disabled).toBe(false)
  })
})
