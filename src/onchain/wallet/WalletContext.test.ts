import { describe, expect, it } from 'vitest'
import { parseCaipChainId } from './WalletContext'

describe('parseCaipChainId', () => {
  it('parses a CAIP-2 chain id', () => {
    expect(parseCaipChainId('eip155:421614')).toBe(421614)
  })

  it('returns null for null/undefined input', () => {
    expect(parseCaipChainId(null)).toBeNull()
    expect(parseCaipChainId(undefined)).toBeNull()
  })

  it('returns null for a non-numeric chain id', () => {
    expect(parseCaipChainId('eip155:not-a-number')).toBeNull()
  })

  it('parses a bare numeric string', () => {
    expect(parseCaipChainId('1')).toBe(1)
  })
})
