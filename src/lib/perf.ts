/**
 * Local performance instrumentation (GAME-809).
 *
 * Measures the numbers `docs/mobile-performance-budget.md` budgets: frame
 * rate, load time, JS heap, encryption time, and transaction latency. All
 * data stays on the device — readable from the dev overlay (`?perf=1`), the
 * console (`window.__PERF__.summary()`), or tests. Nothing is uploaded and
 * nothing private is recorded (durations and labels only, never payloads,
 * addresses, or fleet data).
 */

export interface DurationStat {
  count: number
  totalMs: number
  minMs: number
  maxMs: number
  lastMs: number
}

export interface FpsStats {
  /** Frames sampled in the current window. */
  frames: number
  /** Average fps over the sample window. */
  average: number
  /** Worst instantaneous fps seen since the sampler started. */
  worst: number
}

export interface PerfSummary {
  /** Navigation start → practice models interactive, when observed. */
  loadMs: number | null
  fps: FpsStats | null
  /** Used JS heap in MB when the browser exposes performance.memory. */
  usedHeapMb: number | null
  durations: Record<string, DurationStat>
}

/** True when the perf overlay/sampling was requested via `?perf=1`. */
export function isPerfRequested(search = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  return /[?&]perf=1\b/.test(search)
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/** Pure rolling-average fps from a list of frame timestamps (ms). */
export function fpsFromTimestamps(timestamps: readonly number[]): number {
  if (timestamps.length < 2) return 0
  const elapsed = timestamps[timestamps.length - 1] - timestamps[0]
  if (elapsed <= 0) return 0
  return ((timestamps.length - 1) * 1000) / elapsed
}

const FPS_WINDOW = 120

class PerfMonitor {
  private durations = new Map<string, DurationStat>()
  private loadMs: number | null = null
  private frameTimes: number[] = []
  private worstFps = Infinity
  private rafId: number | null = null

  /** Record one finished duration sample under a label. */
  record(label: string, ms: number): void {
    const current = this.durations.get(label)
    if (!current) {
      this.durations.set(label, { count: 1, totalMs: ms, minMs: ms, maxMs: ms, lastMs: ms })
      return
    }
    current.count += 1
    current.totalMs += ms
    current.minMs = Math.min(current.minMs, ms)
    current.maxMs = Math.max(current.maxMs, ms)
    current.lastMs = ms
  }

  /** Start a timer; the returned function stops it and records the sample. */
  start(label: string): () => number {
    const begin = now()
    let stopped = false
    return () => {
      if (stopped) return 0
      stopped = true
      const ms = now() - begin
      this.record(label, ms)
      return ms
    }
  }

  /** Mark the app interactive (called once when required models finish). */
  markLoaded(): void {
    if (this.loadMs !== null) return
    this.loadMs = now()
  }

  /** Begin rAF-based fps sampling (no-op when already running). */
  startFpsSampler(): void {
    if (this.rafId !== null || typeof requestAnimationFrame === 'undefined') return
    const tick = (t: number) => {
      this.frameTimes.push(t)
      if (this.frameTimes.length > FPS_WINDOW) this.frameTimes.shift()
      if (this.frameTimes.length >= 2) {
        const lastDelta =
          this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[this.frameTimes.length - 2]
        if (lastDelta > 0) this.worstFps = Math.min(this.worstFps, 1000 / lastDelta)
      }
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stopFpsSampler(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId)
    }
    this.rafId = null
  }

  summary(): PerfSummary {
    const memory = (
      performance as unknown as { memory?: { usedJSHeapSize?: number } }
    ).memory
    const fps =
      this.frameTimes.length >= 2
        ? {
            frames: this.frameTimes.length,
            average: Math.round(fpsFromTimestamps(this.frameTimes) * 10) / 10,
            worst: this.worstFps === Infinity ? 0 : Math.round(this.worstFps * 10) / 10,
          }
        : null
    return {
      loadMs: this.loadMs === null ? null : Math.round(this.loadMs),
      fps,
      usedHeapMb:
        memory?.usedJSHeapSize !== undefined
          ? Math.round((memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10
          : null,
      durations: Object.fromEntries(
        [...this.durations.entries()].map(([label, stat]) => [label, { ...stat }]),
      ),
    }
  }

  /** Test hook: drop all recorded data. */
  reset(): void {
    this.durations.clear()
    this.loadMs = null
    this.frameTimes = []
    this.worstFps = Infinity
  }
}

export const perf = new PerfMonitor()

declare global {
  interface Window {
    /** Local-only perf inspection handle (GAME-809). Contains no private data. */
    __PERF__?: PerfMonitor
  }
}

if (typeof window !== 'undefined') {
  window.__PERF__ = perf
}
