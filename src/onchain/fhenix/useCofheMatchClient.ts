import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type {
  PublicClientLike,
  WalletClientLike,
} from '../client/battleshipClient'
import { createCofheMatchClient, type CofheClientConfig } from './cofheClient'
import { cofheScopeKey, type CofheMatchClient, type CofheScope } from './types'

export type CofheClientFactory = (config: CofheClientConfig) => CofheMatchClient

export const CofheClientFactoryContext =
  createContext<CofheClientFactory>(createCofheMatchClient)

export interface CofheClientState {
  status: 'idle' | 'initializing' | 'ready' | 'error'
  client: CofheMatchClient | null
  error: string | null
}

export function useCofheMatchClient(params: {
  enabled: boolean
  scope: CofheScope | null
  publicClient: PublicClientLike | null
  walletClient: WalletClientLike | null
}): CofheClientState {
  const { enabled, scope, publicClient, walletClient } = params
  const factory = useContext(CofheClientFactoryContext)
  const scopeKey = scope ? cofheScopeKey(scope) : null
  const [state, setState] = useState<CofheClientState>({
    status: 'idle',
    client: null,
    error: null,
  })

  const config = useMemo(
    () =>
      enabled && scope && publicClient && walletClient
        ? { scope, publicClient, walletClient }
        : null,
    [enabled, scope, scopeKey, publicClient, walletClient],
  )

  useEffect(() => {
    if (!config) {
      setState({ status: 'idle', client: null, error: null })
      return
    }

    const client = factory(config)
    let active = true
    setState({ status: 'initializing', client: null, error: null })
    void client.initialize().then(
      () => {
        if (active) setState({ status: 'ready', client, error: null })
      },
      (error: unknown) => {
        client.dispose()
        if (active) {
          setState({
            status: 'error',
            client: null,
            error: error instanceof Error ? error.message : 'CoFHE initialization failed',
          })
        }
      },
    )

    return () => {
      active = false
      client.dispose()
    }
  }, [factory, config])

  return state
}
