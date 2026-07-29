/**
 * Bot (single-player practice) match frontend flow against the shared fake
 * contract. Creating a bot match lands in the 3D battle on the player's turn,
 * and the bot's move runs through the permissionless `executeBotMove` inside
 * the store's fire loop — there is no manual "Advance Opponent Turn" button and
 * no flat board anywhere. The contract chooses the bot's target; the frontend
 * never does.
 */

import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOT_OPPONENT,
  CREATOR,
  DEPLOYMENT_ID,
  connectedWalletValue,
  makeFakeContract,
  renderApp,
} from '../testSupport'
import { autoPlaceFleet } from '../../game/board'
import { resetPracticeState, useStore } from '../../practice/practiceStore'
import { resetMatchFleetStash, stashMatchFleet } from '../match/matchFleetStash'
import { resetMoveFx } from './moveFx'

vi.mock('../../three/Scene', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas" />,
}))

vi.mock('../../lib/sfx', () => ({
  sfx: new Proxy({}, { get: () => vi.fn() }),
}))

vi.mock('../../lib/haptics', () => ({
  haptics: new Proxy({}, { get: () => vi.fn() }),
}))

const ROUTE = `/match/${DEPLOYMENT_ID}/1`

beforeEach(() => {
  resetMoveFx()
  resetMatchFleetStash()
  resetPracticeState()
})

afterEach(() => {
  cleanup()
  resetPracticeState()
})

describe('bot match frontend flow', () => {
  it('creates a bot match from the menu route and lands in the 3D battle on the player turn', async () => {
    const contract = makeFakeContract()
    renderApp({
      route: '/match/bot',
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })

    // No invited-address field for the bot mode (single player).
    expect(await screen.findByTestId('create-bot-match-screen')).toBeTruthy()
    expect(screen.queryByTestId('invited-address-input')).toBeNull()

    await userEvent.click(await screen.findByRole('button', { name: 'Auto Place' }))
    await waitFor(() =>
      expect((screen.getByTestId('create-match') as HTMLButtonElement).disabled).toBe(false),
    )
    await userEvent.click(screen.getByTestId('create-match'))

    // Lands in the 3D battle; the player moves first and drives every turn from
    // the Fire action — no manual advance/finalize controls exist.
    await waitFor(() => expect(screen.getByTestId('onchain-battle-3d')).toBeTruthy())
    expect(screen.queryByTestId('advance-bot-turn')).toBeNull()
    expect(screen.queryByTestId('finalize-shot')).toBeNull()
    expect(contract.match!.matchType).toBe('Bot')
    expect(contract.match!.currentTurn).toBe(CREATOR)
  })

  it('runs the bot turn on-chain after the player misses', async () => {
    const contract = makeFakeContract()
    await contract.writeClientFor(CREATOR).createBotMatch!([], [], () => {})
    // The player's shot misses, which passes the turn to the bot; the bot's own
    // shot then misses too, handing the turn back.
    contract.nextResults.push({ result: 'Miss' }, { result: 'Miss' })
    stashMatchFleet(DEPLOYMENT_ID, '1', { player: autoPlaceFleet() })

    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })

    expect(await screen.findByTestId('onchain-battle-3d')).toBeTruthy()
    useStore.getState().selectCell(7)
    const fire = await screen.findByRole('button', { name: /Fire at/ })
    await waitFor(() => expect(fire.hasAttribute('disabled')).toBe(false))
    await userEvent.click(fire)

    // The contract resolved the player's shot, then executeBotMove ran for the
    // bot — both without a single manual tap.
    await waitFor(() => expect(contract.moves[0]?.result).toBe('Miss'))
    await waitFor(() => expect(contract.moves.length).toBeGreaterThan(1), { timeout: 4000 })
    expect(contract.moves[1].attacker).toBe(BOT_OPPONENT)
    expect(contract.moves[1].defender).toBe(CREATOR)
  })

  it('renders the 3D battle whether or not the fleet was retained', async () => {
    const contract = makeFakeContract()
    await contract.writeClientFor(CREATOR).createBotMatch!([], [], () => {})
    // No stash: a refresh or another device dropped the in-memory fleet. The
    // battle is still 3D — the own board is simply hidden.

    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })

    expect(await screen.findByTestId('onchain-battle-3d')).toBeTruthy()
    await waitFor(() =>
      expect(useStore.getState().match?.boards.player.ships).toHaveLength(0),
    )
  })

  it('owns the terminal screen in 3D', async () => {
    const contract = makeFakeContract()
    await contract.writeClientFor(CREATOR).createBotMatch!([], [], () => {})
    // The match ended on-chain before the local 3D sequence did (an on-chain
    // forfeit or a turn timeout swept by the contract): bot wins, player loses.
    const nowTs = Math.floor(Date.now() / 1000)
    contract.match = {
      ...contract.match!,
      status: 'Forfeited',
      winner: BOT_OPPONENT,
      currentTurn: null,
      finishedAt: nowTs,
    }
    stashMatchFleet(DEPLOYMENT_ID, '1', { player: autoPlaceFleet() })

    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })

    expect(await screen.findByTestId('onchain-battle-3d')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Defeat' })).toBeTruthy()
    // The overlay buttons drive the on-chain rematch / exit (not practice flow).
    expect(screen.getByRole('button', { name: 'Play Again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Main Menu' })).toBeTruthy()
  })
})
