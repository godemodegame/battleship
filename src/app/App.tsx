import { BrowserRouter, Routes } from 'react-router-dom'
import { appRoutes } from './routes/appRoutes'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>{appRoutes}</Routes>
    </BrowserRouter>
  )
}
