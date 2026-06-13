/**
 * Shared encrypt-then-submit plumbing for on-chain fleet placement.
 *
 * Owns the CoFHE session (via `useCofheMatchClient`), the encryption progress /
 * error state, and the scope-stability guard that aborts if the account, chain,
 * or match changed mid-encryption (GAME-607). It deliberately does NOT run the
 * contract write: callers wrap the returned ciphertext in their own tracked
 * write so each entrypoint keeps its own recovery scope and after-success
 * behaviour:
 *  - `EncryptedFleetPanel` → `submitFleet`
 *  - `CreateFriendMatchScreen` → `createWithFleet`
 *  - the placement-first join flow → `joinWithFleet`
 *
 * The plaintext fleet is read from `usePlacementStore` at encrypt time and the
 * ciphertext is handed straight back to the caller; neither is retained here.
 */

import { useState } from 'react'
import { perf } from '../../lib/perf'
import type { ErrorCode } from '../../copy/errors'
import type { PublicClientLike, WalletClientLike } from '../client/battleshipClient'
import {
  cofheScopeKey,
  type CofheProgress,
  type CofheScope,
  type EncryptedFleetSegment,
} from '../fhenix/types'
import { useCofheMatchClient, type CofheClientState } from '../fhenix/useCofheMatchClient'
import { encodeFleetSegments } from './fleetEncoding'
import {
  completedFleet,
  placementScopeKey,
  usePlacementStore,
  type PlacementScope,
} from './placementStore'

export interface UseFleetSubmissionParams {
  /** Initialize the CoFHE session (wallet connected, correct chain, ready). */
  enabled: boolean
  cofheScope: CofheScope | null
  placementScope: PlacementScope | null
  publicClient: PublicClientLike | null
  walletClient: WalletClientLike | null
}

export interface UseFleetSubmissionResult {
  cofhe: CofheClientState
  encrypting: boolean
  progress: CofheProgress
  error: ErrorCode | null
  resetError: () => void
  /**
   * Encrypt the locally-completed fleet and return the ciphertext segments, or
   * `null` if the fleet is incomplete, the session is not ready, encryption
   * fails, or the scope drifted mid-encryption. On failure `error` is set.
   */
  encrypt: () => Promise<readonly EncryptedFleetSegment[] | null>
}

export function useFleetSubmission(
  params: UseFleetSubmissionParams,
): UseFleetSubmissionResult {
  const { enabled, cofheScope, placementScope, publicClient, walletClient } = params
  const cofhe = useCofheMatchClient({
    enabled,
    scope: cofheScope,
    publicClient,
    walletClient,
  })
  const [encrypting, setEncrypting] = useState(false)
  const [progress, setProgress] = useState<CofheProgress>('initializing')
  const [error, setError] = useState<ErrorCode | null>(null)

  const expectedCofheKey = cofheScope ? cofheScopeKey(cofheScope) : null
  const placementKey = placementScope ? placementScopeKey(placementScope) : null

  async function encrypt(): Promise<readonly EncryptedFleetSegment[] | null> {
    const fleet = completedFleet(usePlacementStore.getState())
    if (!fleet || !cofhe.client || !placementKey || !expectedCofheKey) {
      return null
    }
    setError(null)
    setProgress('initializing')
    setEncrypting(true)
    // GAME-809: encryption duration, recorded locally only (no payload data).
    const stopEncryptTimer = perf.start('encrypt-fleet')
    try {
      const encrypted = await cofhe.client.encryptFleet(
        encodeFleetSegments(fleet),
        setProgress,
      )
      stopEncryptTimer()
      // A mid-flight account / chain / match switch must never let a stale
      // ciphertext reach the contract under a new scope.
      if (
        usePlacementStore.getState().scopeKey !== placementKey ||
        cofhe.client.scopeKey !== expectedCofheKey
      ) {
        throw new Error('Placement scope changed during encryption')
      }
      return encrypted
    } catch {
      setError('encryption-failed')
      return null
    } finally {
      setEncrypting(false)
    }
  }

  return {
    cofhe,
    encrypting,
    progress,
    error,
    resetError: () => setError(null),
    encrypt,
  }
}
