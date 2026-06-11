/**
 * GAME-810: player-facing copy must be English-only, and error rendering must
 * never expose raw provider/contract internals (hex blobs, revert names,
 * stack traces). The copy modules are the single source of player text, so
 * every exported string is walked and checked.
 */

import { describe, expect, it } from 'vitest'
import * as en from './en'
import { ERROR_MESSAGES, errorMessage, mapContractError, type ErrorCode } from './errors'

/**
 * English UI glyphs: ASCII plus the few typographic marks the copy deck uses
 * (ellipsis, middle dot, em dash, curly quotes, multiplication sign, the ✕
 * board glyph, arrows, and the … in progress labels).
 */
const ENGLISH_RE = /^[\x20-\x7E\n…·—–’‘“”×✕→°]*$/

/** Sample arguments for copy functions keyed by parameter count. */
function invoke(fn: (...args: never[]) => unknown): unknown {
  const samples = ['sample', 'sample', 'sample'].slice(0, fn.length) as never[]
  const numericFirst = fn.length >= 1 ? ([42, 'sample', 'sample'].slice(0, fn.length) as never[]) : samples
  try {
    return fn(...samples)
  } catch {
    return fn(...numericFirst)
  }
}

function collectStrings(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') {
    out.push([path, value])
    return
  }
  if (typeof value === 'function') {
    const result = invoke(value as (...args: never[]) => unknown)
    collectStrings(result, `${path}()`, out)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectStrings(entry, `${path}[${index}]`, out))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      collectStrings(entry, `${path}.${key}`, out)
    }
  }
}

function allCopyStrings(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const [exportName, exported] of Object.entries(en)) {
    collectStrings(exported, exportName, out)
  }
  for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
    out.push([`ERROR_MESSAGES.${code}`, message])
  }
  return out
}

describe('English-only copy (GAME-810)', () => {
  it('every exported player-facing string uses English glyphs only', () => {
    const strings = allCopyStrings()
    expect(strings.length).toBeGreaterThan(100)
    for (const [path, text] of strings) {
      expect(text, `${path} contains non-English characters: "${text}"`).toMatch(ENGLISH_RE)
    }
  })

  it('no copy string carries developer internals', () => {
    // Raw revert names, 0x blobs, and stack-trace markers must never be
    // baked into player-facing copy.
    const forbidden = /(0x[0-9a-fA-F]{16,}|at\s+\w+\s+\(|\bRPC error\b|\brevert(ed)?\s+with\b)/
    for (const [path, text] of allCopyStrings()) {
      expect(text, `${path} leaks internals: "${text}"`).not.toMatch(forbidden)
    }
  })
})

describe('raw error exposure (GAME-810)', () => {
  it('errorMessage maps every code to readable English', () => {
    for (const code of Object.keys(ERROR_MESSAGES) as ErrorCode[]) {
      const message = errorMessage(code)
      expect(message).toMatch(ENGLISH_RE)
      // The mapped text never echoes the raw code identifier itself.
      expect(message).not.toBe(code)
    }
  })

  it('unknown contract error names degrade to the generic message', () => {
    expect(mapContractError('SomeFutureRevertName')).toBe('unknown')
    expect(mapContractError(null)).toBe('unknown')
    expect(errorMessage(mapContractError('SomeFutureRevertName'))).toBe('Something went wrong')
  })
})
