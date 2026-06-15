import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BattleshipReadClient } from '../client/battleshipClient'
import {
  CONTRACT_ADDRESS,
  CREATOR,
  INVITED,
  STRANGER,
  connectedWalletValue,
  makeFakeContract,
  readyResolution,
  renderApp,
  type FakeContract,
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

const MATCH_ROUTE = '/match/arb-sepolia-v1/1'

/** Seed the fake with a created match (creator → invited, id 1). */
async function seededContract(): Promise<FakeContract> {
  const fake = makeFakeContract()
  await fake.writeClientFor(CREATOR).createMatch(INVITED, () => {})
  return fake
}

function mockClipboard() {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText, readText: vi.fn(async () => '') },
    configurable: true,
  })
  return { writeText }
}

describe('match route with live contract data (GAME-507/508)', () => {
  it('shows the creator the waiting state with invite link, identity, and explorer link (GAME-512)', async () => {
    const fake = await seededContract()
    renderApp({
      route: MATCH_ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: fake.clientsFor(CREATOR),
    })

    await waitFor(() => expect(screen.getByTestId('invite-panel')).toBeTruthy())
    expect(screen.getByTestId('match-phase-kind').textContent).toContain('waiting-for-opponent')
    expect(screen.getByTestId('invite-link').textContent).toContain('/match/arb-sepolia-v1/1')
    expect(screen.getByTestId('contract-explorer-link').getAttribute('href')).toBe(
      `https://sepolia.arbiscan.io/address/${CONTRACT_ADDRESS}`,
    )
  })

  it('copies the invite link and confirms it (GAME-506)', async () => {
    const { writeText } = mockClipboard()
    const fake = await seededContract()
    renderApp({
      route: MATCH_ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: fake.clientsFor(CREATOR),
    })

    await waitFor(() => expect(screen.getByTestId('copy-invite')).toBeTruthy())
    await userEvent.click(screen.getByTestId('copy-invite'))
    await waitFor(() => expect(screen.getByTestId('copy-note').textContent).toBe('Invite link copied'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/match/arb-sepolia-v1/1'))
  })

  it('lets the creator cancel and renders the cancelled state (GAME-508)', async () => {
    const fake = await seededContract()
    renderApp({
      route: MATCH_ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: fake.clientsFor(CREATOR),
    })

    await waitFor(() => expect(screen.getByTestId('cancel-match')).toBeTruthy())
    await userEvent.click(screen.getByTestId('cancel-match'))

    await waitFor(() => expect(screen.getByTestId('match-cancelled')).toBeTruthy())
    expect(screen.getByTestId('match-phase-kind').textContent).toContain('cancelled')
  })

  it('offers the invited wallet the join action and reaches placement after joining (GAME-507)', async () => {
    const fake = await seededContract()
    renderApp({
      route: MATCH_ROUTE,
      wallet: connectedWalletValue(INVITED),
      clients: fake.clientsFor(INVITED),
    })

    await waitFor(() => expect(screen.getByTestId('join-panel')).toBeTruthy())
    expect(screen.getByTestId('match-phase-kind').textContent).toContain('join')

    // Placement-first join: arrange a fleet, then join and submit in one action.
    await userEvent.click(await screen.findByRole('button', { name: 'Auto Place' }))
    await waitFor(() =>
      expect((screen.getByTestId('join-match') as HTMLButtonElement).disabled).toBe(false),
    )
    await userEvent.click(screen.getByTestId('join-match'))

    // Authoritative refetch after the confirmed join moves the phase forward.
    await waitFor(() =>
      expect(screen.getByTestId('match-phase-kind').textContent).toContain('placement'),
    )
    // joinWithFleet advances straight to placement validation.
    expect(fake.match!.status).toBe('ValidatingPlacement')
  })

  it('tells a non-invited wallet the invite belongs to someone else', async () => {
    const fake = await seededContract()
    renderApp({
      route: MATCH_ROUTE,
      wallet: connectedWalletValue(STRANGER),
      clients: fake.clientsFor(STRANGER),
    })

    await waitFor(() => expect(screen.getByTestId('wrong-wallet-note')).toBeTruthy())
    expect(screen.queryByTestId('join-panel')).toBeNull()
    expect(screen.queryByTestId('invite-panel')).toBeNull()
  })

  it('shows the expired state instead of a join action past the deadline (GAME-508)', async () => {
    const fake = await seededContract()
    fake.match = {
      ...fake.match!,
      deadlines: { ...fake.match!.deadlines, joinDeadline: 1_000 },
    }
    renderApp({
      route: MATCH_ROUTE,
      wallet: connectedWalletValue(INVITED),
      clients: fake.clientsFor(INVITED),
    })

    await waitFor(() => expect(screen.getByTestId('join-expired')).toBeTruthy())
    expect(screen.queryByTestId('join-match')).toBeNull()
  })

  it('lets the creator recover an expired invite by cancelling', async () => {
    const fake = await seededContract()
    fake.match = {
      ...fake.match!,
      deadlines: { ...fake.match!.deadlines, joinDeadline: 1_000 },
    }
    renderApp({
      route: MATCH_ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: fake.clientsFor(CREATOR),
    })

    await waitFor(() => expect(screen.getByTestId('invite-expired')).toBeTruthy())
    expect(screen.queryByTestId('invite-link')).toBeNull()
    expect(screen.getByTestId('cancel-match')).toBeTruthy()
  })

  it('renders not-found for a match id the contract does not know', async () => {
    const fake = makeFakeContract() // no match created
    renderApp({
      route: '/match/arb-sepolia-v1/42',
      wallet: connectedWalletValue(CREATOR),
      clients: fake.clientsFor(CREATOR),
    })
    await waitFor(() => expect(screen.getByTestId('match-not-found')).toBeTruthy())
  })

  it('recovers from a read failure through the retry action (GAME-508)', async () => {
    const fake = await seededContract()
    const failingOnce: BattleshipReadClient = {
      getMatch: vi
        .fn()
        .mockRejectedValueOnce(new Error('rpc down'))
        .mockImplementation((id: bigint) => fake.readClient.getMatch(id)),
      watchMatch: fake.readClient.watchMatch,
    }
    renderApp({
      route: MATCH_ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: { resolution: readyResolution(), readClient: failingOnce, writeClient: null },
    })

    await waitFor(() => expect(screen.getByTestId('match-error')).toBeTruthy())
    await userEvent.click(screen.getByTestId('match-retry'))
    await waitFor(() => expect(screen.getByTestId('invite-panel')).toBeTruthy())
  })

  it('refetches on contract events without user action (GAME-509)', async () => {
    const fake = await seededContract()
    renderApp({
      route: MATCH_ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: fake.clientsFor(CREATOR),
    })
    await waitFor(() => expect(screen.getByTestId('invite-panel')).toBeTruthy())

    // Another wallet joins out-of-band; the event drives an authoritative read.
    await fake.writeClientFor(INVITED).joinMatch(1n, () => {})
    await waitFor(() =>
      expect(screen.getByTestId('match-phase-kind').textContent).toContain('placement'),
    )
  })

  it('reconstructs the phase after a refresh straight onto the match URL', async () => {
    const fake = await seededContract()
    await fake.writeClientFor(INVITED).joinMatch(1n, () => {})

    // Fresh mount models the refresh: no navigation history, only the URL.
    renderApp({
      route: MATCH_ROUTE,
      wallet: connectedWalletValue(INVITED),
      clients: fake.clientsFor(INVITED),
    })
    await waitFor(() =>
      expect(screen.getByTestId('match-phase-kind').textContent).toContain('placement'),
    )
  })
})
