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

test('keeps practice reachable without connecting a wallet', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Encrypted Battleship')
  await expect(page.getByTestId('entry-screen')).toBeVisible()
  await page.getByTestId('entry-skip').click()
  await expect(page.getByRole('button', { name: 'Practice vs Bot' })).toBeVisible()
})

test('restores a direct versioned match route after refresh', async ({ page }) => {
  await page.goto(`/match/${deploymentId}/1`)
  await expect(page).toHaveTitle('Encrypted Battleship')
  await expect(page.getByText(new RegExp(`Deployment ${deploymentId}.*Match 1`))).toBeVisible()
  await page.reload()
  await expect(page.getByText(new RegExp(`Deployment ${deploymentId}.*Match 1`))).toBeVisible()
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
