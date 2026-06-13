/**
 * Typed BattleshipGame contract clients (GAME-502 / GAME-503).
 *
 * The UI talks to two narrow interfaces — `BattleshipReadClient` and
 * `BattleshipWriteClient` — never to viem directly. The real implementations
 * here bind the generated ABI to the deployment's contract address over the
 * viem public/wallet clients built by the wallet layer; tests substitute fakes
 * of the same interfaces.
 *
 * Write rules: every write simulates first (decoded custom errors surface
 * before the wallet opens), then submits, then waits for the receipt through
 * the shared transaction tracker (replacement / revert / drop handling,
 * GAME-511). Reads are authoritative; events only trigger refetches.
 */

import { encodeFunctionData, parseEventLogs } from 'viem'
import type { ErrorCode } from '../../copy/errors'
import { battleshipGameAbi } from '../abi/battleshipGame'
import type { DecryptProof, EncryptedFleetSegment } from '../fhenix/types'
import type { HexAddress } from '../phaseResolver'
import { decodeReadError, decodeTxError } from './decodeError'
import {
  toChainMatchView,
  toChainMoveView,
  toMatchPlayersView,
  toPendingPlacementValidationView,
  toPendingShotView,
  type ChainMatchView,
  type ChainMoveView,
  type ChainPendingShotView,
  type MatchPlayersView,
  type PendingPlacementValidationView,
  type RawMatchView,
  type RawMoveView,
  type RawPendingPlacementValidation,
  type RawPendingShotView,
  type RawPlayerPublicView,
} from './mapping'
import {
  trackTransaction,
  type Hash,
  type ReplacementInfo,
  type TxState,
} from './txTracker'

/** Identity of one observed contract event, for deduplication (GAME-509). */
export interface MatchEventRef {
  eventName: string
  blockHash: string | null
  logIndex: number | null
  transactionHash: string | null
}

export interface BattleshipReadClient {
  /** Authoritative match read; `null` when the match does not exist. */
  getMatch(matchId: bigint): Promise<ChainMatchView | null>
  /** Total matches the contract indexed for this player (creator or joiner). */
  getPlayerMatchCount?(player: HexAddress): Promise<number>
  /**
   * One page of the player's match ids, oldest first. The contract reverts
   * `InvalidPaginationLimit` on a zero limit or a limit above
   * MAX_PAGE_LIMIT (50); an offset at/past the end returns an empty page.
   */
  getPlayerMatches?(player: HexAddress, offset: number, limit: number): Promise<bigint[]>
  /** Number of open matches currently waiting for any opponent (lobby size). */
  getOpenMatchCount?(): Promise<number>
  /**
   * One page of open-match ids waiting for any opponent, for the matchmaking
   * lobby. Same pagination contract as `getPlayerMatches` (zero/over-cap limit
   * reverts `InvalidPaginationLimit`). The set is swap-pop maintained, so order
   * is not stable across joins — callers hydrate with `getMatch` and sort.
   */
  getOpenMatches?(offset: number, limit: number): Promise<bigint[]>
  /** Public placement/board state for both player slots. */
  getPlayers?(matchId: bigint): Promise<MatchPlayersView>
  /** Complete public move history, oldest first (GAME-708). */
  getMoveHistory?(matchId: bigint, moveCount: number): Promise<ChainMoveView[]>
  /** The match's unresolved shot, or `null` when none is pending (GAME-705). */
  getPendingShot?(matchId: bigint): Promise<ChainPendingShotView | null>
  /**
   * One player's unresolved placement validation, or `null` when none is
   * pending. Source of the `validityCtHash` for the proof-publish step.
   */
  getPendingPlacementValidation?(
    matchId: bigint,
    player: HexAddress,
  ): Promise<PendingPlacementValidationView | null>
  /**
   * Watch this match's contract events. The callback receives event identities
   * only — consumers must follow with authoritative reads. Returns unwatch.
   */
  watchMatch(matchId: bigint, onEvents: (events: MatchEventRef[]) => void): () => void
}

export type WriteResult =
  | { ok: true; hash: Hash }
  | { ok: false; error: ErrorCode }

export type CreateMatchResult =
  | { ok: true; hash: Hash; matchId: bigint }
  | { ok: false; error: ErrorCode }

export interface BattleshipWriteClient {
  createMatch(
    invitedOpponent: HexAddress,
    onState: (state: TxState) => void,
  ): Promise<CreateMatchResult>
  /**
   * Placement-first creation: create a friend match and submit the creator's
   * encrypted fleet in one transaction. The match stays WaitingForOpponent;
   * the creator's fleet validates asynchronously (GAME-505/506).
   */
  createWithFleet?(
    invitedOpponent: HexAddress,
    segments: readonly EncryptedFleetSegment[],
    onState: (state: TxState) => void,
  ): Promise<CreateMatchResult>
  /**
   * Create an open match that any player may join (random matchmaking). No
   * invited opponent; the match is listed in the public open-match lobby until
   * someone joins or the creator cancels.
   */
  createOpenMatch?(onState: (state: TxState) => void): Promise<CreateMatchResult>
  /**
   * Placement-first open creation: create an open match and submit the
   * creator's encrypted fleet in one transaction. Mirrors `createWithFleet`
   * with no invited opponent.
   */
  createOpenWithFleet?(
    segments: readonly EncryptedFleetSegment[],
    onState: (state: TxState) => void,
  ): Promise<CreateMatchResult>
  joinMatch(matchId: bigint, onState: (state: TxState) => void): Promise<WriteResult>
  /**
   * Placement-first join: join a match and submit the encrypted fleet in one
   * transaction. The match advances to ValidatingPlacement (GAME-507).
   */
  joinWithFleet?(
    matchId: bigint,
    segments: readonly EncryptedFleetSegment[],
    onState: (state: TxState) => void,
  ): Promise<WriteResult>
  cancelMatch(matchId: bigint, onState: (state: TxState) => void): Promise<WriteResult>
  forfeit(matchId: bigint, onState: (state: TxState) => void): Promise<WriteResult>
  submitFleet?(
    matchId: bigint,
    segments: readonly EncryptedFleetSegment[],
    onState: (state: TxState) => void,
  ): Promise<WriteResult>
  /**
   * Publish the client-fetched threshold-network decrypt proof and finalize
   * the player's placement validation. Permissionless; idempotent over an
   * already-published proof (`_publishIfNeeded` on the contract).
   */
  finalizeFleetValidationWithProof?(
    matchId: bigint,
    player: HexAddress,
    proof: DecryptProof,
    onState: (state: TxState) => void,
  ): Promise<WriteResult>
  attack?(
    matchId: bigint,
    cellIndex: number,
    onState: (state: TxState) => void,
  ): Promise<WriteResult>
  /**
   * Publish both decrypt proofs (shot result, sunk-ship id) and finalize the
   * pending shot. Permissionless, like fleet-validation finalization.
   */
  finalizeAttackWithProof?(
    matchId: bigint,
    moveId: number,
    result: DecryptProof,
    sunkShip: DecryptProof,
    onState: (state: TxState) => void,
  ): Promise<WriteResult>
  claimTimeoutWin?(matchId: bigint, onState: (state: TxState) => void): Promise<WriteResult>
}

/* ------------------------------------------------------------------------- *
 * Real implementations over viem clients.
 *
 * The structural types below are the exact subset of the viem clients the
 * implementation touches. Keeping them structural lets unit tests drive the
 * real code with plain fake objects.
 * ------------------------------------------------------------------------- */

interface ReceiptLike {
  status: 'success' | 'reverted'
  transactionHash: Hash
  logs: unknown[]
}

export interface PublicClientLike {
  readContract(params: {
    address: HexAddress
    abi: typeof battleshipGameAbi
    functionName: string
    args: readonly unknown[]
  }): Promise<unknown>
  simulateContract(params: {
    address: HexAddress
    abi: typeof battleshipGameAbi
    functionName: string
    args: readonly unknown[]
    account: HexAddress
  }): Promise<{ request: unknown }>
  waitForTransactionReceipt(params: {
    hash: Hash
    onReplaced?: (replacement: {
      reason: 'replaced' | 'repriced' | 'cancelled'
      transaction: { hash: Hash }
    }) => void
  }): Promise<ReceiptLike>
  watchContractEvent(params: {
    address: HexAddress
    abi: typeof battleshipGameAbi
    onLogs: (logs: unknown[]) => void
    onError?: (error: Error) => void
  }): () => void
  /**
   * Deployed bytecode lookup for stale-deployment detection (GAME-804).
   * Optional: viem public clients provide it; minimal fakes may omit it.
   */
  getCode?(params: { address: HexAddress }): Promise<string | undefined>
}

export interface WalletClientLike {
  writeContract(request: never): Promise<Hash>
}

/**
 * Sponsored (gasless) send for embedded-wallet sessions (EIP-7702). Receives a
 * fully-encoded contract call and returns the broadcast transaction hash. The
 * embedded wallet keeps the SAME address as the EOA the contract sees as
 * `msg.sender` and that CoFHE binds permits to, so sponsorship is transparent
 * to the contract and the encryption layer. Built from Privy's
 * `useSendTransaction({ sponsor: true })` in `PrivyWalletBridge`.
 */
export type SponsoredSend = (request: {
  to: HexAddress
  data: `0x${string}`
  value?: bigint
}) => Promise<Hash>

export interface BattleshipClientConfig {
  publicClient: PublicClientLike
  contractAddress: HexAddress
  deploymentId: string
}

export interface BattleshipWriteClientConfig extends BattleshipClientConfig {
  walletClient: WalletClientLike
  /** The active wallet address; every write is simulated and sent as it. */
  account: HexAddress
  /**
   * When present (embedded-wallet sessions), writes are sent gaslessly through
   * this sponsored sender instead of `walletClient.writeContract`. The
   * simulate-for-error-decoding step runs either way.
   */
  sponsoredSend?: SponsoredSend
}

interface WatchedLog {
  eventName?: string
  blockHash?: string | null
  logIndex?: number | null
  transactionHash?: string | null
  args?: { matchId?: bigint }
}

/** Mirrors the contract's MAX_PAGE_LIMIT for getMoveHistory pagination. */
const MOVE_PAGE_LIMIT = 50

export function createBattleshipReadClient(
  config: BattleshipClientConfig,
): BattleshipReadClient {
  const { publicClient, contractAddress, deploymentId } = config
  return {
    async getMatch(matchId) {
      try {
        const raw = await publicClient.readContract({
          address: contractAddress,
          abi: battleshipGameAbi,
          functionName: 'getMatch',
          args: [matchId],
        })
        return toChainMatchView(raw as RawMatchView, deploymentId)
      } catch (err) {
        if (decodeReadError(err) === 'match-not-found') return null
        throw err
      }
    },

    async getPlayerMatchCount(player) {
      const raw = await publicClient.readContract({
        address: contractAddress,
        abi: battleshipGameAbi,
        functionName: 'getPlayerMatchCount',
        args: [player],
      })
      return Number(raw as bigint)
    },

    async getPlayerMatches(player, offset, limit) {
      const raw = await publicClient.readContract({
        address: contractAddress,
        abi: battleshipGameAbi,
        functionName: 'getPlayerMatches',
        args: [player, offset, limit],
      })
      return [...(raw as readonly bigint[])]
    },

    async getOpenMatchCount() {
      const raw = await publicClient.readContract({
        address: contractAddress,
        abi: battleshipGameAbi,
        functionName: 'getOpenMatchCount',
        args: [],
      })
      return Number(raw as bigint)
    },

    async getOpenMatches(offset, limit) {
      const raw = await publicClient.readContract({
        address: contractAddress,
        abi: battleshipGameAbi,
        functionName: 'getOpenMatches',
        args: [offset, limit],
      })
      return [...(raw as readonly bigint[])]
    },

    async getPlayers(matchId) {
      const raw = await publicClient.readContract({
        address: contractAddress,
        abi: battleshipGameAbi,
        functionName: 'getPlayers',
        args: [matchId],
      })
      return toMatchPlayersView(
        raw as readonly [RawPlayerPublicView, RawPlayerPublicView],
      )
    },

    async getMoveHistory(matchId, moveCount) {
      const moves: ChainMoveView[] = []
      // The contract caps one page at MAX_PAGE_LIMIT (50); long matches read
      // sequential pages. moveCount comes from the authoritative getMatch read.
      for (let offset = 0; offset < moveCount; offset += MOVE_PAGE_LIMIT) {
        const raw = await publicClient.readContract({
          address: contractAddress,
          abi: battleshipGameAbi,
          functionName: 'getMoveHistory',
          args: [matchId, offset, MOVE_PAGE_LIMIT],
        })
        const page = (raw as RawMoveView[]).map(toChainMoveView)
        moves.push(...page)
        if (page.length < MOVE_PAGE_LIMIT) break
      }
      return moves
    },

    async getPendingShot(matchId) {
      const raw = await publicClient.readContract({
        address: contractAddress,
        abi: battleshipGameAbi,
        functionName: 'getPendingShot',
        args: [matchId],
      })
      return toPendingShotView(raw as RawPendingShotView)
    },

    async getPendingPlacementValidation(matchId, player) {
      const raw = await publicClient.readContract({
        address: contractAddress,
        abi: battleshipGameAbi,
        functionName: 'getPendingPlacementValidation',
        args: [matchId, player],
      })
      return toPendingPlacementValidationView(raw as RawPendingPlacementValidation)
    },

    watchMatch(matchId, onEvents) {
      return publicClient.watchContractEvent({
        address: contractAddress,
        abi: battleshipGameAbi,
        onLogs: (logs) => {
          const events: MatchEventRef[] = []
          for (const entry of logs as WatchedLog[]) {
            // Decoded logs carry the event args; only this match's events
            // trigger refetches. Logs without a matchId arg are ignored.
            if (entry.args?.matchId !== matchId) continue
            events.push({
              eventName: entry.eventName ?? 'unknown',
              blockHash: entry.blockHash ?? null,
              logIndex: entry.logIndex ?? null,
              transactionHash: entry.transactionHash ?? null,
            })
          }
          if (events.length > 0) onEvents(events)
        },
        onError: () => {
          // Watch failures are non-fatal: focus/reconnect refetches (GAME-510)
          // and manual retry keep the view recoverable without event delivery.
        },
      })
    },
  }
}

/** Extract the created match id from a confirmed `createMatch` receipt. */
export function extractCreatedMatchId(
  logs: unknown[],
  contractAddress: HexAddress,
): bigint | null {
  const parsed = parseEventLogs({
    abi: battleshipGameAbi,
    eventName: 'MatchCreated',
    logs: logs as never,
  })
  for (const log of parsed) {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue
    const matchId = (log.args as { matchId?: bigint }).matchId
    if (typeof matchId === 'bigint') return matchId
  }
  return null
}

export function createBattleshipWriteClient(
  config: BattleshipWriteClientConfig,
): BattleshipWriteClient {
  const { publicClient, walletClient, contractAddress, account, sponsoredSend } = config

  async function performWrite(
    functionName:
      | 'createMatch'
      | 'createWithFleet'
      | 'createOpenMatch'
      | 'createOpenWithFleet'
      | 'joinMatch'
      | 'joinWithFleet'
      | 'cancelMatch'
      | 'forfeit'
      | 'submitFleet'
      | 'finalizeFleetValidationWithProof'
      | 'attack'
      | 'finalizeAttackWithProof'
      | 'claimTimeoutWin',
    args: readonly unknown[],
    onState: (state: TxState) => void,
  ): Promise<{ ok: true; receipt: ReceiptLike } | { ok: false; error: ErrorCode }> {
    const outcome = await trackTransaction<ReceiptLike>({
      send: async () => {
        // Simulation decodes contract reverts into named errors before the
        // wallet prompt; the returned request is what the EOA path signs. It
        // runs as `account` (the EOA, unchanged under 7702), so the decode is
        // accurate for both the sponsored and the wallet-pays paths.
        const { request } = await publicClient.simulateContract({
          address: contractAddress,
          abi: battleshipGameAbi,
          functionName,
          args,
          account,
        })
        if (sponsoredSend) {
          // Embedded wallet: send gaslessly. simulate() returns no encoded
          // calldata, so re-encode the same call. All BattleshipGame writes are
          // non-payable, so no value is forwarded.
          const data = encodeFunctionData({
            abi: battleshipGameAbi,
            functionName: functionName as never,
            args: args as never,
          })
          return sponsoredSend({ to: contractAddress, data })
        }
        return walletClient.writeContract(request as never)
      },
      wait: (hash: Hash, onReplaced: (info: ReplacementInfo) => void) =>
        publicClient.waitForTransactionReceipt({
          hash,
          onReplaced: (replacement) =>
            onReplaced({ reason: replacement.reason, hash: replacement.transaction.hash }),
        }),
      onState,
    })
    if (!outcome.ok) {
      return { ok: false, error: outcome.state.error ?? 'unknown' }
    }
    return { ok: true, receipt: outcome.receipt }
  }

  return {
    async createMatch(invitedOpponent, onState) {
      const result = await performWrite('createMatch', [invitedOpponent], onState)
      if (!result.ok) return result
      const matchId = extractCreatedMatchId(result.receipt.logs, contractAddress)
      if (matchId === null) {
        // Confirmed receipt without a MatchCreated log should be impossible;
        // degrade to a recoverable error rather than navigating nowhere.
        return { ok: false, error: 'unknown' }
      }
      return { ok: true, hash: result.receipt.transactionHash, matchId }
    },

    async createWithFleet(invitedOpponent, segments, onState) {
      const result = await performWrite(
        'createWithFleet',
        [invitedOpponent, segments],
        onState,
      )
      if (!result.ok) return result
      const matchId = extractCreatedMatchId(result.receipt.logs, contractAddress)
      if (matchId === null) {
        return { ok: false, error: 'unknown' }
      }
      return { ok: true, hash: result.receipt.transactionHash, matchId }
    },

    async createOpenMatch(onState) {
      const result = await performWrite('createOpenMatch', [], onState)
      if (!result.ok) return result
      const matchId = extractCreatedMatchId(result.receipt.logs, contractAddress)
      if (matchId === null) {
        return { ok: false, error: 'unknown' }
      }
      return { ok: true, hash: result.receipt.transactionHash, matchId }
    },

    async createOpenWithFleet(segments, onState) {
      const result = await performWrite('createOpenWithFleet', [segments], onState)
      if (!result.ok) return result
      const matchId = extractCreatedMatchId(result.receipt.logs, contractAddress)
      if (matchId === null) {
        return { ok: false, error: 'unknown' }
      }
      return { ok: true, hash: result.receipt.transactionHash, matchId }
    },

    async joinMatch(matchId, onState) {
      const result = await performWrite('joinMatch', [matchId], onState)
      return result.ok ? { ok: true, hash: result.receipt.transactionHash } : result
    },

    async joinWithFleet(matchId, segments, onState) {
      const result = await performWrite('joinWithFleet', [matchId, segments], onState)
      return result.ok ? { ok: true, hash: result.receipt.transactionHash } : result
    },

    async cancelMatch(matchId, onState) {
      const result = await performWrite('cancelMatch', [matchId], onState)
      return result.ok ? { ok: true, hash: result.receipt.transactionHash } : result
    },

    async forfeit(matchId, onState) {
      const result = await performWrite('forfeit', [matchId], onState)
      return result.ok ? { ok: true, hash: result.receipt.transactionHash } : result
    },

    async submitFleet(matchId, segments, onState) {
      const result = await performWrite('submitFleet', [matchId, segments], onState)
      return result.ok ? { ok: true, hash: result.receipt.transactionHash } : result
    },

    async finalizeFleetValidationWithProof(matchId, player, proof, onState) {
      const result = await performWrite(
        'finalizeFleetValidationWithProof',
        [matchId, player, proof.value, proof.signature],
        onState,
      )
      return result.ok ? { ok: true, hash: result.receipt.transactionHash } : result
    },

    async attack(matchId, cellIndex, onState) {
      const result = await performWrite('attack', [matchId, cellIndex], onState)
      return result.ok ? { ok: true, hash: result.receipt.transactionHash } : result
    },

    async finalizeAttackWithProof(matchId, moveId, result, sunkShip, onState) {
      const outcome = await performWrite(
        'finalizeAttackWithProof',
        [matchId, moveId, result.value, result.signature, sunkShip.value, sunkShip.signature],
        onState,
      )
      return outcome.ok ? { ok: true, hash: outcome.receipt.transactionHash } : outcome
    },

    async claimTimeoutWin(matchId, onState) {
      const result = await performWrite('claimTimeoutWin', [matchId], onState)
      return result.ok ? { ok: true, hash: result.receipt.transactionHash } : result
    },
  }
}

/** Re-export for consumers that only import the client module. */
export { decodeTxError }
