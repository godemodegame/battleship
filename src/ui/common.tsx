import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { sfx } from '../lib/sfx'

export function MuteButton() {
  const [muted, setMuted] = useState(sfx.muted)
  return (
    <button
      className="icon-btn"
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      onClick={() => {
        sfx.setMuted(!muted)
        setMuted(!muted)
        if (muted) sfx.ui()
      }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}

/** Per docs: don't show the field until required models are loaded. */
export function LoadingOverlay() {
  const { active, progress, errors } = useProgress()
  const [everLoaded, setEverLoaded] = useState(false)

  useEffect(() => {
    if (!active && progress >= 100) setEverLoaded(true)
  }, [active, progress])

  if (errors.length > 0) {
    return (
      <div className="overlay loading" role="alert">
        <div className="loading-box loading-error">
          <div className="loading-title">Battlefield Unavailable</div>
          <div className="loading-sub">A required 3D asset failed to load. Reload to try again.</div>
        </div>
      </div>
    )
  }
  if (everLoaded || (!active && progress >= 100)) return null
  return (
    <div className="overlay loading">
      <div className="loading-box">
        <div className="loading-title">Loading Battlefield</div>
        <div className="loading-bar">
          <div className="loading-fill" style={{ width: `${Math.max(6, progress)}%` }} />
        </div>
        <div className="loading-sub">Loading Models — {Math.round(progress)}%</div>
      </div>
    </div>
  )
}
