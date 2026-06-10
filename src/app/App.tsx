import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { PracticeApp } from '../practice/PracticeApp'
import { MatchRouteShell } from '../onchain/MatchRouteShell'
import { AppShell } from './routes/AppShell'
import { NotFoundScreen } from './routes/NotFoundScreen'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<PracticeApp />} />
          <Route path="practice" element={<PracticeApp />} />
          <Route path="match/:deploymentId/:matchId" element={<MatchRouteShell />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}