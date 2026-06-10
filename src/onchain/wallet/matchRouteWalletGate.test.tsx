import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MatchRouteShell } from '../MatchRouteShell'
import {
  DISCONNECTED_CONTEXT,
  WalletSessionContext,
  type WalletContextValue,
} from './WalletSessionContext'
import type { WalletSession } from './session'

/**
 * Real (non-demo) match ids must gate on the live wallet session injected via
 * context — proving the route consumes the Privy-derived session, not the demo
 * URL harness. (GAME-204/205/207)
 */
function makeValue(over: Partial<WalletContextValue> = {}): WalletContextValue {
  return {
    ...DISCONNECTED_CONTEXT,
    actions: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      switchToArbitrumSepolia: vi.fn(),
      prepareHandoff: vi.fn(),
      clearHandoffRestore: vi.fn(),
    },
    ...over,
  }
}

function renderShell(value: WalletContextValue, matchId = 'real-1') {
  return render(
    <WalletSessionContext.Provider value={value}>
      <MemoryRouter initialEntries={[`/match/arb-sepolia-v1/${matchId}`]}>
        <Routes>
          <Route path="/match/:deploymentId/:matchId" element={<MatchRouteShell />} />
          <Route path="/practice" element={<div>practice</div>} />
        </Routes>
      </MemoryRouter>
    </WalletSessionContext.Provider>,
  )
}

const READY_SESSION: WalletSession = {
  status: 'ready',
  address: '0x9999000000000000000000000000000000009999',
  chainId: 421614,
  isCorrectChain: true,
  isConnected: true,
}

const WRONG_SESSION: WalletSession = {
  status: 'wrong-network',
  address: '0x9999000000000000000000000000000000009999',
  chainId: 1,
  isCorrectChain: false,
  isConnected: true,
}

describe('MatchRouteShell wallet gate (non-demo)', () => {
  it('requires a wallet and offers connect when disconnected', async () => {
    const connect = vi.fn()
    const value = makeValue({
      actions: {
        connect,
        disconnect: vi.fn(),
        switchToArbitrumSepolia: vi.fn(),
        prepareHandoff: vi.fn(),
        clearHandoffRestore: vi.fn(),
      },
    })
    renderShell(value)

    expect(screen.getByTestId('match-phase-kind').textContent).toContain('wallet-required')
    expect(screen.getByTestId('wallet-connect-prompt')).toBeTruthy()
    await userEvent.click(screen.getByTestId('wallet-connect'))
    expect(connect).toHaveBeenCalledOnce()
  })

  it('shows the wrong-network panel and wires the switch action', async () => {
    const switchToArbitrumSepolia = vi.fn()
    const value = makeValue({
      session: WRONG_SESSION,
      writeBlockedReason: 'wrong-network',
      actions: {
        connect: vi.fn(),
        disconnect: vi.fn(),
        switchToArbitrumSepolia,
        prepareHandoff: vi.fn(),
        clearHandoffRestore: vi.fn(),
      },
    })
    renderShell(value)

    expect(screen.getByTestId('match-phase-kind').textContent).toContain('wrong-network')
    expect(screen.getByTestId('wrong-network-panel')).toBeTruthy()
    await userEvent.click(screen.getByTestId('wrong-network-switch'))
    expect(switchToArbitrumSepolia).toHaveBeenCalledOnce()
  })

  it('surfaces a rejected switch as a recoverable error', () => {
    renderShell(
      makeValue({
        session: WRONG_SESSION,
        writeBlockedReason: 'wrong-network',
        lastError: 'chain-switch-rejected',
      }),
    )
    expect(screen.getByRole('alert').textContent).toBe(
      'Network switch cancelled. Try again to continue.',
    )
  })

  it('drives the phase from a ready session (non-participant sees waiting-for-opponent)', () => {
    renderShell(makeValue({ session: READY_SESSION, canWrite: true, writeBlockedReason: null }))
    expect(screen.getByTestId('match-phase-kind').textContent).toContain('waiting-for-opponent')
    expect(screen.getByTestId('wallet-address').textContent).toBe('0x9999…9999')
    expect(screen.queryByTestId('wallet-connect')).toBeNull()
  })

  it('shows a config-missing note instead of a connect button when Privy is unconfigured', () => {
    renderShell(makeValue({ configMissing: true }))
    expect(screen.getByTestId('wallet-config-missing')).toBeTruthy()
    expect(screen.queryByTestId('wallet-connect')).toBeNull()
    expect(screen.queryByTestId('wallet-connect-prompt')).toBeNull()
  })
})
