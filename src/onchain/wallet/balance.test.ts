import { describe, expect, it } from 'vitest'
import { evaluateBalance, LOW_BALANCE_WEI } from './balance'

describe('evaluateBalance', () => {
  it('formats wei as ETH', () => {
    const status = evaluateBalance(1_000_000_000_000_000_000n)
    expect(status.formatted).toBe('1')
    expect(status.balance).toBe(1_000_000_000_000_000_000n)
  })

  it('flags a zero balance as low', () => {
    expect(evaluateBalance(0n).isLow).toBe(true)
  })

  it('flags a balance at the low-balance threshold as low', () => {
    expect(evaluateBalance(LOW_BALANCE_WEI).isLow).toBe(true)
  })

  it('does not flag a balance above the low-balance threshold', () => {
    expect(evaluateBalance(LOW_BALANCE_WEI + 1n).isLow).toBe(false)
  })

  it('does not flag a comfortable balance as low', () => {
    expect(evaluateBalance(10_000_000_000_000_000n).isLow).toBe(false)
  })
})
