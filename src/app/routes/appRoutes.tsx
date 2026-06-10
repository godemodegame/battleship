import { Route } from 'react-router-dom'
import { PracticeApp } from '../../practice/PracticeApp'
import { MatchRouteShell } from '../../onchain/MatchRouteShell'
import { AppShell } from './AppShell'
import { NotFoundScreen } from './NotFoundScreen'

export const appRoutes = (
  <Route element={<AppShell />}>
    <Route index element={<PracticeApp />} />
    <Route path="practice" element={<PracticeApp />} />
    <Route path="match/:deploymentId/:matchId" element={<MatchRouteShell />} />
    <Route path="*" element={<NotFoundScreen />} />
  </Route>
)