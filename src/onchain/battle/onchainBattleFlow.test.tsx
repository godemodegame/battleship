/**
 * Phase 7 exit-criterion integration tests (GAME-701..712): two wallets play a
 * contract-derived battle through the match route against the shared fake
 * contract. The frontend never computes results — every assertion checks that
 * the UI reflects what the fake contract finalized.
 */

import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CREATOR,
  INVITED,
  connectedWalletValue,
  makeFakeContract,
  renderApp,
} from '../testSupport'
import { resetMoveFx } from './moveFx'

vi.mock('../../three/Scene', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas" />,
}))

const sfxCalls: Record<string, number> = {}
vi.mock('../../lib/sfx', () => ({
  sfx: new Proxy(
    {},
    {
      get: (_target, prop) => () => {
        sfxCalls[String(prop)] = (sfxCalls[String(prop)] ?? 0) + 1
      },
    },
  ),
}))

vi.mock('../../lib/haptics', () => ({
  haptics: new Proxy({}, { get: () => vi.fn() }),
}))

const ROUTE = '/match/arb-sepolia-v1/1'

function enemyCell(cell: number): HTMLButtonElement {
  const grid = screen.getByTestId('enemy-battle-grid')
  return grid.querySelector(`[data-cell="${cell}"]`) as HTMLButtonElement
}

function cellLabelOf(cell: number): string {
  return `${'ABCDEFGHIJ'[cell % 10]}${Math.floor(cell / 10) + 1}`
}

beforeEach(() => {
  resetMoveFx()
  for (const key of Object.keys(sfxCalls)) delete sfxCalls[key]
})

describe('on-chain battle flow (Phase 7)', () => {
  it('fires, resolves, and finalizes a miss that passes the turn', async () => {
    const contract = makeFakeContract()
    contract.startBattle() // invited opponent moves first
    contract.nextResults.push({ result: 'Miss' })

    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })

    await waitFor(() => expect(screen.getByTestId('onchain-battle-panel')).toBeTruthy())
    expect(screen.getByTestId('battle-detail').textContent).toContain('You may fire')

    // GAME-703: only untried enemy cells are selectable on the active turn.
    await userEvent.click(enemyCell(5))
    const fire = screen.getByTestId('fire-button')
    expect(fire.textContent).toContain(cellLabelOf(5))
    await userEvent.click(fire)

    // GAME-704: the attack receipt enters ResolvingShot — no result effects yet.
    await waitFor(() => expect(screen.getByTestId('shot-resolving')).toBeTruthy())
    expect(contract.match!.status).toBe('ResolvingShot')
    expect(screen.queryByTestId('shot-result-banner')).toBeNull()
    expect(sfxCalls.miss ?? 0).toBe(0)

    // GAME-705: permissionless finalization publishes the contract result.
    await userEvent.click(screen.getByTestId('finalize-shot'))
    await waitFor(() =>
      expect(screen.getByTestId('battle-detail').textContent).toContain(
        'Waiting for opponent shot',
      ),
    )
    expect(contract.match!.currentTurn).toBe(CREATOR)
    expect(contract.moves[0].result).toBe('Miss')

    // GAME-707: exactly one effect from the finalized public outcome.
    const banner = screen.getByTestId('shot-result-banner')
    expect(banner.dataset.result).toBe('miss')
    expect(banner.dataset.moveId).toBe('1')
    expect(sfxCalls.miss).toBe(1)

    // The miss appears on the enemy grid from the refetched public masks.
    expect(enemyCell(5).dataset.cellState).toBe('miss')

    // GAME-708: history is rebuilt from the contract read.
    const history = screen.getByTestId('move-history')
    expect(within(history).getAllByTestId('move-history-entry')).toHaveLength(1)
    expect(history.textContent).toContain('Miss')
  })

  it('keeps the attacker on turn after a finalized hit and never duplicates effects', async () => {
    const contract = makeFakeContract()
    contract.startBattle()
    contract.nextResults.push({ result: 'Hit' })

    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })
    await waitFor(() => expect(screen.getByTestId('onchain-battle-panel')).toBeTruthy())

    await userEvent.click(enemyCell(11))
    await userEvent.click(screen.getByTestId('fire-button'))
    await waitFor(() => expect(screen.getByTestId('shot-resolving')).toBeTruthy())
    await userEvent.click(screen.getByTestId('finalize-shot'))

    await waitFor(() =>
      expect(screen.getByTestId('battle-detail').textContent).toContain('You may fire'),
    )
    expect(contract.match!.currentTurn).toBe(INVITED)
    expect(enemyCell(11).dataset.cellState).toBe('hit')
    expect(sfxCalls.hit).toBe(1)

    // GAME-706: duplicate events trigger refetches but never replay the move.
    contract.emit('ShotResolved')
    contract.emit('ShotResolved')
    await waitFor(() => expect(contract.getMatchCalls).toBeGreaterThan(2))
    expect(sfxCalls.hit).toBe(1)
    expect(screen.getAllByTestId('shot-result-banner')).toHaveLength(1)
  })

  it('recovers ResolvingShot after a refresh and offers retry (GAME-712)', async () => {
    const contract = makeFakeContract()
    contract.startBattle()

    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })
    await waitFor(() => expect(screen.getByTestId('onchain-battle-panel')).toBeTruthy())
    await userEvent.click(enemyCell(40))
    await userEvent.click(screen.getByTestId('fire-button'))
    await waitFor(() => expect(screen.getByTestId('shot-resolving')).toBeTruthy())

    // Refresh: a fresh mount rebuilds the resolving state from contract reads.
    cleanup()
    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })
    await waitFor(() => expect(screen.getByTestId('shot-resolving')).toBeTruthy())
    expect(screen.getByTestId('shot-resolving').textContent).toContain(cellLabelOf(40))

    // The permissionless CoFHE re-request stays available.
    await userEvent.click(screen.getByTestId('retry-shot-resolution'))
    await waitFor(() =>
      expect(screen.getByTestId('shot-resolving')).toBeTruthy(),
    )

    // Finalizing after the refresh resolves the same move exactly once.
    contract.nextResults.push({ result: 'Miss' })
    await userEvent.click(screen.getByTestId('finalize-shot'))
    await waitFor(() => expect(contract.moves[0].finalized).toBe(true))
    // The pre-refresh prime means no replay of older moves, only this one.
    await waitFor(() => expect(screen.getByTestId('shot-result-banner')).toBeTruthy())
    expect(sfxCalls.miss).toBe(1)
  })

  it('finishes by Win with a contract-derived summary and rematch (GAME-709/711)', async () => {
    const contract = makeFakeContract()
    contract.startBattle()
    contract.nextResults.push({ result: 'Win', sunkShipId: 10 })

    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })
    await waitFor(() => expect(screen.getByTestId('onchain-battle-panel')).toBeTruthy())
    await userEvent.click(enemyCell(77))
    await userEvent.click(screen.getByTestId('fire-button'))
    await waitFor(() => expect(screen.getByTestId('shot-resolving')).toBeTruthy())
    await userEvent.click(screen.getByTestId('finalize-shot'))

    // The winner summary renders purely from the contract state.
    await waitFor(() => expect(screen.getByTestId('match-summary-panel')).toBeTruthy())
    expect(screen.getByTestId('summary-title').dataset.outcome).toBe('won')
    expect(contract.match!.status).toBe('Finished')
    expect(contract.match!.winner).toBe(INVITED)
    expect(screen.getByTestId('summary-moves').textContent).toContain('1')
    expect(sfxCalls.win).toBe(1)

    // GAME-711: rematch starts the create-match flow with the opponent prefilled.
    await userEvent.click(screen.getByTestId('rematch-button'))
    await waitFor(() => expect(screen.getByTestId('create-match-screen')).toBeTruthy())
    const input = screen.getByTestId('invited-address-input') as HTMLInputElement
    expect(input.value).toBe(CREATOR)
  })

  it('shows the defeat summary to the losing wallet after refresh (GAME-708/709)', async () => {
    const contract = makeFakeContract()
    contract.startBattle()
    contract.nextResults.push({ result: 'Win', sunkShipId: 10 })

    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })
    await waitFor(() => expect(screen.getByTestId('onchain-battle-panel')).toBeTruthy())
    await userEvent.click(enemyCell(3))
    await userEvent.click(screen.getByTestId('fire-button'))
    await waitFor(() => expect(screen.getByTestId('shot-resolving')).toBeTruthy())
    await userEvent.click(screen.getByTestId('finalize-shot'))
    await waitFor(() => expect(contract.match!.status).toBe('Finished'))

    // The loser opens the match fresh: terminal state reconstructed from reads.
    cleanup()
    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })
    await waitFor(() => expect(screen.getByTestId('match-summary-panel')).toBeTruthy())
    expect(screen.getByTestId('summary-title').dataset.outcome).toBe('lost')
    const history = screen.getByTestId('move-history')
    expect(within(history).getAllByTestId('move-history-entry')).toHaveLength(1)
    // No replayed effects on a fresh load of a finished match.
    expect(screen.queryByTestId('shot-result-banner')).toBeNull()
  })

  it('blocks firing outside the wallet’s turn (GAME-703)', async () => {
    const contract = makeFakeContract()
    contract.startBattle() // invited on turn; creator is viewing
    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })
    await waitFor(() => expect(screen.getByTestId('onchain-battle-panel')).toBeTruthy())
    expect(screen.getByTestId('battle-detail').textContent).toContain(
      'Waiting for opponent shot',
    )
    expect((screen.getByTestId('fire-button') as HTMLButtonElement).disabled).toBe(true)
    expect(enemyCell(0).disabled).toBe(true)
  })

  it('forfeits from the battle panel (GAME-710)', async () => {
    const contract = makeFakeContract()
    contract.startBattle()
    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })
    await waitFor(() => expect(screen.getByTestId('onchain-battle-panel')).toBeTruthy())

    await userEvent.click(screen.getByTestId('forfeit-button'))
    await userEvent.click(screen.getByTestId('forfeit-confirm'))

    await waitFor(() => expect(screen.getByTestId('match-summary-panel')).toBeTruthy())
    expect(contract.match!.status).toBe('Forfeited')
    expect(contract.match!.winner).toBe(INVITED)
    expect(screen.getByTestId('summary-title').dataset.outcome).toBe('lost')
  })

  it('offers the timeout claim once the opponent stalls past the deadline (GAME-710)', async () => {
    const contract = makeFakeContract()
    const pastDeadline = Math.floor(Date.now() / 1000) - 10
    contract.startBattle({ turnDeadline: pastDeadline }) // invited on turn, stalled
    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })
    await waitFor(() => expect(screen.getByTestId('timeout-claim')).toBeTruthy())

    await userEvent.click(screen.getByTestId('claim-timeout-win'))
    await waitFor(() => expect(screen.getByTestId('match-summary-panel')).toBeTruthy())
    expect(contract.match!.status).toBe('Forfeited')
    expect(contract.match!.winner).toBe(CREATOR)
    expect(screen.getByTestId('summary-title').dataset.outcome).toBe('won')
  })
})
