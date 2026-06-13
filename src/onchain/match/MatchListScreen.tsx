/**
 * "My Battles" — every match the contract indexed for the connected wallet.
 *
 * Grouped into the three lifecycle sections (waiting for opponent / in
 * progress / finished) from the same authoritative reads the match route
 * uses; each card links into the versioned match route. Wallet/network/
 * deployment gating mirrors CreateFriendMatchScreen.
 */

import { Link } from 'react-router-dom'
import {
  deploymentCopy,
  matchListCopy,
  phaseCopy,
  walletCopy,
} from '../../copy/en'
import { errorMessage } from '../../copy/errors'
import { useBattleshipClients } from '../client/useBattleshipClients'
import type { ChainMatchView } from '../client/mapping'
import { getActiveDeploymentId } from '../deployments'
import { inviteLinkPath } from '../inviteLink'
import { useMatchList, type MatchListBucket, type MatchListEntry } from '../useMatchList'
import { useWalletSession } from '../wallet/WalletSessionContext'
import { WalletSessionBar } from '../wallet/WalletSessionBar'
import { WrongNetworkPanel } from '../wallet/WrongNetworkPanel'

const SECTIONS: ReadonlyArray<{ bucket: MatchListBucket; heading: string }> = [
  { bucket: 'waiting', heading: matchListCopy.sectionWaiting },
  { bucket: 'active', heading: matchListCopy.sectionActive },
  { bucket: 'finished', heading: matchListCopy.sectionFinished },
]

/** Status line for one card, viewer-relative where the phase copy is. */
function entryStatusLabel(entry: MatchListEntry): string {
  const { match, won } = entry
  switch (match.status) {
    case 'WaitingForOpponent':
      return phaseCopy.waitingForOpponent
    // Placement-phase copy stays status-level: viewer-relative placement text
    // (submitted / waiting for fleet) needs getPlayers reads the list skips.
    case 'WaitingForPlacement':
      return matchListCopy.statusPlacement
    case 'ValidatingPlacement':
      return phaseCopy.placementValidating
    case 'ReadyToStart':
      return matchListCopy.statusStarting
    case 'InProgress': {
      const viewer = entry.isCreator ? match.creator : match.opponent
      return match.currentTurn !== null && match.currentTurn === viewer
        ? phaseCopy.battleYourTurn
        : phaseCopy.battleOpponentTurn
    }
    case 'ResolvingShot':
      return phaseCopy.resolving
    case 'Cancelled':
      return phaseCopy.cancelled
    case 'Forfeited':
    case 'Finished':
      if (won === true) return phaseCopy.finishedWon
      if (won === false) return phaseCopy.finishedLost
      return match.status === 'Forfeited' ? phaseCopy.forfeited : phaseCopy.finishedComplete
  }
}

/** The card's timestamp: when it finished, else the latest activity. */
function entryTimestamp(match: ChainMatchView): number {
  return match.finishedAt || match.lastActionAt || match.createdAt
}

function formatWhen(unixSeconds: number): string {
  if (!unixSeconds) return ''
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function MatchCard({ entry, deploymentId }: { entry: MatchListEntry; deploymentId: string }) {
  const { match, isCreator, opponent, won } = entry
  const resultClass = won === null ? '' : won ? ' won' : ' lost'
  return (
    <Link
      className={`panel match-card${resultClass}`}
      data-testid={`match-card-${match.matchId}`}
      to={inviteLinkPath(deploymentId, match.matchId)}
    >
      <div className="match-card-row">
        <span className="match-card-id">Match #{match.matchId}</span>
        <span className="match-card-when">{formatWhen(entryTimestamp(match))}</span>
      </div>
      <div className="match-card-row">
        <span className="match-card-opponent">
          {isCreator ? matchListCopy.roleCreator : matchListCopy.roleJoiner}
          {' · '}
          {opponent
            ? `${matchListCopy.opponentLabel} ${walletCopy.shortAddress(opponent)}`
            : matchListCopy.noOpponentYet}
        </span>
        <span className={`match-card-status${resultClass}`}>{entryStatusLabel(entry)}</span>
      </div>
    </Link>
  )
}

export function MatchListScreen() {
  const wallet = useWalletSession()
  const session = wallet.session
  const deploymentId = getActiveDeploymentId()
  const clients = useBattleshipClients(deploymentId)
  const { resolution, readClient } = clients

  const list = useMatchList({
    readClient: session.isConnected && session.isCorrectChain ? readClient : null,
    address: session.address,
    accountEpoch: wallet.accountEpoch,
    chainId: session.chainId,
  })

  const deploymentReady = resolution.ok && resolution.ready
  const showList = session.isConnected && session.isCorrectChain && deploymentReady

  return (
    <div className="overlay home" data-testid="match-list-screen">
      <div className="title-lockup">
        <span className="title-kicker">{matchListCopy.kicker}</span>
        <h1>{matchListCopy.title}</h1>
      </div>

      <WalletSessionBar
        session={session}
        onConnect={wallet.actions.connect}
        onDisconnect={wallet.actions.disconnect}
        configMissing={wallet.configMissing}
      />

      {!session.isConnected && !wallet.configMissing && (
        <p className="footnote" data-testid="match-list-connect-prompt">
          {matchListCopy.connectPrompt}
        </p>
      )}

      {session.isConnected && !session.isCorrectChain && (
        <WrongNetworkPanel
          session={session}
          onSwitch={wallet.actions.switchToArbitrumSepolia}
          onDisconnect={wallet.actions.disconnect}
          switchError={wallet.lastError}
        />
      )}

      {session.isConnected && session.isCorrectChain && !resolution.ok && (
        <p className="footnote" data-testid="match-list-deployment-unavailable">
          {resolution.reason === 'invalid'
            ? deploymentCopy.invalidBody(deploymentId)
            : deploymentCopy.unknownBody(deploymentId)}
        </p>
      )}

      {session.isConnected && session.isCorrectChain && resolution.ok && !resolution.ready && (
        <p className="footnote" data-testid="match-list-deployment-pending">
          {deploymentCopy.pendingNote}
        </p>
      )}

      {showList && (
        <div className="home-actions match-list" data-testid="match-list">
          {list.status === 'loading' && (
            <p className="status-sub" data-testid="match-list-loading">
              {matchListCopy.loading}
            </p>
          )}

          {list.status === 'error' && (
            <>
              <p className="error-note" role="alert" data-testid="match-list-error">
                {matchListCopy.loadError} {list.error ? errorMessage(list.error) : ''}
              </p>
              <button className="btn" data-testid="match-list-retry" onClick={list.refetch}>
                {matchListCopy.retry}
              </button>
            </>
          )}

          {list.status === 'ready' && list.partial && (
            <p className="footnote warn" data-testid="match-list-partial">
              {matchListCopy.partialError}
            </p>
          )}

          {list.status === 'ready' && list.totalCount === 0 && (
            <>
              <p className="footnote" data-testid="match-list-empty">
                {matchListCopy.empty}
              </p>
              <Link className="btn primary" data-ic="plus" to="/match/new">
                {matchListCopy.emptyCta}
              </Link>
            </>
          )}

          {list.status === 'ready' &&
            SECTIONS.map(({ bucket, heading }) => {
              const sectionEntries = list.entries.filter((entry) => entry.bucket === bucket)
              if (sectionEntries.length === 0) return null
              return (
                <section
                  key={bucket}
                  className="match-list-section"
                  data-testid={`match-list-section-${bucket}`}
                >
                  <h2 className="field-label">{heading}</h2>
                  {sectionEntries.map((entry) => (
                    <MatchCard
                      key={entry.match.matchId}
                      entry={entry}
                      deploymentId={entry.match.deploymentId}
                    />
                  ))}
                </section>
              )
            })}

          {list.status === 'ready' && list.hasMore && (
            <button
              className="btn ghost"
              data-testid="match-list-load-more"
              disabled={list.loadingMore}
              onClick={list.loadMore}
            >
              {list.loadingMore ? matchListCopy.loadingMore : matchListCopy.loadMore}
            </button>
          )}
        </div>
      )}

      <div className="home-actions">
        <Link className="btn ghost" data-ic="back" data-testid="match-list-back" to="/practice">
          {matchListCopy.back}
        </Link>
      </div>
    </div>
  )
}
