import { Link, useParams } from 'react-router-dom'

export function MatchRouteShell() {
  const { deploymentId, matchId } = useParams()

  return (
    <div className="overlay home">
      <div className="title-lockup">
        <span className="title-kicker">On-chain Match</span>
        <h1>Match Route</h1>
        <p className="tagline">
          Deployment {deploymentId ?? 'unknown'} · Match {matchId ?? 'unknown'}
        </p>
      </div>
      <div className="home-actions">
        <p>On-chain match shell will be implemented in a later phase.</p>
        <Link className="btn primary" to="/">
          Back to Practice
        </Link>
      </div>
    </div>
  )
}