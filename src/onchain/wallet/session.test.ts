import { describe, expect, it } from 'vitest'
import { deriveWalletSession, DISCONNECTED_SESSION, type RawWalletState } from './session'

const ADDR = '0xAbC0000000000000000000000000000000000001'

function raw(over: Partial<RawWalletState> = {}): RawWalletState {
  return {
    ready: true,
    authenticated: true,
    address: ADDR,
    chainId: 421614,
    ...over,
  }
}

describe('deriveWalletSession', () => {
  it('is disconnected until Privy is ready', () => {
    expect(deriveWalletSession(raw({ ready: false }))).toEqual(DISCONNECTED_SESSION)
  })

  it('is disconnected with no active wallet', () => {
    const s = deriveWalletSession(raw({ address: null }))
    expect(s.status).toBe('disconnected')
    expect(s.isConnected).toBe(false)
    expect(s.address).toBeNull()
  })

  it('reports connecting while a selection flow is in flight and no address yet', () => {
    const s = deriveWalletSession(raw({ address: null, connecting: true }))
    expect(s.status).toBe('connecting')
    expect(s.isConnected).toBe(false)
  })

  it('normalizes the address to lowercase when ready', () => {
    const s = deriveWalletSession(raw())
    expect(s.address).toBe(ADDR.toLowerCase())
    expect(s.status).toBe('ready')
    expect(s.isCorrectChain).toBe(true)
    expect(s.isConnected).toBe(true)
  })

  it('keeps the account visible but flags wrong-network off 421614', () => {
    const s = deriveWalletSession(raw({ chainId: 1 }))
    expect(s.status).toBe('wrong-network')
    expect(s.isConnected).toBe(true)
    expect(s.isCorrectChain).toBe(false)
    expect(s.address).toBe(ADDR.toLowerCase())
    expect(s.chainId).toBe(1)
  })

  it('treats an unknown chain id as wrong-network, never ready', () => {
    const s = deriveWalletSession(raw({ chainId: null }))
    expect(s.status).toBe('wrong-network')
    expect(s.isCorrectChain).toBe(false)
  })

  it('rejects malformed addresses (no half-connected ready state)', () => {
    expect(deriveWalletSession(raw({ address: '0x123' })).status).toBe('disconnected')
    expect(deriveWalletSession(raw({ address: 'not-hex' })).status).toBe('disconnected')
  })

  it('does not treat authenticated alone as connected', () => {
    const s = deriveWalletSession(raw({ authenticated: true, address: null }))
    expect(s.isConnected).toBe(false)
  })

  it('ignores a lingering injected-wallet address after logout (disconnect works)', () => {
    // After Privy logout the extension may still report the wallet; without a
    // session the address must not count as connected, or Disconnect appears
    // to do nothing.
    const s = deriveWalletSession(raw({ authenticated: false }))
    expect(s).toEqual(DISCONNECTED_SESSION)
  })

  it('still reports connecting during a login flow with a stale address visible', () => {
    const s = deriveWalletSession(raw({ authenticated: false, connecting: true }))
    expect(s.status).toBe('connecting')
    expect(s.isConnected).toBe(false)
    expect(s.address).toBeNull()
  })
})
