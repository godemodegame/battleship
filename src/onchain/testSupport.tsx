/**
 * Shared Phase 5 test support (not a test suite).
 *
 * Provides:
 * - wallet context values for connected / disconnected viewers;
 * - an in-memory fake BattleshipGame contract implementing the typed client
 *   interfaces, with event delivery to watchers (so refetch wiring is
 *   exercised end-to-end);
 * - a render helper mounting routes with wallet + client overrides.
 */

import { render } from '@testing-library/react'
import { MemoryRouter, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'
import { vi } from 'vitest'
import { appRoutes } from '../app/routes/appRoutes'
import type {
  BattleshipReadClient,
  BattleshipWriteClient,
  MatchEventRef,
} from './client/battleshipClient'
import type { ChainMatchView } from './client/mapping'
import type { TxState } from './client/txTracker'
import {
  BattleshipClientsOverrideContext,
  type BattleshipClients,
} from './client/useBattleshipClients'
import type { DeploymentResolution } from './deployments'
import type { HexAddress } from './phaseResolver'
import type { WalletSession } from './wallet/session'
import {
  DISCONNECTED_CONTEXT,
  WalletSessionContext,
  type WalletContextValue,
} from './wallet/WalletSessionContext'

export const CREATOR = '0xaaaa000000000000000000000000000000000001' as HexAddress
export const INVITED = '0xbbbb000000000000000000000000000000000002' as HexAddress
export const STRANGER = '0xcccc000000000000000000000000000000000003' as HexAddress
export const CONTRACT_ADDRESS = '0xdddd000000000000000000000000000000000004' as HexAddress
export const TX_HASH = '0xeeee000000000000000000000000000000000000000000000000000000000005' as const

export const DEPLOYMENT_ID = 'arb-sepolia-v1'

export function readySession(address: HexAddress): WalletSession {
  return {
    status: 'ready',
    address,
    chainId: 421614,
    isCorrectChain: true,
    isConnected: true,
  }
}

export function makeWalletValue(over: Partial<WalletContextValue> = {}): WalletContextValue {
  return {
    ...DISCONNECTED_CONTEXT,
    actions: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      switchToArbitrumSepolia: vi.fn(),
      prepareHandoff: vi.fn(),
      clearHandoffRestore: vi.fn(),
    },
    ...over,
  }
}

export function connectedWalletValue(
  address: HexAddress,
  over: Partial<WalletContextValue> = {},
): WalletContextValue {
  return makeWalletValue({
    session: readySession(address),
    canWrite: true,
    writeBlockedReason: null,
    balanceStatus: 'ok',
    balance: 10n ** 18n,
    ...over,
  })
}

export function readyResolution(): DeploymentResolution {
  return {
    ok: true,
    deploymentId: DEPLOYMENT_ID,
    ready: true,
    record: {
      deploymentId: DEPLOYMENT_ID,
      chainId: 421614,
      contractName: 'BattleshipGame',
      address: CONTRACT_ADDRESS,
      status: 'active',
    },
  }
}

const DAY = 86_400

export interface FakeContract {
  /** Current single match state (this fake hosts at most one match). */
  match: ChainMatchView | null
  readClient: BattleshipReadClient
  writeClientFor(account: HexAddress): BattleshipWriteClient
  clientsFor(account: HexAddress | null): BattleshipClients
  /** Deliver an event to watchers (writes emit automatically). */
  emit(eventName: string): void
  getMatchCalls: number
}

/**
 * In-memory contract with the real lifecycle transitions Phase 5 exercises:
 * create → waiting, join → waiting-for-placement, cancel/forfeit terminal.
 */
export function makeFakeContract(): FakeContract {
  let nextLogIndex = 0
  const watchers = new Map<string, (events: MatchEventRef[]) => void>()
  let watcherSeq = 0

  const walk = (onState: (s: TxState) => void) => {
    onState({ phase: 'wallet', hash: null, replaced: false, error: null })
    onState({ phase: 'pending', hash: TX_HASH, replaced: false, error: null })
    onState({ phase: 'success', hash: TX_HASH, replaced: false, error: null })
  }

  const fake: FakeContract = {
    match: null,
    getMatchCalls: 0,

    emit(eventName: string) {
      const events: MatchEventRef[] = [
        {
          eventName,
          blockHash: '0xblock',
          logIndex: nextLogIndex++,
          transactionHash: TX_HASH,
        },
      ]
      for (const onEvents of watchers.values()) onEvents(events)
    },

    readClient: {
      async getMatch(matchId: bigint) {
        fake.getMatchCalls += 1
        if (!fake.match || fake.match.matchIdBig !== matchId) return null
        return { ...fake.match }
      },
      watchMatch(_matchId: bigint, onEvents: (events: MatchEventRef[]) => void) {
        const key = `w${watcherSeq++}`
        watchers.set(key, onEvents)
        return () => watchers.delete(key)
      },
    },

    writeClientFor(account: HexAddress): BattleshipWriteClient {
      return {
        async createMatch(invitedOpponent, onState) {
          walk(onState)
          fake.match = {
            deploymentId: DEPLOYMENT_ID,
            matchId: '1',
            matchIdBig: 1n,
            status: 'WaitingForOpponent',
            matchType: 'Friend',
            creator: account,
            opponent: null,
            invitedOpponent,
            currentTurn: null,
            winner: null,
            createdAt: 1_000,
            joinedAt: 0,
            startedAt: 0,
            finishedAt: 0,
            lastActionAt: 1_000,
            moveCount: 0,
            pendingMoveId: 0,
            deadlines: {
              joinDeadline: Math.floor(Date.now() / 1000) + DAY,
              placementDeadline: 0,
              turnDeadline: 0,
              resolvingDeadline: 0,
            },
          }
          fake.emit('MatchCreated')
          return { ok: true, hash: TX_HASH, matchId: 1n }
        },

        async joinMatch(matchId, onState) {
          walk(onState)
          if (fake.match && fake.match.matchIdBig === matchId) {
            fake.match = {
              ...fake.match,
              opponent: account,
              status: 'WaitingForPlacement',
              joinedAt: 2_000,
            }
            fake.emit('MatchJoined')
          }
          return { ok: true, hash: TX_HASH }
        },

        async cancelMatch(matchId, onState) {
          walk(onState)
          if (fake.match && fake.match.matchIdBig === matchId) {
            fake.match = { ...fake.match, status: 'Cancelled' }
            fake.emit('MatchCancelled')
          }
          return { ok: true, hash: TX_HASH }
        },

        async forfeit(matchId, onState) {
          walk(onState)
          if (fake.match && fake.match.matchIdBig === matchId) {
            fake.match = { ...fake.match, status: 'Forfeited' }
            fake.emit('MatchForfeited')
          }
          return { ok: true, hash: TX_HASH }
        },
      }
    },

    clientsFor(account: HexAddress | null): BattleshipClients {
      return {
        resolution: readyResolution(),
        readClient: fake.readClient,
        writeClient: account ? fake.writeClientFor(account) : null,
      }
    },
  }

  return fake
}

export interface RenderAppOptions {
  route: string
  wallet: WalletContextValue
  clients?: BattleshipClients | null
}

/** Mount the full route tree with wallet + contract-client overrides. */
export function renderApp({ route, wallet, clients = null }: RenderAppOptions) {
  return render(
    <WalletSessionContext.Provider value={wallet}>
      <BattleshipClientsOverrideContext.Provider value={clients ? () => clients : null}>
        <MemoryRouter initialEntries={[route]}>
          <Routes>{appRoutes}</Routes>
        </MemoryRouter>
      </BattleshipClientsOverrideContext.Provider>
    </WalletSessionContext.Provider>,
  )
}

/** Mount an arbitrary element with the same providers (for single screens). */
export function renderWithProviders(
  ui: ReactElement,
  {
    wallet,
    clients = null,
    route = '/',
  }: { wallet: WalletContextValue; clients?: BattleshipClients | null; route?: string },
) {
  return render(
    <WalletSessionContext.Provider value={wallet}>
      <BattleshipClientsOverrideContext.Provider value={clients ? () => clients : null}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </BattleshipClientsOverrideContext.Provider>
    </WalletSessionContext.Provider>,
  )
}
