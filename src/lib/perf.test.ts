/**
 * Local performance instrumentation tests (GAME-809).
 */

import { afterEach, describe, expect, it } from 'vitest'
import { fpsFromTimestamps, isPerfRequested, perf } from './perf'

afterEach(() => {
  perf.reset()
})

describe('fpsFromTimestamps', () => {
  it('computes average fps from frame timestamps', () => {
    // 7 frames over 100ms = 60 fps at ~16.67ms per frame.
    const timestamps = Array.from({ length: 7 }, (_, i) => i * (1000 / 60))
    expect(fpsFromTimestamps(timestamps)).toBeCloseTo(60, 0)
  })

  it('returns 0 for degenerate inputs', () => {
    expect(fpsFromTimestamps([])).toBe(0)
    expect(fpsFromTimestamps([5])).toBe(0)
    expect(fpsFromTimestamps([5, 5])).toBe(0)
  })
})

describe('perf monitor', () => {
  it('aggregates duration samples per label', () => {
    perf.record('tx:attack', 100)
    perf.record('tx:attack', 300)
    perf.record('encrypt-fleet', 50)

    const summary = perf.summary()
    expect(summary.durations['tx:attack']).toEqual({
      count: 2,
      totalMs: 400,
      minMs: 100,
      maxMs: 300,
      lastMs: 300,
    })
    expect(summary.durations['encrypt-fleet'].count).toBe(1)
  })

  it('start() returns a stop function that records once', () => {
    const stop = perf.start('probe')
    const ms = stop()
    expect(ms).toBeGreaterThanOrEqual(0)
    expect(stop()).toBe(0) // double-stop never records twice
    expect(perf.summary().durations['probe'].count).toBe(1)
  })

  it('markLoaded records the first load time only', () => {
    perf.markLoaded()
    const first = perf.summary().loadMs
    expect(first).not.toBeNull()
    perf.markLoaded()
    expect(perf.summary().loadMs).toBe(first)
  })

  it('summary contains no private data fields', () => {
    perf.record('tx:attack', 10)
    const summary = perf.summary()
    expect(Object.keys(summary).sort()).toEqual(['durations', 'fps', 'loadMs', 'usedHeapMb'])
    expect(JSON.stringify(summary)).not.toMatch(/0x[0-9a-f]{8,}/i)
  })
})

describe('isPerfRequested', () => {
  it('parses the perf=1 query flag', () => {
    expect(isPerfRequested('?perf=1')).toBe(true)
    expect(isPerfRequested('?foo=2&perf=1')).toBe(true)
    expect(isPerfRequested('?perf=0')).toBe(false)
    expect(isPerfRequested('')).toBe(false)
  })
})
