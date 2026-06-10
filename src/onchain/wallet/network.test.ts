import { describe, expect, it } from 'vitest'
import {
  ARBITRUM_SEPOLIA_CHAIN_ID,
  arbitrumSepolia,
  isSupportedChain,
  parseChainId,
} from './network'

describe('network constants', () => {
  it('pins Arbitrum Sepolia to chain id 421614', () => {
    expect(ARBITRUM_SEPOLIA_CHAIN_ID).toBe(421614)
    expect(arbitrumSepolia.id).toBe(421614)
  })

  it('treats only 421614 as supported', () => {
    expect(isSupportedChain(421614)).toBe(true)
    expect(isSupportedChain(1)).toBe(false)
    expect(isSupportedChain(11155111)).toBe(false)
    expect(isSupportedChain(null)).toBe(false)
    expect(isSupportedChain(undefined)).toBe(false)
  })
})

describe('parseChainId', () => {
  it('parses CAIP-2 eip155 strings', () => {
    expect(parseChainId('eip155:421614')).toBe(421614)
    expect(parseChainId('eip155:1')).toBe(1)
  })

  it('parses plain decimal and hex strings', () => {
    expect(parseChainId('421614')).toBe(421614)
    expect(parseChainId('0x66eee')).toBe(421614)
  })

  it('passes through valid numbers', () => {
    expect(parseChainId(421614)).toBe(421614)
  })

  it('returns null for unparseable or missing values', () => {
    expect(parseChainId(null)).toBeNull()
    expect(parseChainId(undefined)).toBeNull()
    expect(parseChainId('')).toBeNull()
    expect(parseChainId('eip155:')).toBeNull()
    expect(parseChainId('not-a-chain')).toBeNull()
    expect(parseChainId(1.5)).toBeNull()
  })

  it('never silently resolves an unknown value to the supported chain', () => {
    expect(isSupportedChain(parseChainId('garbage'))).toBe(false)
  })
})
