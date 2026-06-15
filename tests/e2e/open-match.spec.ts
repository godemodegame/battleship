import { expect, test } from '@playwright/test'

const OPPONENT = '0xbbbb000000000000000000000000000000000002'

// Random matchmaking: a host opens a game with no invited opponent, a stranger
// discovers it in the lobby and joins. Mirrors friend-match.spec but exercises
// the open-match create/discover/join path against the local mocks.
test('a stranger discovers and joins an open match', async ({
  context,
  page: hostPage,
}) => {
  // Host an open game (placement-first, no invited address).
  await hostPage.goto('/match/open?e2eWallet=creator')
  await expect(hostPage.getByTestId('create-open-match-screen')).toBeVisible()
  await expect(hostPage.getByTestId('open-match-helper')).toBeVisible()

  await hostPage.getByRole('button', { name: 'Auto Place' }).click()
  await expect(hostPage.getByTestId('create-match')).toBeEnabled()
  await hostPage.getByTestId('create-match').click()

  // The host lands on the waiting room for any challenger.
  await expect(hostPage.getByTestId('invite-panel')).toBeVisible()
  await expect(hostPage.getByText('Waiting for a Challenger')).toBeVisible()

  // A different wallet discovers the open game in the lobby.
  const joinerPage = await context.newPage()
  await joinerPage.goto('/lobby?e2eWallet=opponent')
  await expect(joinerPage.getByTestId('open-match-card-1')).toBeVisible()
  await expect(joinerPage.getByTestId('open-match-card-1')).toContainText('Match #1')

  // Open the match and join — the resolver admits a non-invited wallet.
  await joinerPage.goto('/match/arb-sepolia-v1/1?e2eWallet=opponent')
  await expect(joinerPage.getByTestId('join-panel')).toBeVisible()
  await expect(joinerPage.getByText('Join Open Game')).toBeVisible()
  await expect(joinerPage.getByTestId('wallet-address')).toContainText(
    `${OPPONENT.slice(0, 6)}…${OPPONENT.slice(-4)}`,
  )

  await joinerPage.getByRole('button', { name: 'Auto Place' }).click()
  await expect(joinerPage.getByTestId('join-match')).toBeEnabled()
  await joinerPage.getByTestId('join-match').click()

  // Both sides advance into placement once the open match is filled.
  await expect(joinerPage.getByTestId('match-phase-kind')).toContainText('placement')
  await expect(hostPage.getByTestId('match-phase-kind')).toContainText('placement')
})
