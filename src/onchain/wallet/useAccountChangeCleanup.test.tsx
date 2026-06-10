import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WalletContext, type WalletConnectionValue, UNCONFIGURED_WALLET_VALUE } from './WalletContext'
import { useAccountChangeCleanup, type WalletChangeReason } from './useAccountChangeCleanup'

const ADDRESS_A = '0x1111111111111111111111111111111111111111' as const
const ADDRESS_B = '0x2222222222222222222222222222222222222222' as const

function makeValue(overrides: Partial<WalletConnectionValue>): WalletConnectionValue {
  return { ...UNCONFIGURED_WALLET_VALUE, configured: true, ready: true, ...overrides }
}

function Probe({ value, onCleanup }: { value: WalletConnectionValue; onCleanup: (r: WalletChangeReason) => void }) {
  return (
    <WalletContext.Provider value={value}>
      <Inner onCleanup={onCleanup} />
    </WalletContext.Provider>
  )
}

function Inner({ onCleanup }: { onCleanup: (r: WalletChangeReason) => void }) {
  useAccountChangeCleanup(onCleanup)
  return null
}

describe('useAccountChangeCleanup', () => {
  it('does not fire on initial mount', () => {
    const onCleanup = vi.fn()
    render(<Probe value={makeValue({ authenticated: true, address: ADDRESS_A, chainId: 421614 })} onCleanup={onCleanup} />)
    expect(onCleanup).not.toHaveBeenCalled()
  })

  it('fires account-changed when the address changes', () => {
    const onCleanup = vi.fn()
    const initial = makeValue({ authenticated: true, address: ADDRESS_A, chainId: 421614 })
    const next = makeValue({ authenticated: true, address: ADDRESS_B, chainId: 421614 })

    const { rerender } = render(<Probe value={initial} onCleanup={onCleanup} />)
    rerender(<Probe value={next} onCleanup={onCleanup} />)

    expect(onCleanup).toHaveBeenCalledWith('account-changed')
  })

  it('fires chain-changed when only the chain id changes', () => {
    const onCleanup = vi.fn()
    const initial = makeValue({ authenticated: true, address: ADDRESS_A, chainId: 421614 })
    const next = makeValue({ authenticated: true, address: ADDRESS_A, chainId: 1 })

    const { rerender } = render(<Probe value={initial} onCleanup={onCleanup} />)
    rerender(<Probe value={next} onCleanup={onCleanup} />)

    expect(onCleanup).toHaveBeenCalledWith('chain-changed')
  })

  it('fires session-expired when authentication is lost', () => {
    const onCleanup = vi.fn()
    const initial = makeValue({ authenticated: true, address: ADDRESS_A, chainId: 421614 })
    const next = makeValue({ authenticated: false, address: null, chainId: null })

    const { rerender } = render(<Probe value={initial} onCleanup={onCleanup} />)
    rerender(<Probe value={next} onCleanup={onCleanup} />)

    expect(onCleanup).toHaveBeenCalledWith('session-expired')
  })

  it('does not fire while the session is not ready', () => {
    const onCleanup = vi.fn()
    const initial = makeValue({ ready: false, authenticated: true, address: ADDRESS_A, chainId: 421614 })
    const next = makeValue({ ready: false, authenticated: true, address: ADDRESS_B, chainId: 421614 })

    const { rerender } = render(<Probe value={initial} onCleanup={onCleanup} />)
    rerender(<Probe value={next} onCleanup={onCleanup} />)

    expect(onCleanup).not.toHaveBeenCalled()
  })
})
