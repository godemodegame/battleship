/**
 * Online/offline awareness (GAME-805).
 *
 * Wraps `navigator.onLine` + the online/offline events into a hook so the
 * shell can show a visible offline state. Contract reads already refetch on
 * the 'online' event (useMatchView); this hook only drives UI.
 */

import { useEffect, useState } from 'react'

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnline)

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return online
}
