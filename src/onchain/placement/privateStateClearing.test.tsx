/**
 * GAME-803: private placement state is cleared on every scope change —
 * account switch, chain switch, logout/disconnect, and deployment change.
 * The plaintext fleet may never survive into another identity's scope, and
 * the scoped CoFHE client must be disposed alongside it.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BattleshipWriteClient } from '../client/battleshipClient'
import type { ChainMatchView } from '../client/mapping'
import {
  CofheClientFactoryContext,
  type CofheClientFactory,
} from '../fhenix/useCofheMatchClient'
import { cofheScopeKey, type CofheMatchClient } from '../fhenix/types'
import type { MatchPhase } from '../phaseResolver'
import {
  connectedWalletValue,
  CREATOR,
  INVITED,
  makeWalletValue,
} from '../testSupport'
import type { WalletContextValue } from '../wallet/WalletSessionContext'
import { EncryptedFleetPanel } from './EncryptedFleetPanel'
import { usePlacementStore } from './placementStore'

const PHASE: Extract<MatchPhase, { kind: 'placement' }> = {
  kind: 'placement',
  canSubmit: true,
  submitted: false,
  waitingForOpponent: false,
  validating: false,
  invalid: false,
}

function matchView(over: Partial<ChainMatchView> = {}): ChainMatchView {
  return {
    deploymentId: 'arb-sepolia-v1',
    matchId: '7',
    matchIdBig: 7n,
    status: 'WaitingForPlacement',
    matchType: 'Friend',
    creator: CREATOR,
    opponent: INVITED,
    invitedOpponent: INVITED,
    currentTurn: null,
    winner: null,
    createdAt: 1,
    joinedAt: 2,
    startedAt: 0,
    finishedAt: 0,
    lastActionAt: 2,
    moveCount: 0,
    pendingMoveId: 0,
    deadlines: { joinDeadline: 0, placementDeadline: 100, turnDeadline: 0, resolvingDeadline: 0 },
    ...over,
  }
}

const disposed: string[] = []

const factory: CofheClientFactory = (config) => {
  const client: CofheMatchClient = {
    execution: 'worker',
    scopeKey: cofheScopeKey(config.scope),
    initialize: vi.fn(async () => {}),
    encryptFleet: vi.fn(),
    fetchDecryptProof: vi.fn(),
    dispose: () => disposed.push(cofheScopeKey(config.scope)),
  }
  return client
}

/** Minimal write client so the scoped CoFHE encryptor is enabled. */
const writeClientStub = {
  submitFleet: vi.fn(),
} as unknown as BattleshipWriteClient

function mount(wallet: WalletContextValue, match: ChainMatchView) {
  return render(
    <CofheClientFactoryContext.Provider value={factory}>
      <EncryptedFleetPanel
        phase={PHASE}
        match={match}
        readClient={null}
        writeClient={writeClientStub}
        wallet={wallet}
        onRefetch={() => {}}
      />
    </CofheClientFactoryContext.Provider>,
  )
}

function rerenderWith(
  view: ReturnType<typeof render>,
  wallet: WalletContextValue,
  match: ChainMatchView,
) {
  view.rerender(
    <CofheClientFactoryContext.Provider value={factory}>
      <EncryptedFleetPanel
        phase={PHASE}
        match={match}
        readClient={null}
        writeClient={writeClientStub}
        wallet={wallet}
        onRefetch={() => {}}
      />
    </CofheClientFactoryContext.Provider>,
  )
}

async function placeOneShip() {
  // Slot 0 (carrier) is auto-selected; tapping A1 places it horizontally.
  const grid = screen.getByRole('grid', { name: 'Fleet placement grid' })
  await userEvent.click(grid.querySelector('[aria-label^="A1"]') as HTMLButtonElement)
  expect(usePlacementStore.getState().placements[0]).not.toBeNull()
}

beforeEach(() => {
  disposed.length = 0
  usePlacementStore.getState().bindScope(null)
})
afterEach(cleanup)

describe('private placement state clearing (GAME-803)', () => {
  it('wipes the plaintext fleet when the account changes', async () => {
    const view = mount(connectedWalletValue(CREATOR), matchView())
    await placeOneShip()

    rerenderWith(view, connectedWalletValue(INVITED), matchView())
    expect(usePlacementStore.getState().placements.every((p) => p === null)).toBe(true)
  })

  it('wipes the plaintext fleet when the chain changes', async () => {
    const view = mount(connectedWalletValue(CREATOR), matchView())
    await placeOneShip()

    const otherChain = connectedWalletValue(CREATOR)
    otherChain.session = { ...otherChain.session, chainId: 1, isCorrectChain: false }
    rerenderWith(view, otherChain, matchView())
    expect(usePlacementStore.getState().placements.every((p) => p === null)).toBe(true)
  })

  it('wipes the plaintext fleet on logout / disconnect', async () => {
    const view = mount(connectedWalletValue(CREATOR), matchView())
    await placeOneShip()

    rerenderWith(view, makeWalletValue(), matchView())
    expect(usePlacementStore.getState().scopeKey).toBeNull()
    expect(usePlacementStore.getState().placements.every((p) => p === null)).toBe(true)
  })

  it('wipes the plaintext fleet when the deployment changes', async () => {
    const view = mount(connectedWalletValue(CREATOR), matchView())
    await placeOneShip()

    rerenderWith(view, connectedWalletValue(CREATOR), matchView({ deploymentId: 'arb-sepolia-v2' }))
    expect(usePlacementStore.getState().placements.every((p) => p === null)).toBe(true)
  })

  it('wipes the plaintext fleet on unmount (leaving the match route)', async () => {
    const view = mount(connectedWalletValue(CREATOR), matchView())
    await placeOneShip()

    view.unmount()
    expect(usePlacementStore.getState().scopeKey).toBeNull()
    expect(usePlacementStore.getState().placements.every((p) => p === null)).toBe(true)
  })

  it('disposes the scoped CoFHE client when the account changes', async () => {
    const view = mount(connectedWalletValue(CREATOR, { publicClient: {} as never, walletClient: {} as never }), matchView())
    await waitFor(() => expect(screen.queryByTestId('cofhe-initializing')).toBeNull())

    const before = disposed.length
    rerenderWith(
      view,
      connectedWalletValue(INVITED, { publicClient: {} as never, walletClient: {} as never }),
      matchView(),
    )
    await waitFor(() => expect(disposed.length).toBeGreaterThan(before))
    expect(disposed[disposed.length - 1]).toBe(
      cofheScopeKey({
        address: CREATOR,
        chainId: 421614,
        deploymentId: 'arb-sepolia-v1',
        matchId: 7n,
      }),
    )
  })

  it('keeps an identical scope bound across re-renders (no placement loss)', async () => {
    const view = mount(connectedWalletValue(CREATOR), matchView())
    await placeOneShip()

    rerenderWith(view, connectedWalletValue(CREATOR), matchView())
    expect(usePlacementStore.getState().placements[0]).not.toBeNull()
  })
})
