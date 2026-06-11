import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes } from 'react-router-dom'
import { appRoutes } from './routes/appRoutes'
import { WalletProvider } from '../onchain/wallet/WalletProvider'

const E2EMockProviders =
  import.meta.env.VITE_E2E_MOCKS === '1'
    ? lazy(() => import('../onchain/e2e/E2EMockProviders'))
    : null

function RouterTree() {
  return (
    <BrowserRouter>
      <Routes>{appRoutes}</Routes>
    </BrowserRouter>
  )
}

function Providers({ children }: { children: ReactNode }) {
  if (E2EMockProviders) {
    return (
      <Suspense fallback={null}>
        <E2EMockProviders>{children}</E2EMockProviders>
      </Suspense>
    )
  }
  return <WalletProvider>{children}</WalletProvider>
}

export default function App() {
  return (
    <Providers>
      <RouterTree />
    </Providers>
  )
}
