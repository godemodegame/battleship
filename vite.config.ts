import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        // GAME-808: stable vendor chunks per docs/mobile-performance-budget.md
        // ("split vendor chunks ... so caching starts paying off"). three.js
        // loads only with the practice route, viem with the wallet bridge.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(three|@react-three|maath)\//.test(id)) return 'three'
          if (/node_modules\/viem\//.test(id)) return 'viem'
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
            return 'react'
          }
          return undefined
        },
      },
    },
  },
})
