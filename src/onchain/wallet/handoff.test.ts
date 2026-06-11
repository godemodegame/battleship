import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearHandoffIntent, consumeHandoffIntent, saveHandoffIntent } from './handoff'

describe('wallet handoff (GAME-210)', () => {
  const originalSessionStorage = globalThis.sessionStorage

  beforeEach(() => {
    // fresh storage per test
    const store = new Map<string, string>()
    const mock = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size
      },
    }
    ;(globalThis as any).sessionStorage = mock
  })

  afterEach(() => {
    ;(globalThis as any).sessionStorage = originalSessionStorage
    clearHandoffIntent()
  })

  it('saves and consumes a target path', () => {
    saveHandoffIntent('/match/arb-sepolia-v1/demo-123')
    const consumed = consumeHandoffIntent()
    expect(consumed).toBe('/match/arb-sepolia-v1/demo-123')
    // second consume yields nothing
    expect(consumeHandoffIntent()).toBeNull()
  })

  it('clears on explicit clear', () => {
    saveHandoffIntent('/match/arb-sepolia-v1/x')
    clearHandoffIntent()
    expect(consumeHandoffIntent()).toBeNull()
  })

  it('discards stale intents', () => {
    // simulate an old entry by writing directly with old ts
    const old = JSON.stringify({ target: '/match/old', ts: Date.now() - 1000 * 60 * 60 })
    sessionStorage.setItem('onchain:handoff:intent:v1', old)
    const consumed = consumeHandoffIntent(1000 * 30) // 30s max age for test
    expect(consumed).toBeNull()
  })

  it('returns null and clears on corrupt data', () => {
    sessionStorage.setItem('onchain:handoff:intent:v1', 'not-json')
    const consumed = consumeHandoffIntent()
    expect(consumed).toBeNull()
    // storage should have been cleaned
    expect(sessionStorage.getItem('onchain:handoff:intent:v1')).toBeNull()
  })
})
