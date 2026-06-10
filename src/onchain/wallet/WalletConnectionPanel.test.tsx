import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WalletConnectionPanel } from './WalletConnectionPanel'
import { WalletContext, type WalletConnectionValue, UNCONFIGURED_WALLET_VALUE } from './WalletContext'
import type { WalletGuardState } from './networkGuard'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const mockUseNetworkGuard = vi.fn()
const mockUseBalanceCheck = vi.fn()

vi.mock('./useNetworkGuard', () => ({
  useNetworkGuard: () => mockUseNetworkGuard(),
}))

vi.mock('./useBalanceCheck', () => ({
  useBalanceCheck: () => mockUseBalanceCheck(),
}))

function setGuard(guard: WalletGuardState, extra: Partial<ReturnType<typeof mockUseNetworkGuard>> = {}) {
  mockUseNetworkGuard.mockReturnValue({
    guard,
    switching: false,
    lastSwitchResult: null,
    switchNetwork: vi.fn(),
    ...extra,
  })
}

function renderPanel(value: WalletConnectionValue) {
  return render(
    <WalletContext.Provider value={value}>
      <WalletConnectionPanel />
    </WalletContext.Provider>,
  )
}

describe('WalletConnectionPanel', () => {
  it('shows a not-configured message when Privy is not set up', () => {
    setGuard({ kind: 'not-configured' })
    mockUseBalanceCheck.mockReturnValue({ status: null, loading: false, error: false })

    renderPanel(UNCONFIGURED_WALLET_VALUE)

    expect(screen.getByTestId('wallet-panel').dataset.walletState).toBe('not-configured')
    expect(screen.getByText(/not configured/i)).toBeTruthy()
  })

  it('shows a connect button when configured but not authenticated', async () => {
    const login = vi.fn()
    setGuard({ kind: 'wallet-required' })
    mockUseBalanceCheck.mockReturnValue({ status: null, loading: false, error: false })

    renderPanel({
      ...UNCONFIGURED_WALLET_VALUE,
      configured: true,
      ready: true,
      login,
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Connect Wallet' }))
    expect(login).toHaveBeenCalled()
  })

  it('shows the wrong-network state with a switch action', async () => {
    const switchNetwork = vi.fn()
    setGuard({ kind: 'wrong-network', chainId: 1 }, { switchNetwork })
    mockUseBalanceCheck.mockReturnValue({ status: null, loading: false, error: false })

    renderPanel({
      ...UNCONFIGURED_WALLET_VALUE,
      configured: true,
      ready: true,
      authenticated: true,
      address: ADDRESS,
      chainId: 1,
    })

    expect(screen.getByTestId('wallet-wrong-network')).toBeTruthy()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Switch to Arbitrum Sepolia' }))
    expect(switchNetwork).toHaveBeenCalled()
  })

  it('shows a switch-cancelled message after a rejected switch', () => {
    setGuard({ kind: 'wrong-network', chainId: 1 }, { lastSwitchResult: 'rejected' })
    mockUseBalanceCheck.mockReturnValue({ status: null, loading: false, error: false })

    renderPanel({
      ...UNCONFIGURED_WALLET_VALUE,
      configured: true,
      ready: true,
      authenticated: true,
      address: ADDRESS,
      chainId: 1,
    })

    expect(screen.getByTestId('wallet-switch-rejected')).toBeTruthy()
  })

  it('shows the address and a low-balance funding hint when ready', () => {
    setGuard({ kind: 'ready', address: ADDRESS })
    mockUseBalanceCheck.mockReturnValue({
      status: { balance: 0n, formatted: '0', isLow: true },
      loading: false,
      error: false,
    })

    renderPanel({
      ...UNCONFIGURED_WALLET_VALUE,
      configured: true,
      ready: true,
      authenticated: true,
      address: ADDRESS,
      chainId: 421614,
    })

    expect(screen.getByTestId('wallet-address').textContent).toContain('0x1234')
    expect(screen.getByTestId('wallet-low-balance')).toBeTruthy()
  })

  it('lets a connected player disconnect', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    setGuard({ kind: 'ready', address: ADDRESS })
    mockUseBalanceCheck.mockReturnValue({
      status: { balance: 1_000_000_000_000_000_000n, formatted: '1', isLow: false },
      loading: false,
      error: false,
    })

    renderPanel({
      ...UNCONFIGURED_WALLET_VALUE,
      configured: true,
      ready: true,
      authenticated: true,
      address: ADDRESS,
      chainId: 421614,
      logout,
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(logout).toHaveBeenCalled()
  })
})
