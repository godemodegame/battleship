/**
 * Phase 5 exit-criterion integration test: two wallets create and join one
 * friend match from the UI against a shared mock contract, with direct invite
 * links resolving the correct deployment and match (roadmap, Phase 5).
 */

import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  CREATOR,
  INVITED,
  connectedWalletValue,
  makeFakeContract,
  renderApp,
} from './testSupport'

vi.mock('../three/Scene', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas" />,
}))

vi.mock('../lib/sfx', () => ({
  sfx: new Proxy({}, { get: () => vi.fn() }),
}))

vi.mock('../lib/haptics', () => ({
  haptics: new Proxy({}, { get: () => vi.fn() }),
}))

describe('two-wallet friend match flow (Phase 5 exit criterion)', () => {
  it('creator creates from the UI; the invited wallet joins through the invite link', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: vi.fn(async () => ''), writeText: vi.fn(async () => {}) },
      configurable: true,
    })
    const contract = makeFakeContract() // one shared "chain" for both wallets

    // --- Wallet A: create the match from the menu flow -----------------------
    renderApp({
      route: '/match/new',
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })

    await userEvent.type(screen.getByTestId('invited-address-input'), INVITED)
    await userEvent.click(screen.getByTestId('create-match'))

    await waitFor(() => expect(screen.getByTestId('invite-panel')).toBeTruthy())
    const inviteLink = screen.getByTestId('invite-link').textContent!
    expect(inviteLink).toContain('/match/arb-sepolia-v1/1')
    expect(contract.match!.status).toBe('WaitingForOpponent')
    expect(contract.match!.invitedOpponent).toBe(INVITED)

    // --- Wallet B: open the invite link in a fresh "browser" -----------------
    cleanup()
    const invitePath = new URL(inviteLink, 'http://localhost').pathname
    renderApp({
      route: invitePath,
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })

    await waitFor(() => expect(screen.getByTestId('join-panel')).toBeTruthy())
    await userEvent.click(screen.getByTestId('join-match'))

    await waitFor(() =>
      expect(screen.getByTestId('match-phase-kind').textContent).toContain('placement'),
    )
    expect(contract.match!.opponent).toBe(INVITED)
    expect(contract.match!.status).toBe('WaitingForPlacement')

    // --- Wallet A returns (refresh): sees the joined match state -------------
    cleanup()
    renderApp({
      route: invitePath,
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })
    await waitFor(() =>
      expect(screen.getByTestId('match-phase-kind').textContent).toContain('placement'),
    )
  })
})
