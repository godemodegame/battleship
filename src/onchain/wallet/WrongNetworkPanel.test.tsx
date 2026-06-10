import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WrongNetworkPanel } from './WrongNetworkPanel'
import type { WalletSession } from './session'

const WRONG: WalletSession = {
  status: 'wrong-network',
  address: '0xabc0000000000000000000000000000000000001',
  chainId: 1,
  isCorrectChain: false,
  isConnected: true,
}

describe('WrongNetworkPanel', () => {
  it('makes Switch to Arbitrum Sepolia the primary action and keeps the account visible', async () => {
    const onSwitch = vi.fn()
    render(<WrongNetworkPanel session={WRONG} onSwitch={onSwitch} onDisconnect={vi.fn()} />)

    expect(screen.getByTestId('wrong-network-heading').textContent).toBe('Wrong Network')
    expect(screen.getByTestId('wrong-network-address').textContent).toContain('0xabc0…0001')

    const btn = screen.getByTestId('wrong-network-switch')
    expect(btn.textContent).toBe('Switch to Arbitrum Sepolia')
    await userEvent.click(btn)
    expect(onSwitch).toHaveBeenCalledOnce()
  })

  it('shows a recoverable message after a rejected switch and still allows retry', async () => {
    const onSwitch = vi.fn()
    render(
      <WrongNetworkPanel
        session={WRONG}
        onSwitch={onSwitch}
        onDisconnect={vi.fn()}
        switchError="chain-switch-rejected"
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('Network switch cancelled. Try again to continue.')
    // Retry is still possible.
    await userEvent.click(screen.getByTestId('wrong-network-switch'))
    expect(onSwitch).toHaveBeenCalledOnce()
  })

  it('disables the switch button while a switch is awaiting the wallet', () => {
    render(
      <WrongNetworkPanel session={WRONG} onSwitch={vi.fn()} onDisconnect={vi.fn()} switching />,
    )
    const btn = screen.getByTestId('wrong-network-switch') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.textContent).toBe('Switching…')
  })

  it('offers a disconnect / choose-another-wallet escape', async () => {
    const onDisconnect = vi.fn()
    render(<WrongNetworkPanel session={WRONG} onSwitch={vi.fn()} onDisconnect={onDisconnect} />)
    await userEvent.click(screen.getByTestId('wrong-network-disconnect'))
    expect(onDisconnect).toHaveBeenCalledOnce()
  })
})
