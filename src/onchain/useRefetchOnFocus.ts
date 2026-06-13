import { useEffect } from 'react'

/**
 * GAME-510: refetch when the tab regains focus/visibility or comes back online.
 *
 * Shared by the match-list, match-view, and open-match hooks. A no-op while
 * `enabled` is false (nothing to enumerate / no match bound yet), so the
 * window/document listeners are only attached once there is data to refresh.
 */
export function useRefetchOnFocus(refetch: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch()
    }
    window.addEventListener('focus', refetch)
    window.addEventListener('online', refetch)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refetch)
      window.removeEventListener('online', refetch)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, refetch])
}
