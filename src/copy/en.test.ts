import { describe, expect, it } from 'vitest'
import { deploymentCopy, matchRouteCopy, phaseCopy, resultCopy } from './en'

describe('English copy (GAME-108)', () => {
  it('exposes phase banner labels', () => {
    expect(phaseCopy.battleYourTurn).toBe('Your turn')
    expect(phaseCopy.battleOpponentTurn).toBe("Opponent's turn")
    expect(phaseCopy.wrongNetwork).toBe('Switch to Arbitrum Sepolia')
  })

  it('builds shot result toasts', () => {
    expect(resultCopy.miss).toBe('Miss')
    expect(resultCopy.hit).toBe('Hit')
    expect(resultCopy.sunkEnemy('Cruiser')).toBe('Sunk — enemy Cruiser destroyed')
    expect(resultCopy.sunkYours('Carrier')).toBe('Sunk — your Carrier is lost')
  })

  it('builds the match-route tagline', () => {
    expect(matchRouteCopy.tagline('arb-sepolia-v1', '42')).toBe(
      'Deployment arb-sepolia-v1 · Match 42',
    )
  })

  it('describes an unknown deployment with its id', () => {
    expect(deploymentCopy.unknownBody('retired-v0')).toContain('retired-v0')
  })
})
