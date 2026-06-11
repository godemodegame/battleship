import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    env: {
      // Unit tests must not load the real Privy bridge (GAME-808 lazy chunk):
      // they drive wallet state through WalletSessionContext overrides. A
      // developer's .env.local app id would otherwise leak into jsdom runs.
      VITE_PRIVY_APP_ID: '',
    },
  },
})
