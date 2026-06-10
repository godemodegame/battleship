/**
 * Resume a pending wallet action after the browser regains focus following a
 * mobile wallet handoff (GAME-210).
 *
 * On `visibilitychange`/`focus`, if a pending action was recorded by
 * `savePendingWalletAction`, this hook calls `onReturn` once with the pending
 * action and then clears it. Callers use `onReturn` to run the recovery
 * checklist from `docs/network-and-wallet-requirements.md`: re-check the
 * Privy session and active wallet, re-check account and chain, refetch
 * contract state, and resume the correct UI phase.
 */

import { useEffect, useRef } from 'react'
import { clearPendingWalletAction, loadPendingWalletAction, type PendingWalletAction } from './mobileReturn'

export function useMobileWalletReturn(onReturn: (action: PendingWalletAction) => void): void {
  const onReturnRef = useRef(onReturn)
  onReturnRef.current = onReturn

  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleReturn = () => {
      if (document.visibilityState !== 'visible') return
      const pending = loadPendingWalletAction()
      if (!pending) return
      clearPendingWalletAction()
      onReturnRef.current(pending)
    }

    document.addEventListener('visibilitychange', handleReturn)
    window.addEventListener('focus', handleReturn)

    return () => {
      document.removeEventListener('visibilitychange', handleReturn)
      window.removeEventListener('focus', handleReturn)
    }
  }, [])
}
