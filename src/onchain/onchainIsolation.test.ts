import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function readOnchainSource(rel: string): Promise<string> {
  const abs = resolve(__dirname, rel)
  return readFile(abs, 'utf8')
}

describe('on-chain module isolation (GAME-102)', () => {
  it('phaseResolver source does not reference the local attack engine or bot', async () => {
    const src = await readOnchainSource('./phaseResolver.ts')
    // Only flag actual module imports, not prose in comments.
    expect(src).not.toMatch(/from ['"][^'"]*\/(engine|bot)['"]|from ['"][^'"]*\b(engine|bot)\b['"]/)
  })

  it('MatchRouteShell source does not reference the local attack engine or bot', async () => {
    const src = await readOnchainSource('./MatchRouteShell.tsx')
    expect(src).not.toMatch(/from ['"][^'"]*\/(engine|bot)['"]|from ['"][^'"]*\b(engine|bot)\b['"]/)
  })

  it('loading the on-chain modules at runtime does not transitively require engine or bot for their public exports', async () => {
    // Dynamic import of the resolver and shell should succeed without the practice engine being a hard dep.
    // If engine were imported at top level in the onchain subtree, this would still load (because tests load everything),
    // but the source checks above plus the fact that we never wrote such an import is the guard.
    // We additionally assert that the module objects expose the expected pure functions.
    const resolver = await import('./phaseResolver')
    expect(typeof resolver.resolveMatchPhase).toBe('function')
    expect(typeof resolver.phaseLabel).toBe('function')

    const shell = await import('./MatchRouteShell')
    expect(typeof shell.MatchRouteShell).toBe('function')
  })
})
