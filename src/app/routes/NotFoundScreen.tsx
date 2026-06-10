import { Link } from 'react-router-dom'

export function NotFoundScreen() {
  return (
    <div className="overlay home">
      <div className="title-lockup">
        <h1>Page Not Found</h1>
        <p className="tagline">This route is not available yet.</p>
      </div>
      <div className="home-actions">
        <Link className="btn primary" to="/practice">
          Back to Practice
        </Link>
      </div>
    </div>
  )
}
