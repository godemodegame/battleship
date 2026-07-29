/**
 * Phase 7 exit-criterion integration tests (GAME-701..712), now against the 3D
 * battle every on-chain mode renders. Two wallets play a contract-derived
 * battle through the match route with the shared fake contract; the frontend
 * never computes results, so every assertion checks that the local mirror
 * reflects what the fake contract finalized.
 *
 * Targeting happens on the 3D board, which jsdom cannot click, so the tests
 * select the target through the practice store exactly as the canvas does and
 * then press the real Fire button.
 */

import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoPlaceFleet } from '../../game/board'
import { resetPracticeState, useStore } from '../../practice/practiceStore'
import {
  CREATOR,
  DEPLOYMENT_ID,
  INVITED,
  connectedWalletValue,
  makeFakeContract,
  renderApp,
} from '../testSupport'
import { resetMatchFleetStash, stashMatchFleet } from '../match/matchFleetStash'
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

const ROUTE = `/match/${DEPLOYMENT_ID}/1`

/** Pick a target the way a tap on the 3D enemy board does. */
function selectCell(cell: number) {
  useStore.getState().selectCell(cell)
}

/** The Fire action enables once a cell is picked, the driver is installed, and it is our turn. */
async function fireAt(cell: number) {
  selectCell(cell)
  const fire = await screen.findByRole('button', { name: /Fire at/ })
  await waitFor(() => expect(fire.hasAttribute('disabled')).toBe(false))
  await userEvent.click(fire)
}

beforeEach(() => {
  resetMoveFx()
  resetMatchFleetStash()
  resetPracticeState()
  for (const key of Object.keys(sfxCalls)) delete sfxCalls[key]
})

afterEach(() => {
  cleanup()
  resetPracticeState()
})

describe('on-chain battle flow (Phase 7)', () => {
  it('fires, auto-finalizes, and lets the contract decide the miss', async () => {
    const contract = makeFakeContract()
    contract.startBattle() // the invited opponent moves first
    contract.nextResults.push({ result: 'Miss' })
    stashMatchFleet(DEPLOYMENT_ID, '1', { player: autoPlaceFleet() })

    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })

    expect(await screen.findByTestId('onchain-battle-3d')).toBeTruthy()
    // The 3D battle owns the screen: no route-level exit sits behind it. The
    // HUD's forfeit is the only way out of a live match.
    expect(screen.queryByRole('link', { name: 'Back to Practice' })).toBeNull()
    await fireAt(5)

    // GAME-704/705: attack then permissionless finalization, no manual step.
    await waitFor(() => expect(contract.moves[0]?.result).toBe('Miss'))
    expect(contract.match!.currentTurn).toBe(CREATOR)

    // GAME-707: the miss lands on the local mirror exactly once, from the
    // contract's finalized result — the client never resolved it itself.
    await waitFor(() => {
      const local = useStore.getState().match!
      expect(local.boards.bot.shots[5]).toBe(1)
      expect(local.moves.filter((move) => move.by === 'player')).toHaveLength(1)
    })
    expect(sfxCalls.miss).toBe(1)
  })

  it('keeps the attacker on turn after a finalized hit', async () => {
    const contract = makeFakeContract()
    contract.startBattle()
    contract.nextResults.push({ result: 'Hit' })
    stashMatchFleet(DEPLOYMENT_ID, '1', { player: autoPlaceFleet() })

    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })

    expect(await screen.findByTestId('onchain-battle-3d')).toBeTruthy()
    await fireAt(11)

    await waitFor(() => expect(contract.moves[0]?.result).toBe('Hit'))
    expect(contract.match!.currentTurn).toBe(INVITED)
    await waitFor(() => {
      const local = useStore.getState().match!
      expect(local.boards.bot.shots[11]).toBe(2)
      expect(local.turn).toBe('player')
    })
    expect(sfxCalls.hit).toBe(1)
  })

  it('rebuilds the board from chain history on a refresh with no retained fleet', async () => {
    const contract = makeFakeContract()
    contract.startBattle({ currentTurn: INVITED })
    // Two finalized shots already happened before this client loaded.
    contract.moves.push(
      {
        moveId: 1,
        attacker: INVITED,
        defender: CREATOR,
        cellIndex: 3,
        result: 'Miss',
        sunkShipId: 0,
        submittedAt: 1,
        resolvedAt: 1,
        finalized: true,
      },
      {
        moveId: 2,
        attacker: CREATOR,
        defender: INVITED,
        cellIndex: 44,
        result: 'Hit',
        sunkShipId: 0,
        submittedAt: 2,
        resolvedAt: 2,
        finalized: true,
      },
    )
    contract.match = { ...contract.match!, moveCount: 2 }

    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })

    // Still the 3D battle — there is no flat board anywhere in the game — and
    // both boards carry the history even though no plaintext fleet survived.
    expect(await screen.findByTestId('onchain-battle-3d')).toBeTruthy()
    await waitFor(() => {
      const local = useStore.getState().match!
      expect(local.boards.bot.shots[3]).toBe(1)
      expect(local.boards.player.shots[44]).toBe(2)
      // No own geometry: the reload dropped the plaintext fleet.
      expect(local.boards.player.ships).toHaveLength(0)
    })
  })

  it('renders the terminal result in 3D for a finished PvP match', async () => {
    const contract = makeFakeContract()
    contract.startBattle()
    contract.match = {
      ...contract.match!,
      status: 'Finished',
      winner: INVITED,
      currentTurn: null,
      finishedAt: Math.floor(Date.now() / 1000),
    }

    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(INVITED),
      clients: contract.clientsFor(INVITED),
    })

    expect(await screen.findByTestId('onchain-battle-3d')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Victory' })).toBeTruthy()
    // The result overlay carries its own Main Menu; the route link stays hidden.
    expect(screen.queryByRole('link', { name: 'Back to Practice' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Main Menu' })).toBeTruthy()
  })
})
