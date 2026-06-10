/**
 * Privy + viem wallet bridge (GAME-202 / GAME-204 / GAME-207).
 *
 * Mounts the single Privy connection surface at the app root and translates its
 * live signals into the `WalletSession` + actions exposed through
 * `WalletSessionContext`. It also builds the viem public and wallet clients used
 * by later contract phases and feeds their readiness into the write guard.
 *
 * Practice mode is never forced to connect: when `VITE_PRIVY_APP_ID` is unset
 * the provider renders children with a `config-missing` disconnected session, so
 * the bundle builds and the local game runs without any wallet secret.
 *
 * Privy is the ONLY connection UI here — no second RainbowKit/Web3Modal/
 * WalletConnect surface (`docs/network-and-wallet-requirements.md`).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  PrivyProvider,
  usePrivy,
  useWallets,
  type ConnectedWallet,
} from '@privy-io/react-auth'
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type PublicClient,
  type WalletClient,
} from 'viem'
import type { ErrorCode } from '../../copy/errors'
import { arbitrumSepolia, ARBITRUM_SEPOLIA_CHAIN_ID, parseChainId } from './network'
import { deriveWalletSession } from './session'
import { evaluateWriteReadiness } from './writeGuard'
import {
  WalletSessionContext,
  DISCONNECTED_CONTEXT,
  type WalletContextValue,
} from './WalletSessionContext'
import {
  buildPrivyConfig,
  getArbitrumSepoliaRpcUrl,
  getPrivyAppId,
} from './privyConfig'

const CONFIG_MISSING_CONTEXT: WalletContextValue = {
  ...DISCONNECTED_CONTEXT,
  configMissing: true,
}

/** The active external wallet for the session: the first connected EVM wallet. */
function activeWalletOf(wallets: ConnectedWallet[]): ConnectedWallet | null {
  return wallets.length > 0 ? wallets[0] : null
}

/**
 * Inner bridge — rendered inside `PrivyProvider` so it may use Privy hooks.
 * Derives the session, builds viem clients, and wires connection actions.
 */
function WalletSessionBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, connectWallet } = usePrivy()
  const { wallets } = useWallets()
  const wallet = activeWalletOf(wallets)

  const [connecting, setConnecting] = useState(false)
  const [lastError, setLastError] = useState<ErrorCode | null>(null)
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null)

  const chainId = parseChainId(wallet?.chainId)
  const address = wallet?.address ?? null

  // A single public client for reads; the transport never changes.
  const publicClient = useMemo<PublicClient>(
    () =>
      createPublicClient({
        chain: arbitrumSepolia,
        transport: http(getArbitrumSepoliaRpcUrl()),
      }),
    [],
  )

  // Build (and rebuild) the wallet client from the active wallet's EIP-1193
  // provider whenever the account or its chain changes. Cleared when no wallet.
  const walletKey = wallet ? `${wallet.address}:${wallet.chainId}` : null
  useEffect(() => {
    let cancelled = false
    if (!wallet) {
      setWalletClient(null)
      return
    }
    wallet
      .getEthereumProvider()
      .then((provider) => {
        if (cancelled) return
        setWalletClient(
          createWalletClient({ chain: arbitrumSepolia, transport: custom(provider) }),
        )
      })
      .catch(() => {
        if (!cancelled) setWalletClient(null)
      })
    return () => {
      cancelled = true
    }
    // walletKey captures address+chain identity; rebuild only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletKey])

  // Stop showing a connecting spinner once a wallet resolves.
  useEffect(() => {
    if (wallet) setConnecting(false)
  }, [wallet])

  const session = deriveWalletSession({
    ready,
    authenticated,
    address,
    chainId,
    connecting,
  })

  const { canWrite, blockedReason } = evaluateWriteReadiness({
    hasAddress: Boolean(session.address),
    chainId: session.chainId,
    publicClientReady: Boolean(publicClient),
    walletClientReady: Boolean(walletClient),
  })

  const connect = useCallback(() => {
    setLastError(null)
    setConnecting(true)
    // Privy owns wallet discovery + connection. `login` opens the connect UI;
    // with wallet-only login methods this is the wallet selection modal.
    try {
      if (authenticated) connectWallet()
      else login()
    } catch {
      setConnecting(false)
    }
  }, [authenticated, connectWallet, login])

  const disconnect = useCallback(() => {
    setLastError(null)
    setConnecting(false)
    void logout()
  }, [logout])

  const switchToArbitrumSepolia = useCallback(() => {
    if (!wallet) return
    setLastError(null)
    // Privy's wallet.switchChain throws on rejection / unsupported network. Any
    // failure is a recoverable "switch cancelled" — keep the wallet connected
    // (writes stay blocked) and allow another attempt. The active-wallet effect
    // rebuilds the wallet client once the chain actually changes.
    wallet.switchChain(ARBITRUM_SEPOLIA_CHAIN_ID).catch(() => {
      setLastError('chain-switch-rejected')
    })
  }, [wallet])

  const value: WalletContextValue = {
    session,
    writeBlockedReason: canWrite ? null : blockedReason,
    canWrite,
    lastError,
    configMissing: false,
    actions: { connect, disconnect, switchToArbitrumSepolia },
  }

  return (
    <WalletSessionContext.Provider value={value}>{children}</WalletSessionContext.Provider>
  )
}

/** App-root wallet provider. Wrap the router with this once. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const appId = getPrivyAppId()

  if (!appId) {
    // No Privy app id in this build: skip Privy entirely so practice/build/tests
    // work without a secret. On-chain routes show a recoverable config message.
    return (
      <WalletSessionContext.Provider value={CONFIG_MISSING_CONTEXT}>
        {children}
      </WalletSessionContext.Provider>
    )
  }

  return (
    <PrivyProvider appId={appId} config={buildPrivyConfig()}>
      <WalletSessionBridge>{children}</WalletSessionBridge>
    </PrivyProvider>
  )
}
