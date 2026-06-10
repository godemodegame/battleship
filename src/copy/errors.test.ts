import { describe, expect, it } from 'vitest'
import { errorMessage, mapContractError, mapWalletError } from './errors'

describe('error mapping (GAME-108)', () => {
  it('maps known codes to readable English', () => {
    expect(errorMessage('not-your-turn')).toBe('It is not your turn')
    expect(errorMessage('wrong-network')).toBe('Wrong network')
    expect(errorMessage('cell-already-attacked')).toBe('This cell was already attacked')
  })

  it('maps known contract revert names, degrading unknown names safely', () => {
    expect(mapContractError('NotInvited')).toBe('not-invited')
    expect(mapContractError('CellAlreadyAttacked')).toBe('cell-already-attacked')
    expect(mapContractError('Mystery')).toBe('unknown')
    expect(mapContractError(null)).toBe('unknown')
  })

  it('maps wallet user-rejection to a rejected transaction', () => {
    expect(mapWalletError({ code: 4001 })).toBe('transaction-rejected')
    expect(mapWalletError({ name: 'UserRejectedRequestError' })).toBe('transaction-rejected')
    expect(mapWalletError({ code: -32000 })).toBe('unknown')
    expect(mapWalletError(null)).toBe('unknown')
  })

  it('composes a player-facing message from a revert name', () => {
    expect(errorMessage(mapContractError('NotYourTurn'))).toBe('It is not your turn')
  })
})
