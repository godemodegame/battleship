/**
 * App-root wallet provider (GAME-202 / GAME-808).
 *
 * A thin gate around the real Privy + viem bridge:
 * - when `VITE_PRIVY_APP_ID` is unset, Privy never loads — practice, builds,
 *   and tests run without any wallet secret and on-chain routes show a
 *   recoverable config-missing state;
 * - when configured, the heavy bridge module (@privy-io/react-auth + viem)
 *   is code-split and loaded lazily (GAME-808). Until it resolves, children
 *   render with the safe disconnected context in a 'connecting' state, so the
 *   practice route is interactive while wallet code streams in.
 */

import { lazy, Suspense, type ReactNode } from 'react'
import {
  WalletSessionContext,
  DISCONNECTED_CONTEXT,
  type WalletContextValue,
} from './WalletSessionContext'
import { getPrivyAppId } from './privyConfig'

const CONFIG_MISSING_CONTEXT: WalletContextValue = {
  ...DISCONNECTED_CONTEXT,
  configMissing: true,
}

const PrivyWalletBridge = lazy(() => import('./PrivyWalletBridge'))

/** Children under the default disconnected session while the bridge loads. */
function BridgeLoading({ children }: { children: ReactNode }) {
  return (
    <WalletSessionContext.Provider value={DISCONNECTED_CONTEXT}>
      {children}
    </WalletSessionContext.Provider>
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
    <Suspense fallback={<BridgeLoading>{children}</BridgeLoading>}>
      <PrivyWalletBridge appId={appId}>{children}</PrivyWalletBridge>
    </Suspense>
  )
}
