/**
 * Bot (single-player practice) match frontend flow. Verifies the on-chain bot
 * UI wiring against the shared fake contract: creating a bot match lands in
 * battle on the player's turn, and the bot's turn is advanced through the
 * permissionless executeBotMove via the "Advance Opponent Turn" button, then
 * resolved exactly like a human shot. The contract chooses the bot's target;
 * the frontend never does.
 */

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOT_OPPONENT,
  CREATOR,
  connectedWalletValue,
  makeFakeContract,
  renderApp,
} from '../testSupport'
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

const ROUTE = '/match/arb-sepolia-v1/1'

beforeEach(() => {
  resetMoveFx()
})

describe('bot match frontend flow', () => {
  it('creates a bot match from the menu route and lands in battle on the player turn', async () => {
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

    // Lands on the battle, player moves first, no bot-advance button yet.
    await waitFor(() => expect(screen.getByTestId('onchain-battle-panel')).toBeTruthy())
    expect(screen.getByTestId('fire-button')).toBeTruthy()
    expect(screen.queryByTestId('advance-bot-turn')).toBeNull()
    expect(contract.match!.matchType).toBe('Bot')
    expect(contract.match!.currentTurn).toBe(CREATOR)
  })

  it('advances the bot turn: executeBotMove then finalize hands the turn back', async () => {
    const contract = makeFakeContract()
    // Set up a started bot match, then force the bot's turn.
    await contract.writeClientFor(CREATOR).createBotMatch!([], [], () => {})
    contract.match!.currentTurn = BOT_OPPONENT
    contract.nextResults.push({ result: 'Miss' })

    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: contract.clientsFor(CREATOR),
    })

    await waitFor(() => expect(screen.getByTestId('onchain-battle-panel')).toBeTruthy())
    // The bot's turn shows the advance button instead of the fire button.
    const advance = await screen.findByTestId('advance-bot-turn')
    expect(screen.queryByTestId('fire-button')).toBeNull()

    await userEvent.click(advance)

    // executeBotMove freezes the match in ResolvingShot with the bot as attacker.
    await waitFor(() => expect(screen.getByTestId('shot-resolving')).toBeTruthy())
    expect(contract.pendingShot!.attacker).toBe(BOT_OPPONENT)
    expect(contract.pendingShot!.defender).toBe(CREATOR)

    await waitFor(() =>
      expect(screen.getByTestId('finalize-shot').hasAttribute('disabled')).toBe(false),
    )
    await userEvent.click(screen.getByTestId('finalize-shot'))

    // A bot miss hands the turn back to the player.
    await waitFor(() => expect(screen.getByTestId('fire-button')).toBeTruthy())
    expect(contract.match!.currentTurn).toBe(CREATOR)
    expect(screen.queryByTestId('advance-bot-turn')).toBeNull()
  })
})
