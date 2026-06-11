/**
 * GAME-804: degraded-state coverage — low balance warning, RPC failure
 * mapping, stale deployment detection, and the unsupported-wallet state.
 */

import { cleanup, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeReadError, decodeTxError } from './client/decodeError'
import type { PublicClientLike } from './client/battleshipClient'
import {
  CREATOR,
  INVITED,
  connectedWalletValue,
  makeFakeContract,
  renderApp,
} from './testSupport'
import { useDeploymentHealth } from './useDeploymentHealth'
import { CONTRACT_ADDRESS } from './testSupport'

vi.mock('../three/Scene', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas" />,
}))

const ROUTE = '/match/arb-sepolia-v1/1'

beforeEach(() => sessionStorage.clear())
afterEach(cleanup)

describe('RPC transport failures (GAME-804)', () => {
  it('maps read transport errors onto the rpc-unreachable code', () => {
    expect(decodeReadError({ name: 'HttpRequestError' })).toBe('rpc-unreachable')
    expect(decodeReadError({ name: 'TimeoutError' })).toBe('rpc-unreachable')
    expect(
      decodeReadError({ name: 'SomeWrapper', cause: { name: 'HttpRequestError' } }),
    ).toBe('rpc-unreachable')
    expect(
      decodeReadError({ name: 'TypeError', message: 'Failed to fetch' }),
    ).toBe('rpc-unreachable')
    // Non-transport read failures keep the generic recoverable code.
    expect(decodeReadError(new Error('boom'))).toBe('match-load-failed')
  })

  it('maps write transport errors onto rpc-unreachable, not unknown', () => {
    expect(decodeTxError({ name: 'HttpRequestError' })).toBe('rpc-unreachable')
    expect(decodeTxError(new Error('boom'))).toBe('unknown')
  })

  it('shows the retry action with the RPC message when the match read fails', async () => {
    const contract = makeFakeContract()
    contract.startBattle()
    const failing = {
      ...contract.readClient,
      getMatch: vi.fn().mockRejectedValue({ name: 'HttpRequestError' }),
    }
    renderApp({
      route: ROUTE,
      wallet: connectedWalletValue(CREATOR),
      clients: { ...contract.clientsFor(CREATOR), readClient: failing },
    })

    await waitFor(() => expect(screen.getByTestId('match-error')).toBeTruthy())
    expect(screen.getByTestId('match-error').textContent).toContain(
      'The network RPC is not responding',
    )
    expect(screen.getByTestId('match-retry')).toBeTruthy()
  })
})

describe('stale deployment detection (GAME-804)', () => {
  function clientWithCode(code: string | undefined) {
    return {
      getCode: vi.fn(async () => code),
    } as unknown as PublicClientLike
  }

  it('reports ok when bytecode exists', async () => {
    const client = clientWithCode('0x6080')
    const { result } = renderHook(() =>
      useDeploymentHealth({ publicClient: client, address: CONTRACT_ADDRESS }),
    )
    await waitFor(() => expect(result.current).toBe('ok'))
  })

  it('reports stale when the address has no bytecode', async () => {
    const client = clientWithCode('0x')
    const { result } = renderHook(() =>
      useDeploymentHealth({ publicClient: client, address: CONTRACT_ADDRESS }),
    )
    await waitFor(() => expect(result.current).toBe('stale'))
  })

  it('stays unknown when the probe fails or is unavailable', async () => {
    const failing = {
      getCode: vi.fn(async () => {
        throw new Error('rpc down')
      }),
    } as unknown as PublicClientLike
    const { result } = renderHook(() =>
      useDeploymentHealth({ publicClient: failing, address: CONTRACT_ADDRESS }),
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(result.current).toBe('unknown')

    const empty = {} as PublicClientLike
    const { result: noProbe } = renderHook(() =>
      useDeploymentHealth({ publicClient: empty, address: CONTRACT_ADDRESS }),
    )
    expect(noProbe.current).toBe('unknown')
  })

  it('renders the stale-deployment state on the match route', async () => {
    const contract = makeFakeContract()
    contract.startBattle()
    const wallet = connectedWalletValue(INVITED, {
      publicClient: clientWithCode('0x'),
    })
    renderApp({ route: ROUTE, wallet, clients: contract.clientsFor(INVITED) })

    await waitFor(() => expect(screen.getByTestId('stale-deployment')).toBeTruthy())
    expect(screen.getByTestId('stale-deployment').textContent).toContain('stale')
  })
})

describe('low balance warning (GAME-804)', () => {
  it('shows the non-blocking warning for a low (non-zero) balance', async () => {
    const contract = makeFakeContract()
    contract.startBattle()
    const wallet = connectedWalletValue(INVITED, {
      balanceStatus: 'low',
      balance: 10_000_000_000_000n,
    })
    renderApp({ route: ROUTE, wallet, clients: contract.clientsFor(INVITED) })

    await waitFor(() => expect(screen.getByTestId('low-balance-warning')).toBeTruthy())
    // The full blocking notice is reserved for zero balances.
    expect(screen.queryByTestId('low-balance-notice')).toBeNull()
    // The battle still renders; the warning does not strand the route.
    await waitFor(() => expect(screen.getByTestId('onchain-battle-panel')).toBeTruthy())
  })
})

describe('unsupported wallet state (GAME-804)', () => {
  it('renders the recoverable unsupported-wallet message', async () => {
    const contract = makeFakeContract()
    contract.startBattle()
    const wallet = connectedWalletValue(INVITED, {
      lastError: 'unsupported-wallet',
      canWrite: false,
      writeBlockedReason: 'client-not-ready',
    })
    renderApp({ route: ROUTE, wallet, clients: contract.clientsFor(INVITED) })

    await waitFor(() => expect(screen.getByTestId('unsupported-wallet')).toBeTruthy())
    expect(screen.getByTestId('unsupported-wallet').textContent).toContain(
      'choose another wallet',
    )
  })
})
