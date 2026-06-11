/**
 * Live match view query (GAME-503 / GAME-509 / GAME-510).
 *
 * Loads the authoritative `getMatch` read for one match and keeps it fresh:
 * - contract events for this match trigger targeted refetches (deduplicated
 *   by block hash + log index; events never mutate state directly);
 * - window focus, visibility return, and reconnect trigger refetches;
 * - account changes (epoch) and chain changes re-run the initial load.
 *
 * Reads are the single source of truth; a stale or duplicate event can only
 * cause a redundant read, never a wrong state.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ErrorCode } from '../copy/errors'
import type { BattleshipReadClient, MatchEventRef } from './client/battleshipClient'
import { decodeReadError } from './client/decodeError'
import type { ChainMatchView } from './client/mapping'

export type MatchViewStatus =
  /** No read client or no parseable match id — nothing to query. */
  | 'idle'
  | 'loading'
  | 'ready'
  | 'not-found'
  | 'error'

export interface MatchViewQuery {
  status: MatchViewStatus
  match: ChainMatchView | null
  error: ErrorCode | null
  refetch: () => void
}

export interface UseMatchViewParams {
  readClient: BattleshipReadClient | null
  matchId: bigint | null
  /** Account-scoped reset key (GAME-208/510). */
  accountEpoch: number
  /** Active wallet chain id; a chain change re-reads match state (GAME-510). */
  chainId: number | null
}

function eventKey(event: MatchEventRef): string {
  return `${event.blockHash ?? 'pending'}:${event.logIndex ?? -1}:${event.transactionHash ?? ''}`
}

export function useMatchView(params: UseMatchViewParams): MatchViewQuery {
  const { readClient, matchId, accountEpoch, chainId } = params

  const [status, setStatus] = useState<MatchViewStatus>('idle')
  const [match, setMatch] = useState<ChainMatchView | null>(null)
  const [error, setError] = useState<ErrorCode | null>(null)

  // Monotonic sequence: only the latest in-flight read may publish state.
  const seqRef = useRef(0)
  const seenEventsRef = useRef<Set<string>>(new Set())

  const load = useCallback(
    async (showLoading: boolean) => {
      if (!readClient || matchId === null) {
        setStatus('idle')
        setMatch(null)
        setError(null)
        return
      }
      const seq = ++seqRef.current
      if (showLoading) setStatus('loading')
      try {
        const view = await readClient.getMatch(matchId)
        if (seq !== seqRef.current) return
        if (view === null) {
          setMatch(null)
          setError(null)
          setStatus('not-found')
        } else {
          setMatch(view)
          setError(null)
          setStatus('ready')
        }
      } catch (err) {
        if (seq !== seqRef.current) return
        setError(decodeReadError(err))
        setStatus('error')
      }
    },
    [readClient, matchId],
  )

  /** Background refetch: keeps the last good view while re-reading. */
  const refetch = useCallback(() => {
    void load(false)
  }, [load])

  // Initial load + reload on client, match, account, or chain change.
  useEffect(() => {
    seenEventsRef.current = new Set()
    void load(true)
  }, [load, accountEpoch, chainId])

  // GAME-509: event-triggered targeted refetches, deduplicated by log identity.
  useEffect(() => {
    if (!readClient || matchId === null) return
    const unwatch = readClient.watchMatch(matchId, (events) => {
      const seen = seenEventsRef.current
      let fresh = false
      for (const event of events) {
        const key = eventKey(event)
        if (seen.has(key)) continue
        seen.add(key)
        fresh = true
      }
      if (fresh) refetch()
    })
    return unwatch
  }, [readClient, matchId, refetch])

  // GAME-510: refetch when the tab regains focus/visibility or comes back online.
  useEffect(() => {
    if (!readClient || matchId === null) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch()
    }
    window.addEventListener('focus', refetch)
    window.addEventListener('online', refetch)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refetch)
      window.removeEventListener('online', refetch)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [readClient, matchId, refetch])

  return { status, match, error, refetch }
}
