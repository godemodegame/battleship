/**
 * Contract-derived terminal summary (GAME-709 / GAME-710 / GAME-711).
 *
 * Victory, defeat, forfeit, and timeout outcomes render purely from the
 * authoritative match read: the winner address, status, move count, final
 * public boards, and move history. No local winner mutation exists — refresh
 * reconstructs this screen from the same reads.
 *
 * Rematch starts a brand-new contract match: it routes to the create-match
 * flow with the old opponent prefilled (GAME-711).
 */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { battleCopy, summaryCopy, walletCopy } from '../../copy/en'
import type { ChainMatchView } from '../client/mapping'
import type { WalletContextValue } from '../wallet/WalletSessionContext'
import { BattleGrid } from './BattleGrid'
import { buildPublicBattleModel, TOTAL_SHIPS } from './publicBattleModel'
import { MoveHistoryList, ShotResultBanner } from './OnchainBattlePanel'
import { useShotFx } from './useShotFx'

export interface MatchSummaryPanelProps {
  match: ChainMatchView
  wallet: WalletContextValue
}

export function MatchSummaryPanel({ match, wallet }: MatchSummaryPanelProps) {
  const navigate = useNavigate()
  const viewer = wallet.session.address
  // The winning shot may finalize straight into Finished; mounting the fx hook
  // here keeps that last effect playing exactly once (GAME-706/707).
  const fx = useShotFx(match, viewer)

  const model = useMemo(
    () => (viewer ? buildPublicBattleModel(match, viewer) : null),
    [match, viewer],
  )

  const isParticipant = Boolean(
    viewer && (match.creator === viewer || match.opponent === viewer),
  )
  const youWon = isParticipant && match.winner ? match.winner === viewer : null
  const byForfeit = match.status === 'Forfeited'

  const title =
    youWon === true
      ? summaryCopy.victoryTitle
      : youWon === false
        ? summaryCopy.defeatTitle
        : summaryCopy.completeTitle
  const body =
    youWon === true
      ? byForfeit
        ? summaryCopy.forfeitWonBody
        : summaryCopy.wonBody
      : youWon === false
        ? byForfeit
          ? summaryCopy.forfeitLostBody
          : summaryCopy.lostBody
        : summaryCopy.spectatorBody

  const opponentAddress =
    viewer && match.creator === viewer ? match.opponent : match.creator

  return (
    <section className="onchain-battle panel" data-testid="match-summary-panel">
      <div className="home-actions">
        <span
          className="status-label"
          data-testid="summary-title"
          data-outcome={youWon === true ? 'won' : youWon === false ? 'lost' : 'complete'}
        >
          {title}
        </span>
        <p className="status-sub" data-testid="summary-body">
          {body}
        </p>
        {match.winner && (
          <p className="footnote" data-testid="summary-winner">
            {summaryCopy.winnerLabel}: {walletCopy.shortAddress(match.winner)}
          </p>
        )}
        <p className="footnote" data-testid="summary-moves">
          {summaryCopy.movesLabel}: {match.moveCount}
        </p>
      </div>

      <ShotResultBanner fx={fx} />

      {model && (
        <>
          <div className="battle-strips">
            <span className="footnote">
              {battleCopy.enemyShips(model.opponentBoard.shipsRemaining, TOTAL_SHIPS)}
            </span>
            <span className="footnote">
              {battleCopy.yourShips(model.playerBoard.shipsRemaining, TOTAL_SHIPS)}
            </span>
          </div>
          <div className="battle-board">
            <span className="status-label">{battleCopy.enemyBoard}</span>
            <BattleGrid
              board={model.opponentBoard}
              label={battleCopy.enemyBoard}
              interactive={false}
              testId="enemy-battle-grid"
            />
          </div>
          <div className="battle-board">
            <span className="status-label">{battleCopy.yourBoard}</span>
            <BattleGrid
              board={model.playerBoard}
              label={battleCopy.yourBoard}
              interactive={false}
              testId="player-battle-grid"
            />
          </div>
        </>
      )}

      {viewer && <MoveHistoryList moves={match.moves} viewer={viewer} />}

      {isParticipant && opponentAddress && (
        <button
          className="btn primary wide"
          data-testid="rematch-button"
          onClick={() => navigate('/match/new', { state: { invited: opponentAddress } })}
        >
          {summaryCopy.rematch}
        </button>
      )}
    </section>
  )
}
