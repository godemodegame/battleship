import { describe, expect, it } from 'vitest'
import { decodeReadError, decodeTxError, findRevertErrorName, isUserRejection } from './decodeError'

/** Build a viem-shaped error chain: execution error → reverted error with name. */
function revertError(errorName: string): Error {
  const reverted = Object.assign(new Error('reverted'), {
    name: 'ContractFunctionRevertedError',
    data: { errorName },
  })
  return Object.assign(new Error('execution failed'), {
    name: 'ContractFunctionExecutionError',
    cause: reverted,
  })
}

describe('decodeTxError (GAME-503/511)', () => {
  it('maps EIP-1193 4001 anywhere in the cause chain to a rejection', () => {
    const inner = Object.assign(new Error('denied'), { code: 4001 })
    const outer = Object.assign(new Error('tx failed'), { cause: inner })
    expect(decodeTxError(outer)).toBe('transaction-rejected')
    expect(isUserRejection(outer)).toBe(true)
  })

  it('maps the viem UserRejectedRequestError name to a rejection', () => {
    const err = Object.assign(new Error('rejected'), { name: 'UserRejectedRequestError' })
    expect(decodeTxError(err)).toBe('transaction-rejected')
  })

  it('decodes named contract reverts through the shared error map', () => {
    expect(decodeTxError(revertError('JoinDeadlineExpired'))).toBe('join-deadline-expired')
    expect(decodeTxError(revertError('NotInvitedOpponent'))).toBe('not-invited')
    expect(decodeTxError(revertError('SelfInviteNotAllowed'))).toBe('self-invite')
    expect(decodeTxError(revertError('OpponentAlreadyJoined'))).toBe('already-joined')
    expect(decodeTxError(revertError('CannotCancelStartedMatch'))).toBe('cannot-cancel')
  })

  it('degrades unknown revert names to transaction-reverted', () => {
    expect(decodeTxError(revertError('SomeFutureError'))).toBe('transaction-reverted')
  })

  it('maps receipt wait timeouts to transaction-dropped', () => {
    const err = Object.assign(new Error('timed out'), {
      name: 'WaitForTransactionReceiptTimeoutError',
    })
    expect(decodeTxError(err)).toBe('transaction-dropped')
  })

  it('returns unknown for unrecognized failures and survives cyclic causes', () => {
    const a = new Error('a') as Error & { cause?: unknown }
    const b = new Error('b') as Error & { cause?: unknown }
    a.cause = b
    b.cause = a
    expect(decodeTxError(a)).toBe('unknown')
    expect(decodeTxError(null)).toBe('unknown')
  })
})

describe('decodeReadError', () => {
  it('detects MatchNotFound reverts', () => {
    expect(decodeReadError(revertError('MatchNotFound'))).toBe('match-not-found')
    expect(findRevertErrorName(revertError('MatchNotFound'))).toBe('MatchNotFound')
  })

  it('treats every other read failure as a recoverable load error', () => {
    expect(decodeReadError(new Error('rpc down'))).toBe('match-load-failed')
    expect(decodeReadError(revertError('NotYourTurn'))).toBe('match-load-failed')
  })
})
