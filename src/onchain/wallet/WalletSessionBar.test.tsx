import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WalletSessionBar } from './WalletSessionBar'
import { DISCONNECTED_SESSION, type WalletSession } from './session'

const READY: WalletSession = {
  status: 'ready',
  address: '0xabc0000000000000000000000000000000000001',
  chainId: 421614,
  isCorrectChain: true,
  isConnected: true,
}

describe('WalletSessionBar', () => {
  it('shows a connect button when disconnected', async () => {
    const onConnect = vi.fn()
    render(
      <WalletSessionBar
        session={DISCONNECTED_SESSION}
        onConnect={onConnect}
        onDisconnect={vi.fn()}
      />,
    )
    const btn = screen.getByTestId('wallet-connect')
    expect(btn.textContent).toBe('Connect Wallet')
    await userEvent.click(btn)
    expect(onConnect).toHaveBeenCalledOnce()
  })

  it('disables and relabels the button while connecting', () => {
    render(
      <WalletSessionBar
        session={{ ...DISCONNECTED_SESSION, status: 'connecting' }}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    )
    const btn = screen.getByTestId('wallet-connect') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.textContent).toBe('Connecting…')
  })

  it('shows the truncated address, network badge, and disconnect when connected', async () => {
    const onDisconnect = vi.fn()
    render(
      <WalletSessionBar session={READY} onConnect={vi.fn()} onDisconnect={onDisconnect} />,
    )
    expect(screen.getByTestId('wallet-address').textContent).toBe('0xabc0…0001')
    expect(screen.getByTestId('network-badge').textContent).toBe('Arbitrum Sepolia')
    await userEvent.click(screen.getByTestId('wallet-disconnect'))
    expect(onDisconnect).toHaveBeenCalledOnce()
  })

  it('flags a wrong-network connection on the badge but keeps the account visible', () => {
    render(
      <WalletSessionBar
        session={{ ...READY, status: 'wrong-network', chainId: 1, isCorrectChain: false }}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    )
    expect(screen.getByTestId('network-badge').textContent).toBe('Wrong Network')
    expect(screen.getByTestId('wallet-address')).toBeTruthy()
  })

  it('shows a config-missing note and no connect button when Privy is unconfigured', () => {
    render(
      <WalletSessionBar
        session={DISCONNECTED_SESSION}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        configMissing
      />,
    )
    expect(screen.getByTestId('wallet-config-missing')).toBeTruthy()
    expect(screen.queryByTestId('wallet-connect')).toBeNull()
  })
})
