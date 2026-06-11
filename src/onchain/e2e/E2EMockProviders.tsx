/**
 * Browser-only local chain used by Playwright (GAME-905).
 *
 * It is compiled only when VITE_E2E_MOCKS=1. Two pages in one browser context
 * select different wallet identities through `?e2eWallet=creator|opponent`
 * while sharing the same localStorage-backed public match state.
 */

import { useMemo, type ReactNode } from 'react'
import type {
  BattleshipReadClient,
  BattleshipWriteClient,
  MatchEventRef,
} from '../client/battleshipClient'
import type { ChainMatchView, MatchPlayersView } from '../client/mapping'
import type { TxState } from '../client/txTracker'
import {
  BattleshipClientsOverrideContext,
  type BattleshipClients,
} from '../client/useBattleshipClients'
import type { HexAddress } from '../phaseResolver'
import {
  DISCONNECTED_CONTEXT,
  WalletSessionContext,
  type WalletContextValue,
} from '../wallet/WalletSessionContext'

const CREATOR = '0xaaaa000000000000000000000000000000000001' as HexAddress
const OPPONENT = '0xbbbb000000000000000000000000000000000002' as HexAddress
const CONTRACT = '0xdddd000000000000000000000000000000000004' as HexAddress
const TX_HASH = `0x${'ee'.repeat(32)}` as const
const DEPLOYMENT_ID = 'arb-sepolia-v1'
const STORAGE_KEY = 'battleship:e2e-chain:v1'
const LOCAL_EVENT = 'battleship:e2e-chain'

interface StoredMatch {
  matchId: string
  status: 'WaitingForOpponent' | 'WaitingForPlacement' | 'Cancelled'
  creator: HexAddress
  opponent: HexAddress | null
  invitedOpponent: HexAddress
  createdAt: number
  joinedAt: number
  finishedAt: number
}

function activeAccount(): HexAddress | null {
  const wallet = new URLSearchParams(window.location.search).get('e2eWallet')
  if (wallet === 'creator') return CREATOR
  if (wallet === 'opponent') return OPPONENT
  return null
}

function readStoredMatch(): StoredMatch | null {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredMatch
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function writeStoredMatch(match: StoredMatch, eventName: string) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(match))
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: eventName }))
}

function toMatchView(match: StoredMatch): ChainMatchView {
  return {
    deploymentId: DEPLOYMENT_ID,
    matchId: match.matchId,
    matchIdBig: BigInt(match.matchId),
    status: match.status,
    matchType: 'Friend',
    creator: match.creator,
    opponent: match.opponent,
    invitedOpponent: match.invitedOpponent,
    currentTurn: null,
    winner: null,
    createdAt: match.createdAt,
    joinedAt: match.joinedAt,
    startedAt: 0,
    finishedAt: match.finishedAt,
    lastActionAt: match.joinedAt || match.createdAt,
    moveCount: 0,
    pendingMoveId: 0,
    deadlines: {
      joinDeadline: match.createdAt + 86_400,
      placementDeadline: match.joinedAt ? match.joinedAt + 86_400 : 0,
      turnDeadline: 0,
      resolvingDeadline: 0,
    },
  }
}

function emptyPlayers(match: StoredMatch): MatchPlayersView {
  const player = (address: HexAddress | null) => ({
    player: address,
    joined: address !== null,
    placementStatus: address ? ('NotSubmitted' as const) : ('None' as const),
    fleetSubmitted: false,
    fleetValid: false,
    publicBoard: { attackedMask: 0n, missMask: 0n, hitMask: 0n, sunkMask: 0n },
  })
  return {
    creator: player(match.creator),
    opponent: player(match.opponent),
  }
}

function emitTx(onState: (state: TxState) => void) {
  onState({ phase: 'wallet', hash: null, replaced: false, error: null })
  onState({ phase: 'pending', hash: TX_HASH, replaced: false, error: null })
  onState({ phase: 'success', hash: TX_HASH, replaced: false, error: null })
}

function makeClients(account: HexAddress | null): BattleshipClients {
  const readClient: BattleshipReadClient = {
    async getMatch(matchId) {
      const match = readStoredMatch()
      return match && BigInt(match.matchId) === matchId ? toMatchView(match) : null
    },
    async getPlayers() {
      const match = readStoredMatch()
      if (!match) throw new Error('E2E match not found')
      return emptyPlayers(match)
    },
    async getMoveHistory() {
      return []
    },
    async getPendingShot() {
      return null
    },
    watchMatch(matchId, onEvents) {
      const notify = (eventName: string) => {
        const match = readStoredMatch()
        if (!match || BigInt(match.matchId) !== matchId) return
        const event: MatchEventRef = {
          eventName,
          blockHash: '0xe2e',
          logIndex: 0,
          transactionHash: TX_HASH,
        }
        onEvents([event])
      }
      const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) notify('StorageChanged')
      }
      const onLocal = (event: Event) => {
        notify((event as CustomEvent<string>).detail ?? 'LocalChanged')
      }
      window.addEventListener('storage', onStorage)
      window.addEventListener(LOCAL_EVENT, onLocal)
      return () => {
        window.removeEventListener('storage', onStorage)
        window.removeEventListener(LOCAL_EVENT, onLocal)
      }
    },
  }

  const writeClient: BattleshipWriteClient | null = account
    ? {
        async createMatch(invitedOpponent, onState) {
          emitTx(onState)
          const now = Math.floor(Date.now() / 1000)
          writeStoredMatch(
            {
              matchId: '1',
              status: 'WaitingForOpponent',
              creator: account,
              opponent: null,
              invitedOpponent,
              createdAt: now,
              joinedAt: 0,
              finishedAt: 0,
            },
            'MatchCreated',
          )
          return { ok: true, hash: TX_HASH, matchId: 1n }
        },
        async joinMatch(matchId, onState) {
          emitTx(onState)
          const match = readStoredMatch()
          if (
            !match ||
            BigInt(match.matchId) !== matchId ||
            account !== match.invitedOpponent
          ) {
            return { ok: false, error: 'not-invited' }
          }
          writeStoredMatch(
            {
              ...match,
              status: 'WaitingForPlacement',
              opponent: account,
              joinedAt: Math.floor(Date.now() / 1000),
            },
            'MatchJoined',
          )
          return { ok: true, hash: TX_HASH }
        },
        async cancelMatch(matchId, onState) {
          emitTx(onState)
          const match = readStoredMatch()
          if (!match || BigInt(match.matchId) !== matchId || account !== match.creator) {
            return { ok: false, error: 'only-creator' }
          }
          writeStoredMatch(
            {
              ...match,
              status: 'Cancelled',
              finishedAt: Math.floor(Date.now() / 1000),
            },
            'MatchCancelled',
          )
          return { ok: true, hash: TX_HASH }
        },
        async forfeit(_matchId, onState) {
          emitTx(onState)
          return { ok: false, error: 'invalid-status' }
        },
      }
    : null

  return {
    resolution: {
      ok: true,
      deploymentId: DEPLOYMENT_ID,
      ready: true,
      record: {
        deploymentId: DEPLOYMENT_ID,
        chainId: 421614,
        contractName: 'BattleshipGame',
        address: CONTRACT,
        status: 'active',
      },
    },
    readClient,
    writeClient,
  }
}

function walletValue(account: HexAddress | null): WalletContextValue {
  if (!account) return DISCONNECTED_CONTEXT
  return {
    ...DISCONNECTED_CONTEXT,
    session: {
      status: 'ready',
      address: account,
      chainId: 421614,
      isCorrectChain: true,
      isConnected: true,
    },
    writeBlockedReason: null,
    canWrite: true,
    balance: 10n ** 18n,
    balanceStatus: 'ok',
  }
}

export default function E2EMockProviders({ children }: { children: ReactNode }) {
  const account = useMemo(activeAccount, [])
  const wallet = useMemo(() => walletValue(account), [account])
  const clients = useMemo(() => makeClients(account), [account])

  return (
    <WalletSessionContext.Provider value={wallet}>
      <BattleshipClientsOverrideContext.Provider value={() => clients}>
        {children}
      </BattleshipClientsOverrideContext.Provider>
    </WalletSessionContext.Provider>
  )
}
