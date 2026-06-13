/**
 * "Find a Game" — the open-match lobby for random matchmaking.
 *
 * Lists currently-joinable open matches hosted by other players (from the
 * on-chain `getOpenMatches` index via `useOpenMatches`), plus the viewer's own
 * still-open game. Two ways in:
 *   - Quick Match: jump straight to the oldest joinable open game, or host one
 *     if the lobby is empty (the host then waits for any challenger);
 *   - Browse: pick a specific open game to join, or host a new one.
 * Joining/hosting both reuse the placement-first match route, so this screen
 * only handles discovery + navigation. Wallet/network/deployment gating mirrors
 * MatchListScreen.
 */

import { Link, useNavigate } from 'react-router-dom'
import {
  deploymentCopy,
  lobbyCopy,
  phaseCopy,
  walletCopy,
} from '../../copy/en'
import { errorMessage } from '../../copy/errors'
import { useBattleshipClients } from '../client/useBattleshipClients'
import { getActiveDeploymentId } from '../deployments'
import { inviteLinkPath } from '../inviteLink'
import { useOpenMatches, type OpenMatchEntry } from '../useOpenMatches'
import { useWalletSession } from '../wallet/WalletSessionContext'
import { WalletSessionBar } from '../wallet/WalletSessionBar'
import { WrongNetworkPanel } from '../wallet/WrongNetworkPanel'

function formatWhen(unixSeconds: number): string {
  if (!unixSeconds) return ''
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function LobbyCard({
  entry,
  deploymentId,
}: {
  entry: OpenMatchEntry
  deploymentId: string
}) {
  const { match, isOwn } = entry
  return (
    <Link
      className="panel match-card"
      data-testid={`open-match-card-${match.matchId}`}
      to={inviteLinkPath(deploymentId, match.matchId)}
    >
      <div className="match-card-row">
        <span className="match-card-id">Match #{match.matchId}</span>
        <span className="match-card-when">{formatWhen(match.createdAt)}</span>
      </div>
      <div className="match-card-row">
        <span className="match-card-opponent">
          {isOwn
            ? lobbyCopy.waitingForYou
            : `${lobbyCopy.hostedBy} ${match.creator ? walletCopy.shortAddress(match.creator) : '—'}`}
        </span>
        <span className="match-card-status">
          {isOwn ? phaseCopy.waitingForOpponent : lobbyCopy.joinLabel}
        </span>
      </div>
    </Link>
  )
}

export function OpenMatchLobbyScreen() {
  const wallet = useWalletSession()
  const navigate = useNavigate()
  const session = wallet.session
  const deploymentId = getActiveDeploymentId()
  const clients = useBattleshipClients(deploymentId)
  const { resolution, readClient } = clients

  const lobby = useOpenMatches({
    readClient: session.isConnected && session.isCorrectChain ? readClient : null,
    address: session.address,
    accountEpoch: wallet.accountEpoch,
    chainId: session.chainId,
  })

  const deploymentReady = resolution.ok && resolution.ready
  const showLobby = session.isConnected && session.isCorrectChain && deploymentReady

  // Quick Match: oldest joinable game drains the queue first; host if empty.
  // `entries` are newest-first, so the last element is the oldest open game.
  function onQuickMatch() {
    const oldest = lobby.entries[lobby.entries.length - 1]
    if (oldest) {
      navigate(inviteLinkPath(deploymentId, oldest.match.matchId))
    } else {
      navigate('/match/open')
    }
  }

  return (
    <div className="overlay home" data-testid="open-lobby-screen">
      <div className="title-lockup">
        <span className="title-kicker">{lobbyCopy.kicker}</span>
        <h1>{lobbyCopy.title}</h1>
      </div>

      <WalletSessionBar
        session={session}
        onConnect={wallet.actions.connect}
        onDisconnect={wallet.actions.disconnect}
        configMissing={wallet.configMissing}
      />

      {!session.isConnected && !wallet.configMissing && (
        <p className="footnote" data-testid="open-lobby-connect-prompt">
          {lobbyCopy.connectPrompt}
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
        <p className="footnote" data-testid="open-lobby-deployment-unavailable">
          {resolution.reason === 'invalid'
            ? deploymentCopy.invalidBody(deploymentId)
            : deploymentCopy.unknownBody(deploymentId)}
        </p>
      )}

      {session.isConnected && session.isCorrectChain && resolution.ok && !resolution.ready && (
        <p className="footnote" data-testid="open-lobby-deployment-pending">
          {deploymentCopy.pendingNote}
        </p>
      )}

      {showLobby && (
        <div className="home-actions" data-testid="open-lobby">
          <button
            className="btn primary wide"
            data-ic="globe"
            data-testid="quick-match"
            disabled={lobby.status !== 'ready'}
            onClick={onQuickMatch}
          >
            {lobby.status === 'loading' ? lobbyCopy.quickMatchSearching : lobbyCopy.quickMatch}
          </button>

          <div className="button-row">
            <Link className="btn" data-ic="plus" data-testid="open-lobby-host" to="/match/open">
              {lobbyCopy.hostNew}
            </Link>
            <button className="btn" data-testid="open-lobby-refresh" onClick={lobby.refetch}>
              {lobbyCopy.refresh}
            </button>
          </div>

          {lobby.status === 'loading' && (
            <p className="status-sub" data-testid="open-lobby-loading">
              {lobbyCopy.loading}
            </p>
          )}

          {lobby.status === 'error' && (
            <>
              <p className="error-note" role="alert" data-testid="open-lobby-error">
                {lobbyCopy.loadError} {lobby.error ? errorMessage(lobby.error) : ''}
              </p>
              <button className="btn" data-testid="open-lobby-retry" onClick={lobby.refetch}>
                {lobbyCopy.retry}
              </button>
            </>
          )}

          {lobby.status === 'ready' && lobby.partial && (
            <p className="footnote warn" data-testid="open-lobby-partial">
              {lobbyCopy.partialError}
            </p>
          )}

          {lobby.status === 'ready' && lobby.mine.length > 0 && (
            <section className="match-list-section" data-testid="open-lobby-mine">
              <h2 className="field-label">{lobbyCopy.sectionMine}</h2>
              {lobby.mine.map((entry) => (
                <LobbyCard
                  key={entry.match.matchId}
                  entry={entry}
                  deploymentId={entry.match.deploymentId}
                />
              ))}
            </section>
          )}

          {lobby.status === 'ready' && lobby.entries.length > 0 && (
            <section className="match-list-section" data-testid="open-lobby-joinable">
              <h2 className="field-label">{lobbyCopy.sectionJoinable}</h2>
              {lobby.entries.map((entry) => (
                <LobbyCard
                  key={entry.match.matchId}
                  entry={entry}
                  deploymentId={entry.match.deploymentId}
                />
              ))}
            </section>
          )}

          {lobby.status === 'ready' && lobby.entries.length === 0 && lobby.mine.length === 0 && (
            <>
              <p className="footnote" data-testid="open-lobby-empty">
                {lobbyCopy.empty}
              </p>
              <Link className="btn primary" data-ic="plus" to="/match/open">
                {lobbyCopy.emptyCta}
              </Link>
            </>
          )}
        </div>
      )}

      <div className="home-actions">
        <Link className="btn ghost" data-ic="back" data-testid="open-lobby-back" to="/practice">
          {lobbyCopy.back}
        </Link>
      </div>
    </div>
  )
}
