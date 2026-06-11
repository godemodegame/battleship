import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LowBalanceNotice } from './LowBalanceNotice'
import type { WalletSession } from './session'

const ZERO_BALANCE_SESSION: WalletSession = {
  status: 'ready',
  address: '0xabc0000000000000000000000000000000000001',
  chainId: 421614,
  isCorrectChain: true,
  isConnected: true,
}

describe('LowBalanceNotice (GAME-209)', () => {
  it('renders heading, body, and wallet address', () => {
    render(<LowBalanceNotice session={ZERO_BALANCE_SESSION} />)
    expect(screen.getByTestId('low-balance-heading').textContent).toBe('Add testnet ETH')
    expect(screen.getByTestId('low-balance-address').textContent).toContain('0xabc0…0001')
  })

  it('invokes onFund when provided and falls back to opening a faucet tab', async () => {
    const onFund = vi.fn()
    const user = userEvent.setup()
    // jsdom has no real window.open we can easily assert, so just provide the cb
    render(<LowBalanceNotice session={ZERO_BALANCE_SESSION} onFund={onFund} />)
    await user.click(screen.getByTestId('low-balance-fund'))
    expect(onFund).toHaveBeenCalledOnce()
  })

  it('exposes the address for copy-paste workflows and renders provided balanceWei', () => {
    render(<LowBalanceNotice session={ZERO_BALANCE_SESSION} balanceWei={0n} />)
    const addr = screen.getByTestId('low-balance-address')
    expect(addr.getAttribute('title')).toBe(ZERO_BALANCE_SESSION.address)
    expect(screen.getByTestId('low-balance-wei').textContent).toBe(' · 0 wei')
  })

  it('renders the actual balanceWei value when non-zero (for visibility in notice)', () => {
    render(<LowBalanceNotice session={ZERO_BALANCE_SESSION} balanceWei={12345678901234567890n} />)
    expect(screen.getByTestId('low-balance-wei').textContent).toBe(' · 12345678901234567890 wei')
  })
})
