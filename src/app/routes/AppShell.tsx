import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { appShellCopy } from '../../copy/en'
import { useOnlineStatus } from '../../lib/online'
import { isPerfRequested, perf, type PerfSummary } from '../../lib/perf'
import { useReducedMotion } from '../../ui/settingsStore'

/**
 * Local-only performance readout (GAME-809), enabled with `?perf=1`. Shows
 * fps, heap, load time, and the latest recorded durations; nothing leaves
 * the device.
 */
function PerfOverlay() {
  const [summary, setSummary] = useState<PerfSummary | null>(null)

  useEffect(() => {
    perf.startFpsSampler()
    const interval = window.setInterval(() => setSummary(perf.summary()), 1000)
    return () => {
      window.clearInterval(interval)
      perf.stopFpsSampler()
    }
  }, [])

  if (!summary) return null
  const durations = Object.entries(summary.durations)
  return (
    <div className="perf-overlay" data-testid="perf-overlay" aria-hidden="true">
      <span>
        fps {summary.fps ? `${summary.fps.average} (min ${summary.fps.worst})` : '—'}
      </span>
      <span>heap {summary.usedHeapMb !== null ? `${summary.usedHeapMb} MB` : '—'}</span>
      <span>load {summary.loadMs !== null ? `${summary.loadMs} ms` : '—'}</span>
      {durations.map(([label, stat]) => (
        <span key={label}>
          {label} {Math.round(stat.lastMs)} ms ×{stat.count}
        </span>
      ))}
    </div>
  )
}

export function AppShell() {
  const online = useOnlineStatus()
  const reducedMotion = useReducedMotion()
  const [perfEnabled] = useState(isPerfRequested)

  // GAME-807: expose the effective motion preference to CSS so transitions and
  // keyframe animations collapse everywhere, not only inside the canvas.
  useEffect(() => {
    if (reducedMotion) document.documentElement.dataset.motion = 'reduced'
    else delete document.documentElement.dataset.motion
  }, [reducedMotion])

  return (
    <div className="app-shell" data-testid="app-shell">
      {/* GAME-805: visible offline state; reads resume on the 'online' event. */}
      {!online && (
        <div className="offline-banner" role="status" data-testid="offline-banner">
          {appShellCopy.offlineBanner}
        </div>
      )}
      {perfEnabled && <PerfOverlay />}
      <Outlet />
    </div>
  )
}
