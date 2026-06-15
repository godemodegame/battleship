/**
 * GAME-801: every contract write path records the mobile-wallet handoff
 * intent BEFORE the write reaches the wallet, so a backgrounded browser can
 * restore the route when the wallet app returns. Each test instruments the
 * wallet context and the fake write client, then asserts ordering.
 */

import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BattleshipWriteClient } from '../client/battleshipClient'
import type { BattleshipClients } from '../client/useBattleshipClients'
import { resetMoveFx } from '../battle/moveFx'
import {
  CREATOR,
  INVITED,
  TX_HASH,
  connectedWalletValue,
  emptyPlayerView,
  makeFakeContract,
  renderApp,
  type FakeContract,
} from '../testSupport'
import type { WalletContextValue } from './WalletSessionContext'

vi.mock('../../three/Scene', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas" />,
}))
vi.mock('../../lib/sfx', () => ({
  sfx: new Proxy({}, { get: () => vi.fn() }),
}))
vi.mock('../../lib/haptics', () => ({
  haptics: new Proxy({}, { get: () => vi.fn() }),
}))

const ROUTE = '/match/arb-sepolia-v1/1'

/** Wallet + clients whose calls append to a shared order log. */
function instrumented(viewer: typeof CREATOR | typeof INVITED, contract: FakeContract) {
  const order: string[] = []
  const wallet: WalletContextValue = connectedWalletValue(viewer)
  wallet.actions.prepareHandoff = vi.fn(() => order.push('handoff'))

  const base = contract.clientsFor(viewer)
  const writeClient = base.writeClient!
  const wrapped: BattleshipWriteClient = { ...writeClient }
  for (const key of Object.keys(writeClient) as Array<keyof BattleshipWriteClient>) {
    const method = writeClient[key]
    if (typeof method !== 'function') continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(wrapped as any)[key] = (...args: unknown[]) => {
      order.push(`write:${key}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (method as any)(...args)
    }
  }
  const clients: BattleshipClients = { ...base, writeClient: wrapped }
  return { order, wallet, clients }
}

function expectHandoffBefore(order: string[], write: string) {
  const handoffAt = order.indexOf('handoff')
  const writeAt = order.indexOf(write)
  expect(writeAt, `${write} was never called`).toBeGreaterThanOrEqual(0)
  expect(handoffAt, `handoff missing before ${write} (order: ${order.join(', ')})`)
    .toBeGreaterThanOrEqual(0)
  expect(handoffAt).toBeLessThan(writeAt)
}

beforeEach(() => {
  sessionStorage.clear()
  resetMoveFx()
})
afterEach(cleanup)

describe('mobile wallet handoff on write paths (GAME-801)', () => {
  it('join records handoff intent before joinWithFleet', async () => {
    const contract = makeFakeContract()
    await contract.writeClientFor(CREATOR).createMatch(INVITED, () => {})
    const { order, wallet, clients } = instrumented(INVITED, contract)

    renderApp({ route: ROUTE, wallet, clients })
    await waitFor(() => expect(screen.getByTestId('join-panel')).toBeTruthy())
    // Placement-first join: arrange a fleet, then the single action encrypts
    // and submits joinWithFleet (handoff recorded before the write opens).
    await userEvent.click(await screen.findByRole('button', { name: 'Auto Place' }))
    await waitFor(() =>
      expect((screen.getByTestId('join-match') as HTMLButtonElement).disabled).toBe(false),
    )
    await userEvent.click(screen.getByTestId('join-match'))

    await waitFor(() => expect(order).toContain('write:joinWithFleet'))
    expectHandoffBefore(order, 'write:joinWithFleet')
  })

  it('cancel records handoff intent before cancelMatch', async () => {
    const contract = makeFakeContract()
    await contract.writeClientFor(CREATOR).createMatch(INVITED, () => {})
    const { order, wallet, clients } = instrumented(CREATOR, contract)

    renderApp({ route: ROUTE, wallet, clients })
    await waitFor(() => expect(screen.getByTestId('invite-panel')).toBeTruthy())
    await userEvent.click(screen.getByTestId('cancel-match'))

    expectHandoffBefore(order, 'write:cancelMatch')
  })

  it('attack, finalize, and forfeit each record handoff intent first', async () => {
    const contract = makeFakeContract()
    contract.startBattle() // invited moves first
    contract.nextResults.push({ result: 'Miss' })
    const { order, wallet, clients } = instrumented(INVITED, contract)

    renderApp({ route: ROUTE, wallet, clients })
    await waitFor(() => expect(screen.getByTestId('onchain-battle-panel')).toBeTruthy())

    const grid = screen.getByTestId('enemy-battle-grid')
    await userEvent.click(grid.querySelector('[data-cell="5"]') as HTMLButtonElement)
    await userEvent.click(screen.getByTestId('fire-button'))
    expectHandoffBefore(order, 'write:attack')

    await waitFor(() => expect(screen.getByTestId('shot-resolving')).toBeTruthy())
    order.length = 0
    // The finalize action needs the scoped CoFHE client before it enables.
    await waitFor(() =>
      expect(screen.getByTestId('finalize-shot').hasAttribute('disabled')).toBe(false),
    )
    await userEvent.click(screen.getByTestId('finalize-shot'))
    await waitFor(() => expectHandoffBefore(order, 'write:finalizeAttackWithProof'))

    await waitFor(() => expect(screen.getByTestId('forfeit-button')).toBeTruthy())
    order.length = 0
    await userEvent.click(screen.getByTestId('forfeit-button'))
    await userEvent.click(screen.getByTestId('forfeit-confirm'))
    expectHandoffBefore(order, 'write:forfeit')
  })

  it('timeout claim records handoff intent before claimTimeoutWin', async () => {
    const contract = makeFakeContract()
    const pastDeadline = Math.floor(Date.now() / 1000) - 10
    contract.startBattle({ currentTurn: CREATOR, turnDeadline: pastDeadline })
    const { order, wallet, clients } = instrumented(INVITED, contract)

    renderApp({ route: ROUTE, wallet, clients })
    await waitFor(() => expect(screen.getByTestId('claim-timeout-win')).toBeTruthy())
    await userEvent.click(screen.getByTestId('claim-timeout-win'))

    expectHandoffBefore(order, 'write:claimTimeoutWin')
  })

  it('placement validation finalize records handoff intent first', async () => {
    const contract = makeFakeContract()
    await contract.writeClientFor(CREATOR).createMatch(INVITED, () => {})
    await contract.writeClientFor(INVITED).joinMatch(1n, () => {})
    contract.players = {
      creator: emptyPlayerView(CREATOR, 'ResolvingValidation'),
      opponent: emptyPlayerView(INVITED, 'NotSubmitted'),
    }
    const { order, wallet, clients } = instrumented(CREATOR, contract)
    // The fake omits placement writes; add a stub so the button enables.
    clients.writeClient!.finalizeFleetValidationWithProof = (
      _matchId,
      _player,
      _proof,
      onState,
    ) => {
      order.push('write:finalizeFleetValidationWithProof')
      onState({ phase: 'success', hash: TX_HASH, replaced: false, error: null })
      return Promise.resolve({ ok: true, hash: TX_HASH })
    }

    renderApp({ route: ROUTE, wallet, clients })
    await waitFor(() => expect(screen.getByTestId('placement-validating')).toBeTruthy())
    await waitFor(() =>
      expect(screen.getByTestId('finalize-validation').hasAttribute('disabled')).toBe(false),
    )
    await userEvent.click(screen.getByTestId('finalize-validation'))

    await waitFor(() => expectHandoffBefore(order, 'write:finalizeFleetValidationWithProof'))
  })
})
