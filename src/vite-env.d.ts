/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Privy application id (GAME-201). Absent in builds without wallet config. */
  readonly VITE_PRIVY_APP_ID?: string
  /** Optional Arbitrum Sepolia RPC override; falls back to the chain default. */
  readonly VITE_ARBITRUM_SEPOLIA_RPC_URL?: string
  /** Active deployment id for the versioned match route (GAME-109). */
  readonly VITE_ACTIVE_DEPLOYMENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
