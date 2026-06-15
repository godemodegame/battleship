import { describe, expect, it } from 'vitest'
import { isEmbeddedWallet, selectActiveWallet, type WalletLike } from './activeWallet'

const injected: WalletLike = { address: '0xinjected', walletClientType: 'metamask' }
const embedded: WalletLike = { address: '0xembedded', walletClientType: 'privy' }

describe('isEmbeddedWallet', () => {
  it('is true only for the Privy embedded wallet', () => {
    expect(isEmbeddedWallet(embedded)).toBe(true)
    expect(isEmbeddedWallet(injected)).toBe(false)
    expect(isEmbeddedWallet(null)).toBe(false)
    expect(isEmbeddedWallet(undefined)).toBe(false)
  })
})

describe('selectActiveWallet', () => {
  it('returns null when no wallet is connected', () => {
    expect(selectActiveWallet([])).toBeNull()
  })

  it('prefers the embedded wallet even when an injected wallet is listed first', () => {
    expect(selectActiveWallet([injected, embedded])).toBe(embedded)
  })

  it('falls back to the first wallet when none is embedded', () => {
    const second: WalletLike = { address: '0xsecond', walletClientType: 'walletconnect' }
    expect(selectActiveWallet([injected, second])).toBe(injected)
  })

  it('returns the embedded wallet when it is the only one', () => {
    expect(selectActiveWallet([embedded])).toBe(embedded)
  })
})
