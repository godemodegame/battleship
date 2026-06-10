import { describe, expect, it } from 'vitest'
import {
  type MatchView,
  type PhaseResolverInput,
  resolveMatchPhase,
  phaseLabel,
} from './phaseResolver'

const CREATOR = '0x1111111111111111111111111111111111111111' as const
const OPPONENT = '0x2222222222222222222222222222222222222222' as const
const INVITED = '0x3333333333333333333333333333333333333333' as const

function baseMatch(overrides: Partial<MatchView> = {}): MatchView {
  return {
    deploymentId: 'arb-sepolia-v1',
    matchId: '42',
    status: 'WaitingForOpponent',
    creator: CREATOR,
    opponent: null,
    invitedOpponent: INVITED,
    currentTurn: null,
    winner: null,
    ...overrides,
  }
}

function input(overrides: Partial<PhaseResolverInput> = {}): PhaseResolverInput {
  return {
    hasWallet: true,
    walletAddress: CREATOR,
    isCorrectChain: true,
    match: baseMatch(),
    ...overrides,
  }
}

describe('resolveMatchPhase', () => {
  it('requires wallet when not connected', () => {
    const result = resolveMatchPhase(input({ hasWallet: false, walletAddress: null }))
    expect(result.kind).toBe('wallet-required')
    expect(phaseLabel(result)).toBe('Connect wallet to continue')
  })

  it('requires correct chain', () => {
    const result = resolveMatchPhase(input({ isCorrectChain: false }))
    expect(result.kind).toBe('wrong-network')
    expect(phaseLabel(result)).toBe('Switch to Arbitrum Sepolia')
  })

  it('reports not found when match missing', () => {
    const result = resolveMatchPhase(input({ match: null }))
    expect(result.kind).toBe('not-found')
    expect(phaseLabel(result)).toBe('Match not found')
  })

  it('offers join to the invited wallet when WaitingForOpponent', () => {
    const result = resolveMatchPhase(
      input({ walletAddress: INVITED, match: baseMatch({ status: 'WaitingForOpponent', opponent: null }) }),
    )
    expect(result.kind).toBe('join')
    expect(phaseLabel(result)).toBe('Join this match')
  })

  it('shows waiting for the creator while WaitingForOpponent', () => {
    const result = resolveMatchPhase(
      input({ walletAddress: CREATOR, match: baseMatch({ status: 'WaitingForOpponent' }) }),
    )
    expect(result.kind).toBe('waiting-for-opponent')
  })

  it('enters placement for a participant on WaitingForPlacement', () => {
    const result = resolveMatchPhase(
      input({ walletAddress: CREATOR, match: baseMatch({ status: 'WaitingForPlacement' }) }),
    )
    expect(result.kind).toBe('placement')
    if (result.kind === 'placement') {
      expect(result.canSubmit).toBe(true)
      expect(result.submitted).toBe(false)
    }
  })

  it('shows validating state', () => {
    const result = resolveMatchPhase(
      input({ walletAddress: CREATOR, match: baseMatch({ status: 'ValidatingPlacement' }) }),
    )
    expect(result.kind).toBe('placement')
    if (result.kind === 'placement') {
      expect(result.validating).toBe(true)
      expect(result.waitingForOpponent).toBe(true)
    }
    expect(phaseLabel(result)).toBe('Validating fleets')
  })

  it('shows ready-to-start as waiting for opponent fleet', () => {
    const result = resolveMatchPhase(
      input({ walletAddress: CREATOR, match: baseMatch({ status: 'ReadyToStart' }) }),
    )
    expect(result.kind).toBe('placement')
    expect(phaseLabel(result)).toBe('Waiting for opponent fleet')
  })

  it('battle phase marks whose turn it is', () => {
    const myTurnMatch = baseMatch({
      status: 'InProgress',
      opponent: OPPONENT,
      currentTurn: CREATOR,
    })
    const myTurn = resolveMatchPhase(input({ walletAddress: CREATOR, match: myTurnMatch }))
    expect(myTurn.kind).toBe('battle')
    if (myTurn.kind === 'battle') expect(myTurn.isMyTurn).toBe(true)
    expect(phaseLabel(myTurn)).toBe('Your turn')

    const oppTurnMatch = { ...myTurnMatch, currentTurn: OPPONENT }
    const oppTurn = resolveMatchPhase(input({ walletAddress: CREATOR, match: oppTurnMatch }))
    expect(oppTurn.kind).toBe('battle')
    if (oppTurn.kind === 'battle') expect(oppTurn.isMyTurn).toBe(false)
    expect(phaseLabel(oppTurn)).toBe("Opponent's turn")
  })

  it('resolving shot phase', () => {
    const result = resolveMatchPhase(
      input({ match: baseMatch({ status: 'ResolvingShot', currentTurn: CREATOR, opponent: OPPONENT }) }),
    )
    expect(result.kind).toBe('resolving')
    expect(phaseLabel(result)).toBe('Resolving shot')
  })

  it('finished with youWon true/false', () => {
    const win = resolveMatchPhase(
      input({ walletAddress: CREATOR, match: baseMatch({ status: 'Finished', winner: CREATOR, opponent: OPPONENT }) }),
    )
    expect(win.kind).toBe('finished')
    if (win.kind === 'finished') expect(win.youWon).toBe(true)
    expect(phaseLabel(win)).toBe('You won')

    const loss = resolveMatchPhase(
      input({ walletAddress: CREATOR, match: baseMatch({ status: 'Finished', winner: OPPONENT, opponent: OPPONENT }) }),
    )
    expect(loss.kind).toBe('finished')
    if (loss.kind === 'finished') expect(loss.youWon).toBe(false)
    expect(phaseLabel(loss)).toBe('You lost')
  })

  it('terminal cancelled and forfeited', () => {
    expect(
      resolveMatchPhase(input({ match: baseMatch({ status: 'Cancelled' }) })).kind,
    ).toBe('cancelled')
    expect(
      resolveMatchPhase(input({ match: baseMatch({ status: 'Forfeited' }) })).kind,
    ).toBe('forfeited')
  })

  it('unavailable for unknown status', () => {
    // @ts-expect-error force bad status for coverage
    const bad = resolveMatchPhase(input({ match: { ...baseMatch(), status: 'Bogus' } }))
    expect(bad.kind).toBe('unavailable')
  })
})
