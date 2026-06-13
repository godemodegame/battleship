/**
 * Open-match lobby query ("Find a game").
 *
 * Random matchmaking is fully on-chain: a player hosts an open match
 * (createOpenMatch / createOpenWithFleet) and the contract lists it in a
 * swap-pop `openMatchIds` set until someone joins or the host cancels. This
 * hook pages that set through `getOpenMatchCount` + `getOpenMatches` and
 * hydrates each id with the authoritative `getMatch`, then partitions the
 * result for the connected viewer:
 *   - `entries`  — joinable open matches hosted by OTHER players, newest first;
 *   - `mine`     — the viewer's own still-open matches (host / cancel surface).
 *
 * Unlike `useMatchList`, the open set SHRINKS as matches are joined or
 * cancelled, so there is no stable append-only offset to reuse: every load
 * re-reads from the front. A defensive post-hydration filter drops any id that
 * was just taken or expired in the read/refetch gap, so a stale index entry
 * never surfaces as a joinable lobby card. Refetch triggers mirror
 * useMatchList (focus / online / visibility) and account/chain changes reset
 * the query.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ErrorCode } from '../copy/errors'
import { decodeReadError } from './client/decodeError'
import type { BattleshipReadClient } from './client/battleshipClient'
import { isJoinExpired, type ChainMatchView } from './client/mapping'
import type { HexAddress } from './phaseResolver'
import { useRefetchOnFocus } from './useRefetchOnFocus'

/** Mirrors the contract's MAX_PAGE_LIMIT for getOpenMatches pagination. */
const ID_PAGE_LIMIT = 50

/**
 * Upper bound on how many open matches the lobby hydrates per load. The open
 * set is naturally small (one entry per waiting host), but capping bounds the
 * work if the lobby is ever flooded; anything beyond is simply not shown.
 */
const MAX_LOBBY_WINDOW = 100

/** One lobby entry: the chain view plus the viewer-relative derivation. */
export interface OpenMatchEntry {
  match: ChainMatchView
  /** True when the connected viewer hosts this open match (cannot join own). */
  isOwn: boolean
}

export type OpenMatchListStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface OpenMatchListQuery {
  status: OpenMatchListStatus
  /** Joinable open matches hosted by other players, newest first. */
  entries: OpenMatchEntry[]
  /** The viewer's own still-open matches (host / cancel), newest first. */
  mine: OpenMatchEntry[]
  /** Total open matches the contract currently indexes. */
  totalCount: number
  /** True when open matches exist beyond the hydrated window. */
  hasMore: boolean
  /** True when some ids in the window failed to hydrate this load. */
  partial: boolean
  error: ErrorCode | null
  refetch: () => void
}

export interface UseOpenMatchesParams {
  readClient: BattleshipReadClient | null
  /** The connected viewer; null disables the query. */
  address: HexAddress | null
  /** Account-scoped reset key (GAME-208/510). */
  accountEpoch: number
  /** Active wallet chain id; a chain change re-reads the lobby (GAME-510). */
  chainId: number | null
  /** Injected clock (seconds) for deterministic expiry filtering in tests. */
  nowSeconds?: () => number
}

/** Read open-match ids for [0, to) in contract-capped pages. */
async function readOpenIds(
  client: BattleshipReadClient,
  to: number,
): Promise<bigint[]> {
  const ids: bigint[] = []
  for (let offset = 0; offset < to; offset += ID_PAGE_LIMIT) {
    const limit = Math.min(ID_PAGE_LIMIT, to - offset)
    const page = await client.getOpenMatches!(offset, limit)
    ids.push(...page)
    if (page.length < limit) break
  }
  return ids
}

export function useOpenMatches(params: UseOpenMatchesParams): OpenMatchListQuery {
  const { readClient, address, accountEpoch, chainId } = params
  const nowSeconds = params.nowSeconds ?? (() => Math.floor(Date.now() / 1000))

  const [status, setStatus] = useState<OpenMatchListStatus>('idle')
  const [entries, setEntries] = useState<OpenMatchEntry[]>([])
  const [mine, setMine] = useState<OpenMatchEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [partial, setPartial] = useState(false)
  const [error, setError] = useState<ErrorCode | null>(null)

  // Monotonic sequence: only the latest in-flight load may publish state.
  const seqRef = useRef(0)

  const enumerable =
    readClient !== null &&
    address !== null &&
    typeof readClient.getOpenMatchCount === 'function' &&
    typeof readClient.getOpenMatches === 'function'

  const load = useCallback(
    async (showLoading: boolean) => {
      if (!enumerable) {
        // Invalidate any in-flight enabled load so a slow read for the previous
        // wallet cannot publish after disconnect (mirrors useMatchList).
        seqRef.current += 1
        setStatus('idle')
        setEntries([])
        setMine([])
        setTotalCount(0)
        setHasMore(false)
        setPartial(false)
        setError(null)
        return
      }
      const client = readClient!
      const viewer = address!.toLowerCase()
      const seq = ++seqRef.current
      if (showLoading) setStatus('loading')
      try {
        const count = await client.getOpenMatchCount!()
        if (seq !== seqRef.current) return

        const window = Math.min(count, MAX_LOBBY_WINDOW)
        const joinable: OpenMatchEntry[] = []
        const own: OpenMatchEntry[] = []
        let sawFailure = false
        if (window > 0) {
          const ids = await readOpenIds(client, window)
          const settled = await Promise.allSettled(ids.map((id) => client.getMatch(id)))
          if (seq !== seqRef.current) return
          const now = nowSeconds()
          for (const result of settled) {
            if (result.status === 'rejected') {
              // A failed hydration read leaves the window incomplete.
              sawFailure = true
              continue
            }
            const match = result.value
            // A fulfilled null resolved cleanly to "no such match" — drop it.
            if (match === null) continue
            const isOwn = match.creator === viewer
            if (isOwn) {
              // Only the viewer's still-open matches belong in the host list.
              if (match.status === 'WaitingForOpponent' && match.opponent === null) {
                own.push({ match, isOwn })
              }
              continue
            }
            // Defensive: drop any id taken or expired in the read/refetch gap.
            if (
              match.status !== 'WaitingForOpponent' ||
              match.opponent !== null ||
              isJoinExpired(match, now)
            ) {
              continue
            }
            joinable.push({ match, isOwn })
          }
          // Display newest first; the contract index is roughly insertion order.
          joinable.sort((a, b) => b.match.createdAt - a.match.createdAt)
          own.sort((a, b) => b.match.createdAt - a.match.createdAt)
        }
        setEntries(joinable)
        setMine(own)
        setTotalCount(count)
        setHasMore(count > window)
        setPartial(sawFailure)
        setError(null)
        setStatus('ready')
      } catch (err) {
        if (seq !== seqRef.current) return
        setError(decodeReadError(err))
        setStatus('error')
      }
    },
    [enumerable, readClient, address],
  )

  /** Background refetch: keeps the last good lobby while re-reading. */
  const refetch = useCallback(() => {
    void load(false)
  }, [load])

  // Initial load + full reset on client, account, or chain change.
  useEffect(() => {
    void load(true)
  }, [load, accountEpoch, chainId])

  useRefetchOnFocus(refetch, enumerable)

  return {
    status,
    entries,
    mine,
    totalCount,
    hasMore,
    partial,
    error,
    refetch,
  }
}
