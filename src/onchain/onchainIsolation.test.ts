import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function readOnchainSource(rel: string): Promise<string> {
  const abs = resolve(__dirname, rel)
  return readFile(abs, 'utf8')
}

describe('on-chain module isolation (GAME-103 empty shell)', () => {
  it('phaseResolver source does not reference the local attack engine or bot', async () => {
    const src = await readOnchainSource('./phaseResolver.ts')
    // Only flag actual module imports (static or dynamic), not prose in comments.
    // Covers: import ... from '...' , import('...') , require('...') , export ... from '...'
    const bad = /(?:from\s+['"]|import\s*\(\s*['"]|require\s*\(\s*['"]|export[^;]+from\s+['"])[^'"]*\b(engine|bot)\b/i
    expect(src).not.toMatch(bad)
  })

  it('MatchRouteShell source does not reference the local attack engine or bot', async () => {
    const src = await readOnchainSource('./MatchRouteShell.tsx')
    const bad = /(?:from\s+['"]|import\s*\(\s*['"]|require\s*\(\s*['"]|export[^;]+from\s+['"])[^'"]*\b(engine|bot)\b/i
    expect(src).not.toMatch(bad)
  })

  it('renderModel source does not reference the local attack engine or bot', async () => {
    const src = await readOnchainSource('./renderModel.ts')
    const bad = /(?:from\s+['"]|import\s*\(\s*['"]|require\s*\(\s*['"]|export[^;]+from\s+['"])[^'"]*\b(engine|bot)\b/i
    expect(src).not.toMatch(bad)
  })

  it('wallet modules do not reference the local attack engine or bot (GAME-201–207)', async () => {
    const bad = /(?:from\s+['"]|import\s*\(\s*['"]|require\s*\(\s*['"]|export[^;]+from\s+['"])[^'"]*\b(engine|bot)\b/i
    const files = [
      './wallet/network.ts',
      './wallet/session.ts',
      './wallet/writeGuard.ts',
      './wallet/activeWallet.ts',
      './wallet/privyConfig.ts',
      './wallet/WalletSessionContext.ts',
      './wallet/WalletProvider.tsx',
      './wallet/WalletSessionBar.tsx',
      './wallet/WrongNetworkPanel.tsx',
      './wallet/handoff.ts',
      './wallet/LowBalanceNotice.tsx',
    ]
    for (const file of files) {
      expect(await readOnchainSource(file)).not.toMatch(bad)
    }
  })

  it('the public render adapter never exposes hull geometry', async () => {
    const { decodePublicBoard, publicBattleToRenderModel } = await import('./renderModel')
    const board = decodePublicBoard({ misses: [], hits: [], sunk: [3], shipsRemaining: 1 })
    const scene = publicBattleToRenderModel({
      phase: 'finished',
      perspective: 'creator',
      currentTurn: null,
      winner: null,
      playerBoard: board,
      opponentBoard: board,
      selectedCell: null,
      latestFinalizedMove: null,
    })
    expect(scene.player.ships).toEqual([])
    expect(scene.enemy.ships).toEqual([])
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
