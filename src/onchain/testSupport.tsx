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
import { vi } from 'vitest'
import { appRoutes } from '../app/routes/appRoutes'
import type {
  BattleshipReadClient,
  BattleshipWriteClient,
  MatchEventRef,
} from './client/battleshipClient'
import type {
  ChainMatchView,
  ChainMoveView,
  ChainPendingShotView,
  ChainPlayerView,
  MatchPlayersView,
  ShotResultName,
} from './client/mapping'
import type { TxState } from './client/txTracker'
import {
  BattleshipClientsOverrideContext,
  type BattleshipClients,
} from './client/useBattleshipClients'
import type { DeploymentResolution } from './deployments'
import {
  cofheScopeKey,
  type CofheMatchClient,
} from './fhenix/types'
import {
  CofheClientFactoryContext,
  type CofheClientFactory,
} from './fhenix/useCofheMatchClient'
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
/** Virtual bot opponent sentinel — mirrors BattleshipGame.BOT_OPPONENT. */
export const BOT_OPPONENT = '0x0000000000000000000000000000000000000b07' as HexAddress
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
    // Non-null stand-ins so the CoFHE hook builds its config; the actual
    // CoFHE behavior comes from the fake factory below.
    publicClient: {} as never,
    walletClient: {} as never,
    ...over,
  })
}

/**
 * Deterministic CoFHE stand-in: encryption yields stable dummy `InEuint8`s
 * and decrypt-proof fetches resolve immediately. Override single members to
 * script failures.
 */
export function makeFakeCofheFactory(
  over: Partial<CofheMatchClient> = {},
): CofheClientFactory {
  return (config) => ({
    execution: 'worker',
    scopeKey: cofheScopeKey(config.scope),
    initialize: async () => {},
    encryptFleet: async (segments) =>
      segments.map((segment, index) => ({
        ctHash: BigInt(segment + index + 1),
        securityZone: 0,
        utype: 2,
        signature: `0x${index.toString(16).padStart(2, '0')}`,
      })),
    fetchDecryptProof: async (ctHash) => ({
      value: ctHash & 0xffn,
      signature: '0xproof' as `0x${string}`,
    }),
    dispose: () => {},
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

export function emptyPlayerView(
  player: HexAddress | null,
  placementStatus: ChainPlayerView['placementStatus'] = player ? 'NotSubmitted' : 'None',
): ChainPlayerView {
  const valid = placementStatus === 'Valid'
  return {
    player,
    joined: player !== null,
    placementStatus,
    fleetSubmitted: valid,
    fleetValid: valid,
    publicBoard: { attackedMask: 0n, missMask: 0n, hitMask: 0n, sunkMask: 0n },
  }
}

export interface FakeContract {
  /** Current single match state (this fake hosts at most one match). */
  match: ChainMatchView | null
  /**
   * Per-address indexed match ids, oldest first — mirrors the contract's
   * `playerMatchIds` (pushed at create and join).
   */
  playerMatchIds: Map<string, bigint[]>
  /** Public per-player boards, mirrored into getPlayers reads. */
  players: MatchPlayersView | null
  /** Public move history, oldest first. */
  moves: ChainMoveView[]
  pendingShot: ChainPendingShotView | null
  /**
   * Scripted "encrypted" outcomes consumed by finalizeAttackWithProof in
   * order. The real contract derives these from the published decrypt
   * proofs; the fake scripts them so tests stay deterministic.
   */
  nextResults: Array<{ result: ShotResultName; sunkShipId?: number }>
  readClient: BattleshipReadClient
  writeClientFor(account: HexAddress): BattleshipWriteClient
  clientsFor(account: HexAddress | null): BattleshipClients
  /** Deliver an event to watchers (writes emit automatically). */
  emit(eventName: string): void
  /** Jump the fake straight into a started battle (both fleets valid). */
  startBattle(options?: { currentTurn?: HexAddress; turnDeadline?: number }): void
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

  const playerMatchIds = new Map<string, bigint[]>()
  const indexMatchFor = (player: HexAddress, id: bigint) => {
    const key = player.toLowerCase()
    const ids = playerMatchIds.get(key) ?? []
    if (!ids.includes(id)) {
      ids.push(id)
      playerMatchIds.set(key, ids)
    }
  }

  const walk = (onState: (s: TxState) => void) => {
    onState({ phase: 'wallet', hash: null, replaced: false, error: null })
    onState({ phase: 'pending', hash: TX_HASH, replaced: false, error: null })
    onState({ phase: 'success', hash: TX_HASH, replaced: false, error: null })
  }

  const fake: FakeContract = {
    match: null,
    playerMatchIds,
    players: null,
    moves: [],
    pendingShot: null,
    nextResults: [],
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

    startBattle(options = {}) {
      const currentTurn = options.currentTurn ?? INVITED
      const nowTs = Math.floor(Date.now() / 1000)
      indexMatchFor(CREATOR, 1n)
      indexMatchFor(INVITED, 1n)
      fake.match = {
        deploymentId: DEPLOYMENT_ID,
        matchId: '1',
        matchIdBig: 1n,
        status: 'InProgress',
        matchType: 'Friend',
        creator: CREATOR,
        opponent: INVITED,
        invitedOpponent: INVITED,
        currentTurn,
        winner: null,
        createdAt: nowTs - 100,
        joinedAt: nowTs - 90,
        startedAt: nowTs - 10,
        finishedAt: 0,
        lastActionAt: nowTs - 10,
        moveCount: 0,
        pendingMoveId: 0,
        deadlines: {
          joinDeadline: 0,
          placementDeadline: 0,
          turnDeadline: options.turnDeadline ?? nowTs + DAY,
          resolvingDeadline: 0,
        },
      }
      fake.players = {
        creator: emptyPlayerView(CREATOR, 'Valid'),
        opponent: emptyPlayerView(INVITED, 'Valid'),
      }
      fake.moves = []
      fake.pendingShot = null
    },

    readClient: {
      async getMatch(matchId: bigint) {
        fake.getMatchCalls += 1
        if (!fake.match || fake.match.matchIdBig !== matchId) return null
        return { ...fake.match }
      },
      async getPlayerMatchCount(player: HexAddress) {
        return fake.playerMatchIds.get(player.toLowerCase())?.length ?? 0
      },
      async getPlayerMatches(player: HexAddress, offset: number, limit: number) {
        // Mirrors the contract's InvalidPaginationLimit guard (MAX_PAGE_LIMIT
        // 50), in the decoded-custom-error shape viem reverts carry.
        if (limit === 0 || limit > 50) {
          throw Object.assign(new Error('InvalidPaginationLimit'), {
            data: { errorName: 'InvalidPaginationLimit' },
          })
        }
        const ids = fake.playerMatchIds.get(player.toLowerCase()) ?? []
        return ids.slice(offset, offset + limit)
      },
      async getPlayers() {
        const players = fake.players ?? {
          creator: emptyPlayerView(fake.match?.creator ?? null),
          opponent: emptyPlayerView(fake.match?.opponent ?? null),
        }
        return {
          creator: { ...players.creator, publicBoard: { ...players.creator.publicBoard } },
          opponent: { ...players.opponent, publicBoard: { ...players.opponent.publicBoard } },
        }
      },
      async getMoveHistory() {
        return fake.moves.map((move) => ({ ...move }))
      },
      async getMove(_matchId: bigint, moveId: number) {
        const move = fake.moves.find((entry) => entry.moveId === moveId)
        return move ? { ...move } : null
      },
      async getPendingShot() {
        return fake.pendingShot ? { ...fake.pendingShot } : null
      },
      async getPendingPlacementValidation() {
        // Route-level tests drive validation through phase flags; a stable
        // handle is enough for the proof-fetch step.
        return { validityCtHash: 1n, requestedAt: 0 }
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
          indexMatchFor(account, 1n)
          fake.emit('MatchCreated')
          return { ok: true, hash: TX_HASH, matchId: 1n }
        },

        async createWithFleet(invitedOpponent, _segments, onState) {
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
          indexMatchFor(account, 1n)
          fake.emit('MatchCreated')
          return { ok: true, hash: TX_HASH, matchId: 1n }
        },

        async createBotMatch(_playerSegments, _botSegments, onState) {
          walk(onState)
          // The bot fleet is valid on creation and the player moves first, so
          // the match lands InProgress directly (the validation phase is shared
          // with PvP and covered elsewhere).
          const nowTs = Math.floor(Date.now() / 1000)
          fake.match = {
            deploymentId: DEPLOYMENT_ID,
            matchId: '1',
            matchIdBig: 1n,
            status: 'InProgress',
            matchType: 'Bot',
            creator: account,
            opponent: BOT_OPPONENT,
            invitedOpponent: null,
            currentTurn: account,
            winner: null,
            createdAt: nowTs - 5,
            joinedAt: nowTs - 5,
            startedAt: nowTs,
            finishedAt: 0,
            lastActionAt: nowTs,
            moveCount: 0,
            pendingMoveId: 0,
            deadlines: {
              joinDeadline: 0,
              placementDeadline: 0,
              turnDeadline: nowTs + DAY,
              resolvingDeadline: 0,
            },
          }
          fake.players = {
            creator: emptyPlayerView(account, 'Valid'),
            opponent: emptyPlayerView(BOT_OPPONENT, 'Valid'),
          }
          fake.moves = []
          fake.pendingShot = null
          indexMatchFor(account, 1n)
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
            indexMatchFor(account, matchId)
            fake.emit('MatchJoined')
          }
          return { ok: true, hash: TX_HASH }
        },

        async joinWithFleet(matchId, _segments, onState) {
          walk(onState)
          if (fake.match && fake.match.matchIdBig === matchId) {
            fake.match = {
              ...fake.match,
              opponent: account,
              status: 'ValidatingPlacement',
              joinedAt: 2_000,
            }
            indexMatchFor(account, matchId)
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
            const winner =
              account === fake.match.creator ? fake.match.opponent : fake.match.creator
            fake.match = {
              ...fake.match,
              status: 'Forfeited',
              winner,
              currentTurn: null,
            }
            fake.emit('MatchForfeited')
          }
          return { ok: true, hash: TX_HASH }
        },

        // ---- Phase 7 battle transitions, mirroring BattleshipGame.sol ----

        async attack(matchId, cellIndex, onState) {
          walk(onState)
          const m = fake.match
          if (!m || m.matchIdBig !== matchId || m.status !== 'InProgress') {
            return { ok: false, error: 'invalid-status' }
          }
          if (m.currentTurn !== account) return { ok: false, error: 'not-your-turn' }
          const defender = account === m.creator ? m.opponent! : m.creator!
          const defenderSlot =
            defender === m.creator ? fake.players!.creator : fake.players!.opponent
          const bit = 1n << BigInt(cellIndex)
          if (defenderSlot.publicBoard.attackedMask & bit) {
            return { ok: false, error: 'cell-already-attacked' }
          }
          defenderSlot.publicBoard.attackedMask |= bit

          const nowTs = Math.floor(Date.now() / 1000)
          const moveId = m.moveCount + 1
          fake.moves.push({
            moveId,
            attacker: account,
            defender,
            cellIndex,
            result: 'None',
            sunkShipId: 0,
            submittedAt: nowTs,
            resolvedAt: 0,
            finalized: false,
          })
          fake.pendingShot = {
            exists: true,
            moveId,
            attacker: account,
            defender,
            cellIndex,
            resultCtHash: BigInt(moveId * 2 + 1),
            sunkShipCtHash: BigInt(moveId * 2 + 2),
            submittedAt: nowTs,
          }
          fake.match = {
            ...m,
            status: 'ResolvingShot',
            moveCount: moveId,
            pendingMoveId: moveId,
          }
          fake.emit('ShotSubmitted')
          return { ok: true, hash: TX_HASH }
        },

        async executeBotMove(matchId, onState) {
          walk(onState)
          const m = fake.match
          if (!m || m.matchIdBig !== matchId || m.status !== 'InProgress') {
            return { ok: false, error: 'invalid-status' }
          }
          if (m.matchType !== 'Bot') return { ok: false, error: 'invalid-status' }
          if (m.currentTurn !== BOT_OPPONENT) return { ok: false, error: 'not-your-turn' }

          // The bot attacks the human (creator); the contract picks the target,
          // here just the first untried cell on the player's board.
          const defenderSlot = fake.players!.creator
          let cellIndex = 0
          while (
            cellIndex < 100 &&
            defenderSlot.publicBoard.attackedMask & (1n << BigInt(cellIndex))
          ) {
            cellIndex++
          }
          defenderSlot.publicBoard.attackedMask |= 1n << BigInt(cellIndex)

          const nowTs = Math.floor(Date.now() / 1000)
          const moveId = m.moveCount + 1
          fake.moves.push({
            moveId,
            attacker: BOT_OPPONENT,
            defender: m.creator!,
            cellIndex,
            result: 'None',
            sunkShipId: 0,
            submittedAt: nowTs,
            resolvedAt: 0,
            finalized: false,
          })
          fake.pendingShot = {
            exists: true,
            moveId,
            attacker: BOT_OPPONENT,
            defender: m.creator!,
            cellIndex,
            resultCtHash: BigInt(moveId * 2 + 1),
            sunkShipCtHash: BigInt(moveId * 2 + 2),
            submittedAt: nowTs,
          }
          fake.match = {
            ...m,
            status: 'ResolvingShot',
            moveCount: moveId,
            pendingMoveId: moveId,
          }
          fake.emit('ShotSubmitted')
          return { ok: true, hash: TX_HASH }
        },

        async finalizeAttackWithProof(matchId, moveId, _result, _sunkShip, onState) {
          walk(onState)
          const m = fake.match
          const pending = fake.pendingShot
          if (!m || m.matchIdBig !== matchId || m.status !== 'ResolvingShot' || !pending) {
            return { ok: false, error: 'invalid-status' }
          }
          if (moveId !== pending.moveId) return { ok: false, error: 'finalization-failed' }

          const scripted = fake.nextResults.shift() ?? { result: 'Miss' as const }
          const result = scripted.result
          const sunkShipId =
            result === 'Sunk' || result === 'Win' ? (scripted.sunkShipId ?? 1) : 0
          const nowTs = Math.floor(Date.now() / 1000)

          const move = fake.moves.find((entry) => entry.moveId === moveId)!
          move.result = result
          move.sunkShipId = sunkShipId
          move.resolvedAt = nowTs
          move.finalized = true

          const defenderSlot =
            pending.defender === m.creator ? fake.players!.creator : fake.players!.opponent
          const bit = 1n << BigInt(pending.cellIndex)
          if (result === 'Miss') {
            defenderSlot.publicBoard.missMask |= bit
          } else {
            defenderSlot.publicBoard.hitMask |= bit
            if (result !== 'Hit') defenderSlot.publicBoard.sunkMask |= bit
          }

          fake.pendingShot = null
          if (result === 'Win') {
            fake.match = {
              ...m,
              status: 'Finished',
              winner: pending.attacker,
              currentTurn: null,
              pendingMoveId: 0,
              finishedAt: nowTs,
            }
          } else {
            fake.match = {
              ...m,
              status: 'InProgress',
              currentTurn: result === 'Miss' ? pending.defender : pending.attacker,
              pendingMoveId: 0,
            }
          }
          fake.emit('ShotResolved')
          return { ok: true, hash: TX_HASH }
        },

        async claimTimeoutWin(matchId, onState) {
          walk(onState)
          const m = fake.match
          if (!m || m.matchIdBig !== matchId || m.status !== 'InProgress') {
            return { ok: false, error: 'invalid-status' }
          }
          if (m.currentTurn === account) return { ok: false, error: 'invalid-status' }
          if (Math.floor(Date.now() / 1000) <= m.deadlines.turnDeadline) {
            return { ok: false, error: 'invalid-status' }
          }
          fake.match = {
            ...m,
            status: 'Forfeited',
            winner: account,
            currentTurn: null,
          }
          fake.emit('TimeoutWinClaimed')
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
  cofheFactory?: CofheClientFactory
}

/** Mount the full route tree with wallet + contract-client overrides. */
export function renderApp({
  route,
  wallet,
  clients = null,
  cofheFactory = makeFakeCofheFactory(),
}: RenderAppOptions) {
  return render(
    <WalletSessionContext.Provider value={wallet}>
      <CofheClientFactoryContext.Provider value={cofheFactory}>
        <BattleshipClientsOverrideContext.Provider value={clients ? () => clients : null}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>{appRoutes}</Routes>
          </MemoryRouter>
        </BattleshipClientsOverrideContext.Provider>
      </CofheClientFactoryContext.Provider>
    </WalletSessionContext.Provider>,
  )
}
