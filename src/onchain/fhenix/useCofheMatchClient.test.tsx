import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  CofheClientFactoryContext,
  useCofheMatchClient,
  type CofheClientFactory,
} from './useCofheMatchClient'
import { cofheScopeKey, type CofheMatchClient, type CofheScope } from './types'

const ADDRESS = '0xaaaa000000000000000000000000000000000001' as const

function scope(over: Partial<CofheScope> = {}): CofheScope {
  return {
    address: ADDRESS,
    chainId: 421614,
    deploymentId: 'arb-sepolia-v1',
    matchId: 7n,
    ...over,
  }
}

describe('useCofheMatchClient (GAME-604/605/610)', () => {
  it('initializes only when enabled and disposes on every account/chain/match scope change', async () => {
    const clients: CofheMatchClient[] = []
    const factory: CofheClientFactory = (config) => {
      const client: CofheMatchClient = {
        execution: 'worker',
        scopeKey: cofheScopeKey(config.scope),
        initialize: vi.fn(async () => {}),
        encryptFleet: vi.fn(async () => []),
        fetchDecryptProof: vi.fn(async () => ({ value: 0n, signature: '0x00' as const })),
        dispose: vi.fn(),
      }
      clients.push(client)
      return client
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CofheClientFactoryContext.Provider value={factory}>
        {children}
      </CofheClientFactoryContext.Provider>
    )
    const publicClient = {} as never
    const walletClient = {} as never

    const { result, rerender, unmount } = renderHook(
      ({ enabled, activeScope }: { enabled: boolean; activeScope: CofheScope }) =>
        useCofheMatchClient({
          enabled,
          scope: activeScope,
          publicClient,
          walletClient,
        }),
      {
        wrapper,
        initialProps: { enabled: false, activeScope: scope() },
      },
    )
    expect(result.current.status).toBe('idle')
    expect(clients).toHaveLength(0)

    rerender({ enabled: true, activeScope: scope() })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(clients).toHaveLength(1)

    rerender({ enabled: true, activeScope: scope({ matchId: 8n }) })
    await waitFor(() => expect(clients).toHaveLength(2))
    expect(clients[0].dispose).toHaveBeenCalledTimes(1)

    rerender({
      enabled: true,
      activeScope: scope({
        matchId: 8n,
        address: '0xbbbb000000000000000000000000000000000002',
      }),
    })
    await waitFor(() => expect(clients).toHaveLength(3))
    expect(clients[1].dispose).toHaveBeenCalledTimes(1)

    unmount()
    expect(clients[2].dispose).toHaveBeenCalledTimes(1)
  })
})
