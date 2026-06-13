import { expect, test } from '@playwright/test'

const CREATOR = '0xaaaa000000000000000000000000000000000001'
const OPPONENT = '0xbbbb000000000000000000000000000000000002'

test('two wallets create and join one friend match against local mocks', async ({
  context,
  page: creatorPage,
}) => {
  await creatorPage.goto('/match/new?e2eWallet=creator')
  await expect(creatorPage.getByTestId('create-match-form')).toBeVisible()
  await expect(creatorPage.getByTestId('wallet-address')).toContainText(
    `${CREATOR.slice(0, 6)}…${CREATOR.slice(-4)}`,
  )

  await creatorPage.getByTestId('invited-address-input').fill(OPPONENT)
  // Placement-first: arrange the fleet, then the single action encrypts and
  // submits createWithFleet once the create button enables.
  await creatorPage.getByRole('button', { name: 'Auto Place' }).click()
  await expect(creatorPage.getByTestId('create-match')).toBeEnabled()
  await creatorPage.getByTestId('create-match').click()
  await expect(creatorPage.getByTestId('invite-panel')).toBeVisible()
  const inviteLink = await creatorPage.getByTestId('invite-link').textContent()
  expect(inviteLink).toContain('/match/arb-sepolia-v1/1')

  const opponentPage = await context.newPage()
  await opponentPage.goto('/match/arb-sepolia-v1/1?e2eWallet=opponent')
  await expect(opponentPage.getByTestId('join-panel')).toBeVisible()
  await expect(opponentPage.getByTestId('wallet-address')).toContainText(
    `${OPPONENT.slice(0, 6)}…${OPPONENT.slice(-4)}`,
  )
  // Placement-first join: arrange the fleet, then joinWithFleet.
  await opponentPage.getByRole('button', { name: 'Auto Place' }).click()
  await expect(opponentPage.getByTestId('join-match')).toBeEnabled()
  await opponentPage.getByTestId('join-match').click()

  await expect(opponentPage.getByTestId('match-phase-kind')).toContainText('placement')
  await expect(creatorPage.getByTestId('match-phase-kind')).toContainText('placement')
})
