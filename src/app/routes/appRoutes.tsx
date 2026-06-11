import { Route } from 'react-router-dom'
import { PracticeApp } from '../../practice/PracticeApp'
import { MatchRouteShell } from '../../onchain/MatchRouteShell'
import { EntryScreen } from '../../onchain/menu/EntryScreen'
import { MainMenuScreen } from '../../onchain/menu/MainMenuScreen'
import { CreateFriendMatchScreen } from '../../onchain/match/CreateFriendMatchScreen'
import { AppShell } from './AppShell'
import { NotFoundScreen } from './NotFoundScreen'

export const appRoutes = (
  <Route element={<AppShell />}>
    {/* Wallet-aware entry: onboarding while disconnected, menu when connected (GAME-504). */}
    <Route index element={<EntryScreen />} />
    <Route path="menu" element={<MainMenuScreen />} />
    <Route path="practice" element={<PracticeApp />} />
    <Route path="match/new" element={<CreateFriendMatchScreen />} />
    <Route path="match/:deploymentId/:matchId" element={<MatchRouteShell />} />
    <Route path="*" element={<NotFoundScreen />} />
  </Route>
)
