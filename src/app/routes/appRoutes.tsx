import { lazy, Suspense, type ReactNode } from 'react'
import { Route } from 'react-router-dom'
import { EntryScreen } from '../../onchain/menu/EntryScreen'
import { AppShell } from './AppShell'
import { NotFoundScreen } from './NotFoundScreen'

/**
 * GAME-808: route-level code splitting. Practice pulls the entire three.js
 * scene; the match routes pull the on-chain client stack. Each loads only on
 * its own route, so an invite-link visitor never downloads the 3D bundle and
 * the practice player never downloads contract code up front.
 */
const PracticeApp = lazy(async () => {
  const module = await import('../../practice/PracticeApp')
  return { default: module.PracticeApp }
})

const MatchRouteShell = lazy(async () => {
  const module = await import('../../onchain/MatchRouteShell')
  return { default: module.MatchRouteShell }
})

const CreateFriendMatchScreen = lazy(async () => {
  const module = await import('../../onchain/match/CreateFriendMatchScreen')
  return { default: module.CreateFriendMatchScreen }
})

function RouteFallback() {
  return (
    <div className="overlay home" data-testid="route-loading">
      <p className="status-sub">Loading…</p>
    </div>
  )
}

function suspended(node: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>
}

export const appRoutes = (
  <Route element={<AppShell />}>
    {/* Wallet-aware entry: onboarding while disconnected, otherwise straight to
        the practice hub which doubles as the menu (GAME-504). */}
    <Route index element={<EntryScreen />} />
    <Route path="practice" element={suspended(<PracticeApp />)} />
    <Route path="match/new" element={suspended(<CreateFriendMatchScreen />)} />
    <Route path="match/:deploymentId/:matchId" element={suspended(<MatchRouteShell />)} />
    <Route path="*" element={<NotFoundScreen />} />
  </Route>
)
