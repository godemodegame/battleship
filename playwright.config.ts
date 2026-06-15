import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: !process.env.CI,
  workers: process.env.CI ? 1 : 2,
  // CI renders the 3D scenes (ocean shader + reflections) under software WebGL
  // (swiftshader), so the multi-phase practice flow needs well beyond the local
  // budget to finish a single attempt.
  timeout: process.env.CI ? 240_000 : 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: process.env.CI
      ? 'npm run build:e2e && npm run preview -- --host 127.0.0.1 --port 4173'
      : 'npm run dev:e2e -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
