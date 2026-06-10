import { matchSummary, useStore } from '../practice/practiceStore'

export function GameOverScreen() {
  const match = useStore((s) => s.match)
  const forfeited = useStore((s) => s.forfeited)
  const rematch = useStore((s) => s.rematch)
  const toHome = useStore((s) => s.toHome)
  if (!match?.winner) return null

  const s = matchSummary(match, forfeited)
  const won = s.winner === 'player'

  return (
    <div className="overlay gameover">
      <div className={`panel result ${won ? 'won' : 'lost'}`}>
        <span className="result-kicker">{forfeited ? 'Match forfeited' : 'All ships down'}</span>
        <h1>{won ? 'Victory' : 'Defeat'}</h1>
        <p className="result-sub">
          {won
            ? `Enemy fleet destroyed with ${s.playerShipsLeft === 10 ? 'all ' : ''}${s.playerShipsLeft} of your ships still afloat.`
            : forfeited
              ? 'You abandoned the engagement.'
              : `Your fleet was lost. The enemy had ${s.botShipsLeft} ship${s.botShipsLeft === 1 ? '' : 's'} remaining.`}
        </p>

        <div className="stats-grid">
          <div className="stat">
            <span className="stat-value">{s.turns}</span>
            <span className="stat-label">Moves</span>
          </div>
          <div className="stat">
            <span className="stat-value">{s.playerAccuracy}%</span>
            <span className="stat-label">Your accuracy</span>
          </div>
          <div className="stat">
            <span className="stat-value">{s.botAccuracy}%</span>
            <span className="stat-label">Opponent accuracy</span>
          </div>
          <div className="stat">
            <span className="stat-value">
              {won ? s.playerShipsLeft : s.botShipsLeft}
            </span>
            <span className="stat-label">{won ? 'Ships left' : 'Enemy ships left'}</span>
          </div>
        </div>

        <button className="btn primary wide" onClick={rematch}>
          Play Again
        </button>
        <button className="btn ghost wide" onClick={toHome}>
          Main Menu
        </button>
      </div>
    </div>
  )
}
