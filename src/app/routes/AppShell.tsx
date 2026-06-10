import { Outlet } from 'react-router-dom'

export function AppShell() {
  return (
    <div className="app-shell" data-testid="app-shell">
      <Outlet />
    </div>
  )
}
