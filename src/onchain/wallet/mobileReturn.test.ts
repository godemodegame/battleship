import { afterEach, describe, expect, it } from 'vitest'
import {
  clearPendingWalletAction,
  loadPendingWalletAction,
  savePendingWalletAction,
} from './mobileReturn'

afterEach(() => {
  clearPendingWalletAction()
})

describe('mobileReturn', () => {
  it('returns null when nothing is pending', () => {
    expect(loadPendingWalletAction()).toBeNull()
  })

  it('round-trips a saved pending action', () => {
    savePendingWalletAction({
      route: '/match/arb-sepolia-v1/42',
      matchId: '42',
      actionType: 'create-match',
    })

    const loaded = loadPendingWalletAction()
    expect(loaded?.route).toBe('/match/arb-sepolia-v1/42')
    expect(loaded?.matchId).toBe('42')
    expect(loaded?.actionType).toBe('create-match')
    expect(typeof loaded?.startedAt).toBe('number')
  })

  it('clears the pending action', () => {
    savePendingWalletAction({ route: '/match/arb-sepolia-v1/42', matchId: '42', actionType: 'join' })
    clearPendingWalletAction()
    expect(loadPendingWalletAction()).toBeNull()
  })

  it('treats malformed stored data as no pending action', () => {
    window.sessionStorage.setItem('battleship.pendingWalletAction', '{"route": 1}')
    expect(loadPendingWalletAction()).toBeNull()
  })

  it('allows a null matchId for non-match actions', () => {
    savePendingWalletAction({ route: '/practice', matchId: null, actionType: 'connect' })
    expect(loadPendingWalletAction()?.matchId).toBeNull()
  })
})
