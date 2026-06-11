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

import { parseEventLogs } from 'viem'
import type { ErrorCode } from '../../copy/errors'
import { battleshipGameAbi } from '../abi/battleshipGame'
import type { HexAddress } from '../phaseResolver'
import { decodeReadError, decodeTxError } from './decodeError'
import { toChainMatchView, type ChainMatchView, type RawMatchView } from './mapping'
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
  joinMatch(matchId: bigint, onState: (state: TxState) => void): Promise<WriteResult>
  cancelMatch(matchId: bigint, onState: (state: TxState) => void): Promise<WriteResult>
  forfeit(matchId: bigint, onState: (state: TxState) => void): Promise<WriteResult>
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
}

export interface WalletClientLike {
  writeContract(request: never): Promise<Hash>
}

export interface BattleshipClientConfig {
  publicClient: PublicClientLike
  contractAddress: HexAddress
  deploymentId: string
}

export interface BattleshipWriteClientConfig extends BattleshipClientConfig {
  walletClient: WalletClientLike
  /** The active wallet address; every write is simulated and sent as it. */
  account: HexAddress
}

interface WatchedLog {
  eventName?: string
  blockHash?: string | null
  logIndex?: number | null
  transactionHash?: string | null
  args?: { matchId?: bigint }
}

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
  const { publicClient, walletClient, contractAddress, account } = config

  async function performWrite(
    functionName: 'createMatch' | 'joinMatch' | 'cancelMatch' | 'forfeit',
    args: readonly unknown[],
    onState: (state: TxState) => void,
  ): Promise<{ ok: true; receipt: ReceiptLike } | { ok: false; error: ErrorCode }> {
    const outcome = await trackTransaction<ReceiptLike>({
      send: async () => {
        // Simulation decodes contract reverts into named errors before the
        // wallet prompt; the returned request is what the wallet signs.
        const { request } = await publicClient.simulateContract({
          address: contractAddress,
          abi: battleshipGameAbi,
          functionName,
          args,
          account,
        })
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

    async joinMatch(matchId, onState) {
      const result = await performWrite('joinMatch', [matchId], onState)
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
  }
}

/** Re-export for consumers that only import the client module. */
export { decodeTxError }
