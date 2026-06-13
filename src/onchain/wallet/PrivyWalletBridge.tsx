/**
 * Privy + viem wallet bridge (GAME-202 / GAME-204 / GAME-207 / GAME-808).
 *
 * Mounts the single Privy connection surface at the app root and translates its
 * live signals into the `WalletSession` + actions exposed through
 * `WalletSessionContext`. It also builds the viem public and wallet clients used
 * by later contract phases and feeds their readiness into the write guard.
 *
 * This module carries the heavy wallet dependencies (@privy-io/react-auth and
 * viem) and is loaded lazily by `WalletProvider` (GAME-808), so the initial
 * bundle ships without them. Privy is the ONLY connection UI here — no second
 * RainbowKit/Web3Modal/WalletConnect surface
 * (`docs/network-and-wallet-requirements.md`).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  PrivyProvider,
  usePrivy,
  useSendTransaction,
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
import { isEmbeddedWallet, selectActiveWallet } from './activeWallet'
import { deriveWalletSession } from './session'
import { evaluateWriteReadiness } from './writeGuard'
import {
  WalletSessionContext,
  type WalletContextValue,
} from './WalletSessionContext'
import { buildPrivyConfig, getArbitrumSepoliaRpcUrl } from './privyConfig'
import { clearHandoffIntent, consumeHandoffIntent, saveHandoffIntent } from './handoff'
import { LOW_BALANCE_THRESHOLD_WEI } from './LowBalanceNotice'
import { clearAllPendingTx } from '../client/pendingTxStore'

/**
 * The active wallet for the session. Prefers the Privy embedded wallet (so
 * social/email users land on the gas-sponsorable wallet) and falls back to the
 * first connected wallet for external-wallet users. See `activeWallet.ts`.
 */
function activeWalletOf(wallets: ConnectedWallet[]): ConnectedWallet | null {
  return selectActiveWallet(wallets)
}

/**
 * Inner bridge — rendered inside `PrivyProvider` so it may use Privy hooks.
 * Derives the session, builds viem clients, and wires connection actions.
 */
function WalletSessionBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, connectWallet } = usePrivy()
  const { wallets } = useWallets()
  // Gasless sends for embedded wallets (EIP-7702). The hook is always called
  // (rules of hooks); `sendTransaction` is only invoked for embedded wallets.
  const { sendTransaction } = useSendTransaction()
  // An injected wallet stays in `wallets` after logout (the extension's
  // connection to the site outlives the Privy session). Only an authenticated
  // session has an active wallet; otherwise Disconnect would appear to do
  // nothing while the wallet client, balance, and account epoch kept the old
  // account alive (GAME-204/208).
  const wallet = ready && authenticated ? activeWalletOf(wallets) : null

  const [connecting, setConnecting] = useState(false)
  const [lastError, setLastError] = useState<ErrorCode | null>(null)
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null)
  const [balance, setBalance] = useState<bigint | null>(null)
  const [handoffRestored, setHandoffRestored] = useState(false)
  const [accountEpoch, setAccountEpoch] = useState(0)

  const prevAddressRef = useRef<string | null>(null)

  const chainId = parseChainId(wallet?.chainId)
  const address = wallet?.address ?? null
  // A Privy embedded wallet (social/email sign-in) is the only kind whose
  // writes we sponsor. Its address is unchanged from the EOA the contract sees
  // as msg.sender and that CoFHE binds permits to, so sponsorship is transparent.
  const gasSponsored = isEmbeddedWallet(wallet)

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
        if (!cancelled) {
          setWalletClient(null)
          // GAME-804: the connected wallet exposes no usable EIP-1193 provider
          // in this browser. Writes stay blocked; surface a recoverable state.
          setLastError('unsupported-wallet')
        }
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

  // Fetch balance for funding guidance when we have a usable address on the
  // correct chain. Re-fetches when address or chain readiness changes.
  // Balance is advisory (GAME-209); it does not hard-block the write guard.
  // Sponsored (embedded) sessions never pay gas, so balance is irrelevant — skip
  // the fetch entirely. balance stays null, funding UX never triggers.
  const readyForBalance =
    Boolean(address && isSupportedChainForBalance(chainId)) && !gasSponsored
  const balanceKey = readyForBalance ? address : null
  useEffect(() => {
    let cancelled = false
    if (!balanceKey || !publicClient) {
      setBalance(null)
      return
    }
    publicClient
      .getBalance({ address: balanceKey as `0x${string}` })
      .then((b) => {
        if (!cancelled) setBalance(b)
      })
      .catch(() => {
        if (!cancelled) setBalance(null)
      })
    return () => {
      cancelled = true
    }
  }, [balanceKey, publicClient])

  function isSupportedChainForBalance(id: number | null): boolean {
    return id === ARBITRUM_SEPOLIA_CHAIN_ID
  }

  // GAME-208: account-change and session-expiry cleanup.
  // When the active EVM address changes (or we fully disconnect), bump the epoch
  // so account-scoped consumers can reset forms, selected targets, CoFHE state, etc.
  // Also clear lastError so a new account does not inherit a previous rejection.
  useEffect(() => {
    const prev = prevAddressRef.current
    const next = address ?? null
    if (prev !== next) {
      prevAddressRef.current = next
      setLastError(null)
      setBalance(null)
      // increment epoch for any consumer that keys state on it
      setAccountEpoch((e) => e + 1)
      if (!next) {
        // full disconnect / session expiry path: also clear handoff markers and
        // any persisted pending-write records (GAME-802/803 hygiene).
        clearHandoffIntent()
        clearAllPendingTx()
      }
    }
  }, [address])

  // GAME-210: mobile wallet handoff restore on visibility/focus return.
  // If a marker exists when the page becomes visible again (wallet app returned
  // or tab woke from suspension), consume it and raise the transient signal.
  // The consuming route (e.g. MatchRouteShell) can then ensure it is on the
  // right path and drive refetches. The signal is cleared explicitly by UI.
  useEffect(() => {
    const onResume = () => {
      const target = consumeHandoffIntent()
      if (target) {
        setHandoffRestored(true)
        // If the current location does not match the saved target, navigate.
        // Use a microtask to avoid racing with initial render.
        if (typeof window !== 'undefined') {
          const current = window.location.pathname + window.location.search
          if (current !== target && target.startsWith('/match/')) {
            // Safe navigation via history API; router will pick up the change.
            // We avoid importing useNavigate here (provider is above <BrowserRouter>).
            window.history.replaceState(null, '', target)
            // Let a popstate listener or route effect react; for safety also dispatch.
            window.dispatchEvent(new PopStateEvent('popstate'))
          }
        }
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') onResume()
    }
    window.addEventListener('focus', onResume)
    document.addEventListener('visibilitychange', handleVisibility)
    // Also run once on mount in case we resumed while the listener was not yet attached.
    // (covers hard reload after a prior handoff in some mobile browsers)
    onResume()
    return () => {
      window.removeEventListener('focus', onResume)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

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

  const balanceStatus: 'unknown' | 'zero' | 'low' | 'ok' =
    balance === null
      ? 'unknown'
      : balance === 0n
        ? 'zero'
        : balance < LOW_BALANCE_THRESHOLD_WEI
          ? 'low'
          : 'ok'

  const connect = useCallback(() => {
    setLastError(null)
    setConnecting(true)
    // Before we may hand off on mobile, record the current on-chain route so we
    // can return the user to it after the wallet app (GAME-210).
    try {
      if (typeof window !== 'undefined') {
        const p = window.location.pathname + window.location.search
        if (p.startsWith('/match/')) saveHandoffIntent(p)
      }
    } catch {}
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
    clearHandoffIntent()
    clearAllPendingTx()
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

  const prepareHandoff = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        const p = window.location.pathname + window.location.search
        if (p.startsWith('/match/')) saveHandoffIntent(p)
      }
    } catch {}
  }, [])

  const clearHandoffRestore = useCallback(() => {
    setHandoffRestored(false)
  }, [])

  // Gasless send for the embedded wallet: encode-free request in, broadcast
  // hash out. Privy sponsors the gas (EIP-7702) when the dashboard "App pays"
  // policy covers Arbitrum Sepolia. The wallet (and thus msg.sender) is the
  // same EOA, so the contract and CoFHE see no difference from a paid write.
  const sponsoredSend = useCallback(
    async ({
      to,
      data,
      value,
    }: {
      to: `0x${string}`
      data: `0x${string}`
      value?: bigint
    }): Promise<`0x${string}`> => {
      const { hash } = await sendTransaction(
        { to, data, value, chainId: ARBITRUM_SEPOLIA_CHAIN_ID },
        { sponsor: true },
      )
      return hash
    },
    [sendTransaction],
  )

  const value: WalletContextValue = {
    session,
    writeBlockedReason: canWrite ? null : blockedReason,
    canWrite,
    lastError,
    configMissing: false,
    balance,
    balanceStatus,
    handoffRestored,
    accountEpoch,
    // Typed contract clients are built over these (GAME-502). The structural
    // *Like types are the subset of the viem API the client layer uses.
    publicClient: publicClient as unknown as WalletContextValue['publicClient'],
    walletClient: walletClient as unknown as WalletContextValue['walletClient'],
    gasSponsored,
    // Only expose the sponsored sender for embedded wallets; external-wallet
    // sessions keep paying their own gas via the viem wallet client.
    sponsoredSend: gasSponsored ? sponsoredSend : undefined,
    actions: {
      connect,
      disconnect,
      switchToArbitrumSepolia,
      prepareHandoff,
      clearHandoffRestore,
    },
  }

  return (
    <WalletSessionContext.Provider value={value}>{children}</WalletSessionContext.Provider>
  )
}

/**
 * The configured Privy provider + session bridge. Default export so the thin
 * `WalletProvider` can `lazy()`-load this whole dependency tree (GAME-808).
 */
export default function PrivyWalletBridge({
  appId,
  children,
}: {
  appId: string
  children: ReactNode
}) {
  return (
    <PrivyProvider appId={appId} config={buildPrivyConfig()}>
      <WalletSessionBridge>{children}</WalletSessionBridge>
    </PrivyProvider>
  )
}
