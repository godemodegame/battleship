import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { appShellCopy, explorerCopy } from '../copy/en'
import { explorerTxUrl } from '../onchain/explorer'
import { perf } from '../lib/perf'
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

/**
 * Full-screen status overlay for an in-flight async flow (encrypting a fleet,
 * opening a match, confirming a shot on-chain). Unlike `LoadingOverlay`, which
 * tracks 3D-asset progress, this shows caller-supplied copy with an animated
 * spinner so a long encryption / transaction wait never reads as a frozen UI.
 *
 * `txHash` adds an "open in explorer" link so the player can watch the move
 * land on-chain; `dim` swaps the opaque backdrop for a translucent scrim (used
 * mid-battle so the board stays visible behind the status); `tone` recolours
 * the accents (amber for an automatic-reconnect state).
 */
export function StatusOverlay({
  title,
  sub,
  testId,
  txHash,
  dim,
  tone = 'cyan',
}: {
  title: string
  sub?: string
  testId?: string
  txHash?: string | null
  dim?: boolean
  tone?: 'cyan' | 'amber'
}) {
  return (
    <div
      className={`overlay loading${dim ? ' dim' : ''}`}
      role="status"
      aria-live="polite"
      data-testid={testId}
    >
      <div className={`loading-box${tone === 'amber' ? ' loading-amber' : ''}`}>
        <div className="loading-spinner" aria-hidden="true" />
        <div className="loading-title">{title}</div>
        {sub && <div className="loading-sub">{sub}</div>}
        {txHash && (
          <a
            className="tx-explorer-link"
            href={explorerTxUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="overlay-tx-link"
          >
            {explorerCopy.viewTx}
          </a>
        )}
      </div>
    </div>
  )
}

/** Per docs: don't show the field until required models are loaded. */
export function LoadingOverlay() {
  const { active, progress, errors } = useProgress()
  const [everLoaded, setEverLoaded] = useState(false)

  useEffect(() => {
    if (!active && progress >= 100) {
      setEverLoaded(true)
      // GAME-809: navigation → required models interactive.
      perf.markLoaded()
    }
  }, [active, progress])

  if (errors.length > 0) {
    // GAME-805: a required asset failed (404, offline, flaky network). Loader
    // caches keep partial failures sticky, so the reliable retry is a reload —
    // offered as an explicit action instead of a dead end.
    return (
      <div className="overlay loading" role="alert">
        <div className="loading-box loading-error">
          <div className="loading-title">{appShellCopy.loadErrorTitle}</div>
          <div className="loading-sub">{appShellCopy.loadErrorBody}</div>
          <button
            className="btn primary"
            data-testid="asset-retry"
            onClick={() => window.location.reload()}
          >
            {appShellCopy.loadErrorRetry}
          </button>
        </div>
      </div>
    )
  }
  if (everLoaded || (!active && progress >= 100)) return null
  return (
    <div className="overlay loading">
      <div className="loading-box">
        <div className="loading-title">{appShellCopy.loadingTitle}</div>
        <div className="loading-bar">
          <div className="loading-fill" style={{ width: `${Math.max(6, progress)}%` }} />
        </div>
        <div className="loading-sub">{appShellCopy.loadingModels(Math.round(progress))}</div>
      </div>
    </div>
  )
}
