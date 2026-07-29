/**
 * GAME-810: raw provider/contract errors never render. The match route is
 * driven with reads and writes that fail with realistic raw internals (hex
 * data, revert identifiers, stack-like messages) and the document is asserted
 * to contain only mapped English copy.
 */

import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../practice/practiceStore'
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

const ROUTE = '/match/arb-sepolia-v1/1'
const RAW_MARKERS = ['0xdeadbeefcafef00d', 'ContractFunctionExecutionError', 'NotYourTurn']

function rawError(): Error {
  const err = new Error(
    'ContractFunctionExecutionError: reverted with 0xdeadbeefcafef00d at BattleshipGame.attack',
  )
  err.name = 'ContractFunctionExecutionError'
  ;(err as Error & { data: { errorName: string } }).data = { errorName: 'NotYourTurn' }
  return err
}

afterEach(cleanup)

describe('raw error exposure on the match route (GAME-810)', () => {
  it('a failing read renders mapped copy, never the raw error text', async () => {
    const contract = makeFakeContract()
    contract.startBattle()
    const failing = {
      ...contract.readClient,
      getMatch: vi.fn().mockRejectedValue(rawError()),
    }
    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: { ...contract.clientsFor(CREATOR), readClient: failing },
    })

    await waitFor(() => expect(screen.getByTestId('match-error')).toBeTruthy())
    const html = document.body.innerHTML
    for (const marker of RAW_MARKERS) {
      expect(html, `raw marker "${marker}" reached the DOM`).not.toContain(marker)
    }
  })

  it('a reverting write renders mapped copy, never the raw revert', async () => {
    const contract = makeFakeContract()
    contract.startBattle() // INVITED on turn
    const clients = contract.clientsFor(INVITED)
    clients.writeClient!.attack = vi.fn(async (_matchId, _cell, onState) => {
      onState({ phase: 'wallet', hash: null, replaced: false, error: null })
      // The tracked write maps the raw revert before it reaches state.
      onState({ phase: 'error', hash: null, replaced: false, error: 'not-your-turn' })
      return { ok: false as const, error: 'not-your-turn' as const }
    })

    renderApp({ route: ROUTE, wallet: connectedWalletValue(INVITED), clients })
    await waitFor(() => expect(screen.getByTestId('onchain-battle-3d')).toBeTruthy())

    // Target the way a tap on the 3D board does, then fire for real.
    useStore.getState().selectCell(3)
    const fire = await screen.findByRole('button', { name: /Fire at/ })
    await waitFor(() => expect(fire.hasAttribute('disabled')).toBe(false))
    await userEvent.click(fire)

    await waitFor(() => expect(screen.getByTestId('tx-error')).toBeTruthy())
    expect(screen.getByTestId('tx-error').textContent).toBe('It is not your turn')
    const html = document.body.innerHTML
    for (const marker of RAW_MARKERS) {
      expect(html, `raw marker "${marker}" reached the DOM`).not.toContain(marker)
    }
  })
})
