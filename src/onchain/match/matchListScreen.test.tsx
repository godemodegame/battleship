/**
 * "My Battles" screen integration: the wallet-scoped list renders from the
 * shared fake contract (creator and joiner roles), groups by lifecycle
 * section, scores finished matches per viewer, and links into the match route.
 */

import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  CREATOR,
  INVITED,
  connectedWalletValue,
  makeFakeContract,
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

const noState = () => {}

describe('MatchListScreen', () => {
  it('prompts to connect while disconnected and issues no reads', async () => {
    renderApp({ route: '/matches', wallet: makeWalletValue() })
    expect(await screen.findByTestId('match-list-connect-prompt')).toBeTruthy()
    expect(screen.queryByTestId('match-list')).toBeNull()
  })

  it('shows the empty state with a create CTA for a fresh wallet', async () => {
    const contract = makeFakeContract()
    renderApp({
      route: '/matches',
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })
    expect(await screen.findByTestId('match-list-empty')).toBeTruthy()
  })

  it('lists a created match under Waiting for the creator', async () => {
    const contract = makeFakeContract()
    await contract.writeClientFor(CREATOR).createMatch(INVITED, noState)

    renderApp({
      route: '/matches',
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })

    const section = await screen.findByTestId('match-list-section-waiting')
    expect(section.textContent).toContain('Match #1')
    expect(section.textContent).toContain('You created')
    expect(section.textContent).toContain('0xbbbb…0002')
  })

  it('lists a joined match under In Progress for the joiner', async () => {
    const contract = makeFakeContract()
    await contract.writeClientFor(CREATOR).createMatch(INVITED, noState)
    await contract.writeClientFor(INVITED).joinMatch(1n, noState)

    renderApp({
      route: '/matches',
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })

    const section = await screen.findByTestId('match-list-section-active')
    expect(section.textContent).toContain('You joined')
    expect(section.textContent).toContain('0xaaaa…0001')
    expect(screen.queryByTestId('match-list-section-waiting')).toBeNull()
  })

  it('scores a finished match per viewer: winner sees Won, loser sees Lost', async () => {
    const contract = makeFakeContract()
    contract.startBattle()
    contract.match = {
      ...contract.match!,
      status: 'Finished',
      winner: CREATOR,
      currentTurn: null,
      finishedAt: Math.floor(Date.now() / 1000),
    }

    renderApp({
      route: '/matches',
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })
    const winnerSection = await screen.findByTestId('match-list-section-finished')
    expect(winnerSection.textContent).toContain('You won')

    cleanup()
    renderApp({
      route: '/matches',
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })
    const loserSection = await screen.findByTestId('match-list-section-finished')
    expect(loserSection.textContent).toContain('You lost')
  })

  it('opens the versioned match route from a card', async () => {
    const contract = makeFakeContract()
    await contract.writeClientFor(CREATOR).createMatch(INVITED, noState)

    renderApp({
      route: '/matches',
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })

    const card = await screen.findByTestId('match-card-1')
    expect(card.getAttribute('href')).toBe('/match/arb-sepolia-v1/1')
    await userEvent.click(card)
    await waitFor(() => expect(screen.getByTestId('match-phase-kind')).toBeTruthy())
  })

  it('shows a retry path when the list read fails', async () => {
    const contract = makeFakeContract()
    await contract.writeClientFor(CREATOR).createMatch(INVITED, noState)
    const failingOnce = vi
      .spyOn(contract.readClient, 'getPlayerMatchCount')
      .mockRejectedValueOnce(new Error('rpc down'))

    renderApp({
      route: '/matches',
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })

    expect(await screen.findByTestId('match-list-error')).toBeTruthy()
    await userEvent.click(screen.getByTestId('match-list-retry'))
    expect(await screen.findByTestId('match-list-section-waiting')).toBeTruthy()
    expect(failingOnce).toHaveBeenCalled()
  })
})

describe('practice hub My Battles entry', () => {
  it('routes My Battles from the practice hub to the list', async () => {
    const contract = makeFakeContract()
    renderApp({
      route: '/practice',
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'My Battles' }))
    expect(await screen.findByTestId('match-list-screen')).toBeTruthy()
  })
})
