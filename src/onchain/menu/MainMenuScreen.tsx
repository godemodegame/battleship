/**
 * Wallet-aware main menu (GAME-504, "Command Deck" in docs/copy-deck.md).
 *
 * Requires a connected wallet (disconnected visitors return to the entry
 * route). Offers the MVP actions only: starting a friend match and local
 * practice. Joining happens through invite links, never through a menu form,
 * so the menu points players at their link instead of a dead button.
 */

import { Link, Navigate, useNavigate } from 'react-router-dom'
import { menuCopy } from '../../copy/en'
import { useBattleshipClients } from '../client/useBattleshipClients'
import { getActiveDeploymentId } from '../deployments'
import { useWalletSession } from '../wallet/WalletSessionContext'
import { WalletSessionBar } from '../wallet/WalletSessionBar'
import { WrongNetworkPanel } from '../wallet/WrongNetworkPanel'

export function MainMenuScreen() {
  const wallet = useWalletSession()
  const navigate = useNavigate()
  const clients = useBattleshipClients(getActiveDeploymentId())

  if (!wallet.session.isConnected) {
    return <Navigate to="/" replace />
  }

  const deploymentReady = clients.resolution.ok && clients.resolution.ready

  return (
    <div className="overlay home" data-testid="main-menu">
      <div className="title-lockup">
        <span className="title-kicker">{menuCopy.kicker}</span>
        <h1>{menuCopy.title}</h1>
      </div>

      <WalletSessionBar
        session={wallet.session}
        onConnect={wallet.actions.connect}
        onDisconnect={wallet.actions.disconnect}
        configMissing={wallet.configMissing}
      />

      {!wallet.session.isCorrectChain && (
        <WrongNetworkPanel
          session={wallet.session}
          onSwitch={wallet.actions.switchToArbitrumSepolia}
          onDisconnect={wallet.actions.disconnect}
          switchError={wallet.lastError}
        />
      )}

      <div className="home-actions">
        <button
          className="btn primary"
          data-testid="menu-play-friend"
          onClick={() => navigate('/match/new')}
        >
          {menuCopy.playFriend}
        </button>
        <p className="footnote">{menuCopy.playFriendNote}</p>

        <Link className="btn" data-testid="menu-practice" to="/practice">
          {menuCopy.practice}
        </Link>
        <p className="footnote">{menuCopy.practiceNote}</p>

        {!deploymentReady && (
          <p className="footnote" data-testid="menu-deployment-pending">
            {menuCopy.deploymentPendingNote}
          </p>
        )}
        <p className="footnote">{menuCopy.joinHint}</p>
      </div>
    </div>
  )
}
