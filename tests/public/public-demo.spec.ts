import { expect, test } from '@playwright/test'

const deploymentId =
  process.env.VITE_ACTIVE_DEPLOYMENT_ID || process.env.EXPECTED_DEPLOYMENT_ID || 'arb-sepolia-v1'
const requireActive = process.env.REQUIRE_ACTIVE_DEPLOYMENT === '1'

test('serves matching immutable release metadata', async ({ request }) => {
  const response = await request.get('/release.json')
  expect(response.ok()).toBe(true)
  const release = (await response.json()) as {
    application: string
    sourceCommit: string
    deploymentId: string
    deploymentStatus: string
    chainId: number
    contractAddress: string | null
  }
  expect(release.application).toBe('encrypted-battleship')
  expect(release.sourceCommit).toMatch(/^[0-9a-f]{40}$/)
  expect(release.deploymentId).toBe(deploymentId)
  expect(release.chainId).toBe(421614)
  if (requireActive) {
    expect(release.deploymentStatus).toBe('active')
    expect(release.contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
  }
})

test('gates play behind sign-in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Encrypted Battleship')
  await expect(page.getByTestId('entry-screen')).toBeVisible()
  // Sign-in is the only door: no guest/skip path, and typing a playable route
  // bounces back to onboarding.
  await expect(page.getByTestId('entry-skip')).toHaveCount(0)
  await expect(page.getByTestId('entry-connect')).toBeVisible()
  await page.goto('/practice')
  await expect(page.getByTestId('entry-screen')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Practice vs Bot' })).toHaveCount(0)
})

test('holds a direct versioned match link at sign-in across a refresh', async ({ page }) => {
  // Signed out, a versioned match link resolves the SPA and parks the visitor
  // at onboarding rather than 404ing or leaking match state; the link is what
  // they return to after signing in.
  await page.goto(`/match/${deploymentId}/1`)
  await expect(page).toHaveTitle('Encrypted Battleship')
  await expect(page.getByTestId('entry-screen')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('entry-screen')).toBeVisible()
})

test('serves critical models and textures without the SPA fallback', async ({ request }) => {
  for (const path of [
    '/models/tactical-ocean-board.fbx',
    '/models/vfx-hit-impact.glb',
    '/textures/tactical-ocean-board-texture.jpg',
  ]) {
    const response = await request.get(path)
    expect(response.ok(), path).toBe(true)
    expect(response.headers()['content-type'], path).not.toContain('text/html')
    expect((await response.body()).byteLength, path).toBeGreaterThan(100)
  }
})
