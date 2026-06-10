import { BrowserRouter, Routes } from 'react-router-dom'
import { appRoutes } from './routes/appRoutes'
import { WalletProvider } from '../onchain/wallet/WalletProvider'

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>{appRoutes}</Routes>
      </BrowserRouter>
    </WalletProvider>
  )
}
