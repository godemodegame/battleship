/**
 * Wallet-scoped match list query ("My Battles").
 *
 * Enumerates every match the contract indexed for the connected address —
 * the on-chain `playerMatchIds` mapping is appended at `createMatch` (creator)
 * and `joinMatch` (opponent), so both roles are covered. Ids are read through
 * the paginated `getPlayerMatches` view (oldest first, page cap 50) and
 * hydrated with authoritative `getMatch` reads, newest first for display.
 *
 * The index is append-only, so window offsets are stable: the hook tracks the
 * start of the loaded range and every (re)load re-reads the whole range —
 * count growth, status changes, and "load older" all resolve to fresh reads,
 * never to client-side merges. Refetch triggers mirror useMatchView (focus /
 * online / visibility, GAME-510) and account/chain changes reset the range
 * (GAME-208).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ErrorCode } from '../copy/errors'
import { decodeReadError } from './client/decodeError'
import type { BattleshipReadClient } from './client/battleshipClient'
import type { ChainMatchView } from './client/mapping'
import type { HexAddress, MatchStatus } from './phaseResolver'
import { useRefetchOnFocus } from './useRefetchOnFocus'

/** Mirrors the contract's MAX_PAGE_LIMIT for getPlayerMatches pagination. */
const ID_PAGE_LIMIT = 50

const DEFAULT_PAGE_SIZE = 20

export type MatchListBucket = 'waiting' | 'active' | 'finished'

/** Contract `MatchStatus` → the three user-facing list sections. */
export function matchListBucket(status: MatchStatus): MatchListBucket {
  switch (status) {
    case 'WaitingForOpponent':
      return 'waiting'
    case 'Finished':
    case 'Cancelled':
    case 'Forfeited':
      return 'finished'
    default:
      return 'active'
  }
}

/** One list entry: the chain view plus the viewer-relative derivations. */
export interface MatchListEntry {
  match: ChainMatchView
  bucket: MatchListBucket
  /** True when the viewer created the match (else they joined it). */
  isCreator: boolean
  /** The other player from the viewer's perspective, when known. */
  opponent: HexAddress | null
  /** Win/loss from the viewer's perspective; null while unfinished or no winner. */
  won: boolean | null
}

export function toMatchListEntry(
  match: ChainMatchView,
  viewer: HexAddress,
): MatchListEntry {
  const self = viewer.toLowerCase()
  const isCreator = match.creator === self
  const opponent = isCreator
    ? (match.opponent ?? match.invitedOpponent)
    : match.creator
  const bucket = matchListBucket(match.status)
  const won =
    bucket === 'finished' && match.winner !== null ? match.winner === self : null
  return { match, bucket, isCreator, opponent, won }
}

export type MatchListStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface MatchListQuery {
  status: MatchListStatus
  /** Hydrated entries, newest first. */
  entries: MatchListEntry[]
  /** Total matches the contract indexed for this address. */
  totalCount: number
  /** True when older matches exist beyond the loaded window. */
  hasMore: boolean
  /** True when some ids in the window failed to hydrate this load. */
  partial: boolean
  error: ErrorCode | null
  loadingMore: boolean
  loadMore: () => void
  refetch: () => void
}

export interface UseMatchListParams {
  readClient: BattleshipReadClient | null
  /** The connected viewer; null disables the query. */
  address: HexAddress | null
  /** Account-scoped reset key (GAME-208/510). */
  accountEpoch: number
  /** Active wallet chain id; a chain change re-reads the list (GAME-510). */
  chainId: number | null
  pageSize?: number
}

/** Read ids for [from, to) in contract-capped pages, oldest first. */
async function readIdRange(
  client: BattleshipReadClient,
  address: HexAddress,
  from: number,
  to: number,
): Promise<bigint[]> {
  const ids: bigint[] = []
  for (let offset = from; offset < to; offset += ID_PAGE_LIMIT) {
    const limit = Math.min(ID_PAGE_LIMIT, to - offset)
    const page = await client.getPlayerMatches!(address, offset, limit)
    ids.push(...page)
    if (page.length < limit) break
  }
  return ids
}

export function useMatchList(params: UseMatchListParams): MatchListQuery {
  const { readClient, address, accountEpoch, chainId } = params
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE

  const [status, setStatus] = useState<MatchListStatus>('idle')
  const [entries, setEntries] = useState<MatchListEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [partial, setPartial] = useState(false)
  const [error, setError] = useState<ErrorCode | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // Monotonic sequence: only the latest in-flight load may publish state.
  const seqRef = useRef(0)
  // Start of the loaded window in the contract's oldest-first id array;
  // null until the first load decides it from the live count.
  const frontRef = useRef<number | null>(null)

  const enumerable =
    readClient !== null &&
    address !== null &&
    typeof readClient.getPlayerMatchCount === 'function' &&
    typeof readClient.getPlayerMatches === 'function'

  const load = useCallback(
    async (showLoading: boolean) => {
      if (!enumerable) {
        // Invalidate any in-flight enabled load: without the bump a slow read
        // started for the previous wallet would pass the seq guards and
        // publish that wallet's list after disconnect (cross-account leak).
        seqRef.current += 1
        frontRef.current = null
        setStatus('idle')
        setEntries([])
        setTotalCount(0)
        setHasMore(false)
        setPartial(false)
        setError(null)
        setLoadingMore(false)
        return
      }
      const client = readClient!
      const viewer = address!
      const seq = ++seqRef.current
      if (showLoading) setStatus('loading')
      try {
        const count = await client.getPlayerMatchCount!(viewer)
        if (seq !== seqRef.current) return
        const newestFront = Math.max(0, count - pageSize)
        // First load anchors the window to the newest page; refetches keep an
        // already-extended window (append-only index → offsets stay valid).
        const front =
          frontRef.current === null ? newestFront : Math.min(frontRef.current, newestFront)
        frontRef.current = front

        const loaded: MatchListEntry[] = []
        let sawFailure = false
        if (count > 0) {
          const ids = await readIdRange(client, viewer, front, count)
          const settled = await Promise.allSettled(ids.map((id) => client.getMatch(id)))
          if (seq !== seqRef.current) return
          for (const result of settled) {
            if (result.status === 'rejected') {
              // A failed hydration read leaves the window incomplete.
              sawFailure = true
            } else if (result.value !== null) {
              loaded.push(toMatchListEntry(result.value, viewer))
            }
            // A fulfilled null is dropped silently: the id resolved cleanly to
            // "no such match", which is not a load failure.
          }
          // Display newest first; the contract returns oldest first.
          loaded.reverse()
        }
        setEntries(loaded)
        setTotalCount(count)
        setHasMore(front > 0)
        setPartial(sawFailure)
        setError(null)
        setStatus('ready')
        setLoadingMore(false)
      } catch (err) {
        if (seq !== seqRef.current) return
        setError(decodeReadError(err))
        setStatus('error')
        setLoadingMore(false)
      }
    },
    [enumerable, readClient, address, pageSize],
  )

  /** Background refetch: keeps the last good list while re-reading. */
  const refetch = useCallback(() => {
    void load(false)
  }, [load])

  // loadingMore clears only when a load publishes (ready/error/idle): a
  // superseding refetch reads the already-extended window, so its publish —
  // not the superseded promise — is when the extra page actually lands.
  const loadMore = useCallback(() => {
    if (frontRef.current === null || frontRef.current === 0) return
    frontRef.current = Math.max(0, frontRef.current - pageSize)
    setLoadingMore(true)
    void load(false)
  }, [load, pageSize])

  // Initial load + full reset on client, account, or chain change.
  useEffect(() => {
    frontRef.current = null
    setEntries([])
    void load(true)
  }, [load, accountEpoch, chainId])

  useRefetchOnFocus(refetch, enumerable)

  return {
    status,
    entries,
    totalCount,
    hasMore,
    partial,
    error,
    loadingMore,
    loadMore,
    refetch,
  }
}
