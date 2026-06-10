import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMobileWalletReturn } from './useMobileWalletReturn'
import { clearPendingWalletAction, loadPendingWalletAction, savePendingWalletAction } from './mobileReturn'

function Probe({ onReturn }: { onReturn: (a: ReturnType<typeof loadPendingWalletAction>) => void }) {
  useMobileWalletReturn((action) => onReturn(action))
  return null
}

function fireVisible() {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  clearPendingWalletAction()
})

describe('useMobileWalletReturn', () => {
  it('does nothing when no action is pending', () => {
    const onReturn = vi.fn()
    render(<Probe onReturn={onReturn} />)
    fireVisible()
    expect(onReturn).not.toHaveBeenCalled()
  })

  it('invokes the callback and clears the pending action when the page becomes visible', () => {
    savePendingWalletAction({ route: '/match/arb-sepolia-v1/42', matchId: '42', actionType: 'create-match' })

    const onReturn = vi.fn()
    render(<Probe onReturn={onReturn} />)
    fireVisible()

    expect(onReturn).toHaveBeenCalledTimes(1)
    expect(onReturn.mock.calls[0][0]).toMatchObject({ route: '/match/arb-sepolia-v1/42', actionType: 'create-match' })
    expect(loadPendingWalletAction()).toBeNull()
  })

  it('does not re-invoke after the action has already been consumed', () => {
    savePendingWalletAction({ route: '/match/arb-sepolia-v1/42', matchId: '42', actionType: 'attack' })

    const onReturn = vi.fn()
    render(<Probe onReturn={onReturn} />)
    fireVisible()
    fireVisible()

    expect(onReturn).toHaveBeenCalledTimes(1)
  })
})
