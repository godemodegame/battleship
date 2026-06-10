import { describe, expect, it } from 'vitest'
import { evaluateWriteReadiness, type WriteReadinessInput } from './writeGuard'

function input(over: Partial<WriteReadinessInput> = {}): WriteReadinessInput {
  return {
    hasAddress: true,
    chainId: 421614,
    publicClientReady: true,
    walletClientReady: true,
    ...over,
  }
}

describe('evaluateWriteReadiness', () => {
  it('allows a write only when wallet, chain, and both clients are ready', () => {
    expect(evaluateWriteReadiness(input())).toEqual({ canWrite: true, blockedReason: null })
  })

  it('blocks with no-wallet when no address is connected', () => {
    expect(evaluateWriteReadiness(input({ hasAddress: false }))).toEqual({
      canWrite: false,
      blockedReason: 'no-wallet',
    })
  })

  it('blocks with wrong-network off Arbitrum Sepolia', () => {
    expect(evaluateWriteReadiness(input({ chainId: 1 })).blockedReason).toBe('wrong-network')
    expect(evaluateWriteReadiness(input({ chainId: 11155111 })).blockedReason).toBe('wrong-network')
    expect(evaluateWriteReadiness(input({ chainId: null })).blockedReason).toBe('wrong-network')
  })

  it('blocks with client-not-ready when either viem client is missing', () => {
    expect(evaluateWriteReadiness(input({ publicClientReady: false })).blockedReason).toBe(
      'client-not-ready',
    )
    expect(evaluateWriteReadiness(input({ walletClientReady: false })).blockedReason).toBe(
      'client-not-ready',
    )
  })

  it('surfaces the most fundamental blocker first (wallet before chain before client)', () => {
    const allBad = input({
      hasAddress: false,
      chainId: 1,
      publicClientReady: false,
      walletClientReady: false,
    })
    expect(evaluateWriteReadiness(allBad).blockedReason).toBe('no-wallet')

    const chainAndClientBad = input({
      chainId: 1,
      publicClientReady: false,
    })
    expect(evaluateWriteReadiness(chainAndClientBad).blockedReason).toBe('wrong-network')
  })

  it('never allows a write on a cached/unknown chain value', () => {
    expect(evaluateWriteReadiness(input({ chainId: null })).canWrite).toBe(false)
  })
})
