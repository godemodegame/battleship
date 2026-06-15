/**
 * Placement-first join (GAME-507).
 *
 * The invited opponent arranges their fleet locally and then a single action
 * encrypts it and submits `joinWithFleet(matchId, segments)` — one transaction
 * that both joins the match and locks in the encrypted fleet, advancing the
 * match to ValidatingPlacement. Mirror of the creator's `createWithFleet` flow
 * so both sides are placement-first.
 *
 * Once joined, the match route's `EncryptedFleetPanel` takes over for the
 * validating / resubmit states.
 */

import { useEffect, useMemo } from 'react'
import {
  encryptedPlacementCopy,
  joinCopy,
  matchStateCopy,
  walletCopy,
} from '../../copy/en'
import { errorMessage } from '../../copy/errors'
import { isFleetComplete } from '../../game/board'
import type { BattleshipWriteClient } from '../client/battleshipClient'
import { isJoinExpired, type ChainMatchView } from '../client/mapping'
import { pendingTxScope } from '../client/pendingTxStore'
import { isTxBusy } from '../client/txTracker'
import { useTrackedWrite } from '../client/useTrackedWrite'
import { type CofheScope } from '../fhenix/types'
import type { WalletContextValue } from '../wallet/WalletSessionContext'
import { TxStatusLine } from '../match/TxStatusLine'
import { FleetPlacementBoard } from './FleetPlacementBoard'
import { useFleetSubmission } from './useFleetSubmission'
import {
  placementScopeKey,
  usePlacementStore,
  type PlacementScope,
} from './placementStore'

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export interface JoinWithFleetPanelProps {
  match: ChainMatchView
  writeClient: BattleshipWriteClient | null
  wallet: WalletContextValue
  /** Called after a confirmed join so the route refetches immediately. */
  onJoined: () => void
}

export function JoinWithFleetPanel({
  match,
  writeClient,
  wallet,
  onJoined,
}: JoinWithFleetPanelProps) {
  const placements = usePlacementStore((state) => state.placements)
  const bindScope = usePlacementStore((state) => state.bindScope)
  const clearFleet = usePlacementStore((state) => state.clearFleet)

  const address = wallet.session.address
  const chainId = wallet.session.chainId
  const placementScope = useMemo<PlacementScope | null>(
    () =>
      address && chainId
        ? {
            address,
            chainId,
            deploymentId: match.deploymentId,
            matchId: match.matchIdBig,
          }
        : null,
    [address, chainId, match.deploymentId, match.matchIdBig],
  )
  const placementKey = placementScope ? placementScopeKey(placementScope) : null
  const cofheScope = useMemo<CofheScope | null>(
    () =>
      address && chainId
        ? {
            address,
            chainId,
            deploymentId: match.deploymentId,
            matchId: match.matchIdBig,
          }
        : null,
    [address, chainId, match.deploymentId, match.matchIdBig],
  )

  useEffect(() => {
    bindScope(placementScope)
    return () => bindScope(null)
  }, [bindScope, placementKey])

  const tx = useTrackedWrite(
    address
      ? pendingTxScope({
          deploymentId: match.deploymentId,
          matchId: match.matchIdBig,
          address,
          kind: 'join',
        })
      : null,
  )

  const submission = useFleetSubmission({
    enabled: wallet.canWrite && Boolean(writeClient?.joinWithFleet),
    cofheScope,
    placementScope,
    publicClient: wallet.publicClient,
    walletClient: wallet.walletClient,
  })

  const expired = isJoinExpired(match, nowSeconds())
  const complete = isFleetComplete(placements)
  const placedCount = placements.filter(Boolean).length
  const busy = isTxBusy(tx.state) || submission.encrypting

  if (expired) {
    return (
      <div className="home-actions" data-testid="join-expired">
        <p className="status-label">{matchStateCopy.expiredTitle}</p>
        <p className="status-sub">{matchStateCopy.expiredJoinBody}</p>
      </div>
    )
  }

  async function onJoin() {
    if (!complete || !writeClient?.joinWithFleet || !wallet.canWrite || busy) return
    const encrypted = await submission.encrypt()
    if (!encrypted) return
    wallet.actions.prepareHandoff()
    const result = await tx.run((onState) =>
      writeClient.joinWithFleet!(match.matchIdBig, encrypted, onState),
    )
    if (result?.ok) {
      // GAME-607: clear the plaintext fleet once it is on-chain.
      clearFleet()
      onJoined()
    }
  }

  const isOpen = match.matchType === 'Open'
  return (
    <section className="onchain-placement panel" data-testid="join-panel">
      <p className="status-label">{isOpen ? joinCopy.openTitle : joinCopy.title}</p>
      <p className="status-sub">{isOpen ? joinCopy.openBody : joinCopy.invitedBody}</p>
      {match.creator && (
        <p className="footnote">
          {joinCopy.creatorLabel}: {walletCopy.shortAddress(match.creator)}
        </p>
      )}

      <div className="placement-heading">
        <div>
          <span className="status-label">{joinCopy.placementTitle}</span>
          <p className="status-sub">
            {placedCount}/10 placed · {joinCopy.placementHelper}
          </p>
        </div>
      </div>

      <FleetPlacementBoard busy={busy} />

      {submission.cofhe.status === 'initializing' && (
        <p className="status-sub" data-testid="cofhe-initializing">
          {encryptedPlacementCopy.preparing}
        </p>
      )}
      {submission.cofhe.status === 'error' && (
        <p className="error-note" role="alert">
          {errorMessage('encryption-failed')}
        </p>
      )}
      {submission.encrypting && (
        <p className="status-sub" data-testid="encryption-progress">
          {encryptedPlacementCopy.encrypting}:{' '}
          {encryptedPlacementCopy.progress[submission.progress]}
        </p>
      )}
      {submission.error && (
        <p className="error-note" role="alert" data-testid="encryption-error">
          {errorMessage(submission.error)}
        </p>
      )}
      {!complete && (
        <p className="footnote" data-testid="placement-incomplete">
          {joinCopy.placementIncomplete}
        </p>
      )}

      <button
        className="btn primary wide"
        data-ic="check"
        data-testid="join-match"
        disabled={
          busy ||
          !complete ||
          !wallet.canWrite ||
          submission.cofhe.status !== 'ready' ||
          !writeClient?.joinWithFleet
        }
        onClick={() => void onJoin()}
      >
        {busy ? joinCopy.submittingFleet : joinCopy.joinAndSubmit}
      </button>
      <TxStatusLine state={tx.state} onRetry={tx.reset} />
    </section>
  )
}
