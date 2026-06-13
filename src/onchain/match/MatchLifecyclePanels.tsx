/**
 * Match lifecycle panels for the friend-match route (GAME-507 / GAME-508 / GAME-512).
 *
 * Presentational pieces composed by `MatchRouteShell` once authoritative match
 * data exists:
 * - `JoinPanel` — invited wallet's join action with deadline awareness;
 * - `InviteWaitingPanel` — creator's invite link, share, and cancel actions;
 * - `MatchIdentityPanel` — contract explorer link.
 *
 * All data arrives as props (public contract-derived values only), so every
 * panel is testable without a network.
 */

import { useState } from 'react'
import {
  explorerCopy,
  inviteCopy,
  joinCopy,
  matchStateCopy,
  walletCopy,
} from '../../copy/en'
import type { BattleshipWriteClient } from '../client/battleshipClient'
import { isJoinExpired, type ChainMatchView } from '../client/mapping'
import { pendingTxScope } from '../client/pendingTxStore'
import { isTxBusy } from '../client/txTracker'
import { useTrackedWrite } from '../client/useTrackedWrite'
import { explorerAddressUrl } from '../explorer'
import { buildInviteLink } from '../inviteLink'
import { useWalletSession } from '../wallet/WalletSessionContext'
import { TxStatusLine } from './TxStatusLine'

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/** Suspension-recovery scope for one lifecycle write on this match (GAME-802). */
function useLifecycleTxScope(match: ChainMatchView, kind: string): string | null {
  const { session } = useWalletSession()
  return session.address
    ? pendingTxScope({
        deploymentId: match.deploymentId,
        matchId: match.matchIdBig,
        address: session.address,
        kind,
      })
    : null
}

export interface JoinPanelProps {
  match: ChainMatchView
  writeClient: BattleshipWriteClient | null
  canWrite: boolean
  /** Called after a confirmed join so the route refetches immediately. */
  onJoined: () => void
  prepareHandoff: () => void
}

/** Invited wallet's view of a waiting match (GAME-507). */
export function JoinPanel({ match, writeClient, canWrite, onJoined, prepareHandoff }: JoinPanelProps) {
  const tx = useTrackedWrite(useLifecycleTxScope(match, 'join'))
  const busy = isTxBusy(tx.state)
  const expired = isJoinExpired(match, nowSeconds())

  if (expired) {
    return (
      <div className="home-actions" data-testid="join-expired">
        <p className="status-label">{matchStateCopy.expiredTitle}</p>
        <p className="status-sub">{matchStateCopy.expiredJoinBody}</p>
      </div>
    )
  }

  async function onJoin() {
    if (!writeClient || !canWrite || busy) return
    prepareHandoff()
    const result = await tx.run((onState) => writeClient.joinMatch(match.matchIdBig, onState))
    if (result?.ok) onJoined()
  }

  return (
    <div className="home-actions" data-testid="join-panel">
      <p className="status-label">{joinCopy.title}</p>
      <p className="status-sub">{joinCopy.invitedBody}</p>
      {match.creator && (
        <p className="footnote">
          {joinCopy.creatorLabel}: {walletCopy.shortAddress(match.creator)}
        </p>
      )}
      <button
        className="btn primary"
        data-ic="check"
        data-testid="join-match"
        disabled={busy || !canWrite || !writeClient}
        onClick={onJoin}
      >
        {busy ? joinCopy.joining : joinCopy.join}
      </button>
      <TxStatusLine state={tx.state} onRetry={tx.reset} />
    </div>
  )
}

export interface InviteWaitingPanelProps {
  match: ChainMatchView
  writeClient: BattleshipWriteClient | null
  canWrite: boolean
  /** Called after a confirmed cancel so the route refetches immediately. */
  onCancelled: () => void
  prepareHandoff: () => void
}

/** Creator's waiting-room: invite link + cancel (GAME-506 / GAME-508). */
export function InviteWaitingPanel({
  match,
  writeClient,
  canWrite,
  onCancelled,
  prepareHandoff,
}: InviteWaitingPanelProps) {
  const tx = useTrackedWrite(useLifecycleTxScope(match, 'cancel'))
  const busy = isTxBusy(tx.state)
  const [copyNote, setCopyNote] = useState<string | null>(null)
  const expired = isJoinExpired(match, nowSeconds())
  const link = buildInviteLink(match.deploymentId, match.matchId)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopyNote(inviteCopy.copied)
    } catch {
      setCopyNote(inviteCopy.copyFailed)
    }
  }

  async function onShare() {
    prepareHandoff()
    try {
      await navigator.share({ url: link })
    } catch {
      // Share sheet dismissed — nothing to recover.
    }
  }

  async function onCancel() {
    if (!writeClient || !canWrite || busy) return
    prepareHandoff()
    const result = await tx.run((onState) => writeClient.cancelMatch(match.matchIdBig, onState))
    if (result?.ok) onCancelled()
  }

  return (
    <div className="home-actions" data-testid="invite-panel">
      {expired ? (
        <>
          <p className="status-label" data-testid="invite-expired">
            {matchStateCopy.expiredTitle}
          </p>
          <p className="status-sub">{matchStateCopy.expiredBody}</p>
        </>
      ) : match.matchType === 'Open' ? (
        <>
          <p className="status-label">{inviteCopy.openWaitingTitle}</p>
          <p className="status-sub">{inviteCopy.openWaitingBody}</p>
        </>
      ) : (
        <>
          <p className="status-label">{inviteCopy.waitingTitle}</p>
          <p className="status-sub">{inviteCopy.waitingBody}</p>
        </>
      )}

      {match.invitedOpponent && (
        <p className="footnote">
          {inviteCopy.invitedLabel}: {walletCopy.shortAddress(match.invitedOpponent)}
        </p>
      )}

      {!expired && (
        <>
          <p className="invite-link" data-testid="invite-link" title={link}>
            {link}
          </p>
          <div className="button-row">
            <button className="btn" data-testid="copy-invite" onClick={onCopy}>
              {inviteCopy.copy}
            </button>
            {canShare && (
              <button className="btn" data-testid="share-invite" onClick={onShare}>
                {inviteCopy.share}
              </button>
            )}
          </div>
          {copyNote && (
            <p className="footnote" data-testid="copy-note" role="status">
              {copyNote}
            </p>
          )}
        </>
      )}

      <button
        className="btn danger"
        data-testid="cancel-match"
        disabled={busy || !canWrite || !writeClient}
        onClick={onCancel}
      >
        {busy ? inviteCopy.cancelling : inviteCopy.cancelMatch}
      </button>
      <TxStatusLine state={tx.state} onRetry={tx.reset} />
    </div>
  )
}

export interface MatchIdentityPanelProps {
  contractAddress: string | null
}

/** Explorer link for the match contract (GAME-512); identity text lives in
 * the route header tagline, so it is not repeated here. */
export function MatchIdentityPanel({ contractAddress }: MatchIdentityPanelProps) {
  return (
    <div className="match-identity" data-testid="match-identity">
      {contractAddress && (
        <a
          className="footnote explorer-link"
          data-testid="contract-explorer-link"
          href={explorerAddressUrl(contractAddress)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {explorerCopy.viewContract}
        </a>
      )}
    </div>
  )
}
