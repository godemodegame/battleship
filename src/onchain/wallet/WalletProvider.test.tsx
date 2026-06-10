import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WalletProvider } from './WalletProvider'
import { useWalletConnection } from './WalletContext'

function Probe() {
  const connection = useWalletConnection()
  return (
    <div data-testid="probe" data-configured={String(connection.configured)} data-ready={String(connection.ready)}>
      {connection.address ?? 'no-address'}
    </div>
  )
}

describe('WalletProvider', () => {
  it('provides an unconfigured context when VITE_PRIVY_APP_ID is not set', () => {
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>,
    )

    const probe = screen.getByTestId('probe')
    expect(probe.dataset.configured).toBe('false')
    expect(probe.textContent).toBe('no-address')
  })
})
