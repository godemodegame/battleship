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
const SPECTATOR = '0x4444444444444444444444444444444444444444' as const

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

  describe('open matches (random matchmaking)', () => {
    function openMatch(overrides: Partial<MatchView> = {}): MatchView {
      return baseMatch({
        status: 'WaitingForOpponent',
        matchType: 'Open',
        invitedOpponent: null,
        opponent: null,
        ...overrides,
      })
    }

    it('offers join to ANY non-creator wallet on an open match', () => {
      expect(resolveMatchPhase(input({ walletAddress: SPECTATOR, match: openMatch() })).kind).toBe(
        'join',
      )
      expect(resolveMatchPhase(input({ walletAddress: OPPONENT, match: openMatch() })).kind).toBe(
        'join',
      )
    })

    it('shows the host the waiting state for their own open match', () => {
      expect(resolveMatchPhase(input({ walletAddress: CREATOR, match: openMatch() })).kind).toBe(
        'waiting-for-opponent',
      )
    })

    it('does not offer join once an open match already has an opponent', () => {
      const filled = openMatch({ opponent: OPPONENT })
      expect(resolveMatchPhase(input({ walletAddress: SPECTATOR, match: filled })).kind).toBe(
        'waiting-for-opponent',
      )
    })

    it('keeps friend matches invite-gated (a stranger cannot join)', () => {
      const friend = baseMatch({ status: 'WaitingForOpponent', opponent: null })
      expect(resolveMatchPhase(input({ walletAddress: SPECTATOR, match: friend })).kind).toBe(
        'waiting-for-opponent',
      )
    })
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

  it('uses the connected player public placement verdict instead of match-wide guesses', () => {
    const player = (
      placementStatus: 'NotSubmitted' | 'ResolvingValidation' | 'Valid' | 'Invalid',
      fleetSubmitted: boolean,
      fleetValid: boolean,
    ) => ({
      player: CREATOR,
      joined: true,
      placementStatus,
      fleetSubmitted,
      fleetValid,
    })
    const opponent = {
      player: OPPONENT,
      joined: true,
      placementStatus: 'NotSubmitted' as const,
      fleetSubmitted: false,
      fleetValid: false,
    }

    const invalid = resolveMatchPhase(input({
      match: baseMatch({
        status: 'ValidatingPlacement',
        opponent: OPPONENT,
        players: { creator: player('Invalid', false, false), opponent },
      }),
    }))
    expect(invalid).toEqual(expect.objectContaining({
      kind: 'placement',
      canSubmit: true,
      invalid: true,
      validating: false,
    }))

    const valid = resolveMatchPhase(input({
      match: baseMatch({
        status: 'ValidatingPlacement',
        opponent: OPPONENT,
        players: { creator: player('Valid', true, true), opponent },
      }),
    }))
    expect(valid).toEqual(expect.objectContaining({
      kind: 'placement',
      canSubmit: false,
      waitingForOpponent: true,
      validating: false,
    }))
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

  it('non-participant (third-party/spectator wallet) receives passive state for active phases', () => {
    // This covers the participant-role guard added for GAME-103 (prevents non-players
    // from seeing "Place your fleet", "Your turn", etc. when viewing a public match).
    const placement = baseMatch({ status: 'WaitingForPlacement', opponent: OPPONENT })
    const p = resolveMatchPhase(input({ walletAddress: SPECTATOR, match: placement }))
    expect(p.kind).toBe('waiting-for-opponent')

    const battle = baseMatch({ status: 'InProgress', opponent: OPPONENT, currentTurn: CREATOR })
    const b = resolveMatchPhase(input({ walletAddress: SPECTATOR, match: battle }))
    expect(b.kind).toBe('waiting-for-opponent')

    const resolving = baseMatch({ status: 'ResolvingShot', opponent: OPPONENT, currentTurn: OPPONENT })
    const r = resolveMatchPhase(input({ walletAddress: SPECTATOR, match: resolving }))
    expect(r.kind).toBe('waiting-for-opponent')

    // Finished is safe to show to spectators (youWon will be null)
    const fin = resolveMatchPhase(
      input({ walletAddress: SPECTATOR, match: baseMatch({ status: 'Finished', winner: CREATOR, opponent: OPPONENT }) }),
    )
    expect(fin.kind).toBe('finished')
    if (fin.kind === 'finished') expect(fin.youWon).toBe(null)
  })
})
