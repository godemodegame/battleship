import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PUBLIC_DEMO_URL
if (!baseURL) throw new Error('Set PUBLIC_DEMO_URL before running public deployment tests')

export default defineConfig({
  testDir: './tests/public',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: devices['Desktop Chrome'],
    },
    {
      name: 'mobile-chromium',
      use: devices['Pixel 5'],
    },
  ],
})
