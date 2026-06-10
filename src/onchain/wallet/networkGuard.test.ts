import { describe, expect, it } from 'vitest'
import { canSubmitWrite, resolveWalletGuard, type WalletGuardInput } from './networkGuard'
import { ARBITRUM_SEPOLIA_CHAIN_ID } from './chain'

const ADDRESS = '0x1111111111111111111111111111111111111111' as const

const READY_INPUT: WalletGuardInput = {
  configured: true,
  ready: true,
  authenticated: true,
  address: ADDRESS,
  chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
  hasPublicClient: true,
  hasWalletClient: true,
}

describe('resolveWalletGuard', () => {
  it('returns not-configured when no Privy app id is set', () => {
    expect(resolveWalletGuard({ ...READY_INPUT, configured: false })).toEqual({
      kind: 'not-configured',
    })
  })

  it('returns loading while the Privy session is restoring', () => {
    expect(resolveWalletGuard({ ...READY_INPUT, ready: false })).toEqual({ kind: 'loading' })
  })

  it('returns wallet-required when not authenticated', () => {
    expect(
      resolveWalletGuard({ ...READY_INPUT, authenticated: false, address: null }),
    ).toEqual({ kind: 'wallet-required' })
  })

  it('returns wallet-required when authenticated but no address is resolved', () => {
    expect(resolveWalletGuard({ ...READY_INPUT, address: null })).toEqual({
      kind: 'wallet-required',
    })
  })

  it('returns wrong-network when the active chain is not Arbitrum Sepolia', () => {
    expect(resolveWalletGuard({ ...READY_INPUT, chainId: 1 })).toEqual({
      kind: 'wrong-network',
      chainId: 1,
    })
  })

  it('returns wrong-network when the chain id is unknown', () => {
    expect(resolveWalletGuard({ ...READY_INPUT, chainId: null })).toEqual({
      kind: 'wrong-network',
      chainId: null,
    })
  })

  it('returns client-unavailable when clients could not be created on the right chain', () => {
    expect(resolveWalletGuard({ ...READY_INPUT, hasWalletClient: false })).toEqual({
      kind: 'client-unavailable',
    })
    expect(resolveWalletGuard({ ...READY_INPUT, hasPublicClient: false })).toEqual({
      kind: 'client-unavailable',
    })
  })

  it('returns ready with the address once every check passes', () => {
    expect(resolveWalletGuard(READY_INPUT)).toEqual({ kind: 'ready', address: ADDRESS })
  })
})

describe('canSubmitWrite', () => {
  it('is true only for the ready guard state', () => {
    expect(canSubmitWrite(resolveWalletGuard(READY_INPUT))).toBe(true)
    expect(canSubmitWrite(resolveWalletGuard({ ...READY_INPUT, configured: false }))).toBe(false)
    expect(canSubmitWrite(resolveWalletGuard({ ...READY_INPUT, chainId: 1 }))).toBe(false)
    expect(
      canSubmitWrite(resolveWalletGuard({ ...READY_INPUT, authenticated: false, address: null })),
    ).toBe(false)
  })
})
