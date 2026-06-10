import { Link, useParams } from 'react-router-dom'
import {
  resolveMatchPhase,
  phaseLabel,
  type MatchView,
} from './phaseResolver'

/**
 * Demo-only mock factory so the route can render different phases
 * for visual verification and route tests without any contract client.
 *
 * Real implementation will replace this with contract reads.
 */
function makeDemoMatch(deploymentId: string, matchId: string): MatchView {
  const base: MatchView = {
    deploymentId,
    matchId,
    status: 'WaitingForOpponent',
    creator: '0x1111111111111111111111111111111111111111',
    opponent: null,
    invitedOpponent: '0x3333333333333333333333333333333333333333',
    currentTurn: null,
    winner: null,
  }

  const id = (matchId || '').toLowerCase()

  if (id.includes('join')) {
    return { ...base, status: 'WaitingForOpponent' }
  }
  if (id.includes('wait-opp')) {
    return { ...base, status: 'WaitingForOpponent', opponent: '0x2222222222222222222222222222222222222222' }
  }
  if (id.includes('place')) {
    return { ...base, status: 'WaitingForPlacement', opponent: '0x2222222222222222222222222222222222222222' }
  }
  if (id.includes('valid')) {
    return { ...base, status: 'ValidatingPlacement', opponent: '0x2222222222222222222222222222222222222222' }
  }
  if (id.includes('ready')) {
    return { ...base, status: 'ReadyToStart', opponent: '0x2222222222222222222222222222222222222222' }
  }
  if (id.includes('battle-mine')) {
    return {
      ...base,
      status: 'InProgress',
      opponent: '0x2222222222222222222222222222222222222222',
      currentTurn: '0x1111111111111111111111111111111111111111',
    }
  }
  if (id.includes('battle-opp')) {
    return {
      ...base,
      status: 'InProgress',
      opponent: '0x2222222222222222222222222222222222222222',
      currentTurn: '0x2222222222222222222222222222222222222222',
    }
  }
  if (id.includes('resolv')) {
    return {
      ...base,
      status: 'ResolvingShot',
      opponent: '0x2222222222222222222222222222222222222222',
      currentTurn: '0x1111111111111111111111111111111111111111',
    }
  }
  if (id.includes('win')) {
    return {
      ...base,
      status: 'Finished',
      opponent: '0x2222222222222222222222222222222222222222',
      winner: '0x1111111111111111111111111111111111111111',
    }
  }
  if (id.includes('lose')) {
    return {
      ...base,
      status: 'Finished',
      opponent: '0x2222222222222222222222222222222222222222',
      winner: '0x2222222222222222222222222222222222222222',
    }
  }
  if (id.includes('cancel')) {
    return { ...base, status: 'Cancelled', opponent: '0x2222222222222222222222222222222222222222' }
  }
  if (id.includes('forfeit')) {
    return { ...base, status: 'Forfeited', opponent: '0x2222222222222222222222222222222222222222' }
  }

  // default: waiting for opponent (creator view)
  return base
}

/**
 * Small presentational panel so different phases are visible in the shell.
 * This component only receives already-resolved public data.
 */
function PhasePanel({ phase }: { phase: ReturnType<typeof resolveMatchPhase> }) {
  const label = phaseLabel(phase)
  return (
    <div className="home-actions" data-testid="match-phase-panel">
      <p data-testid="match-phase-kind">Phase: {phase.kind}</p>
      <p data-testid="match-phase-label">{label}</p>
      {phase.kind === 'placement' && (
        <p data-testid="placement-detail">
          {phase.validating
            ? 'Validating…'
            : phase.waitingForOpponent
              ? 'Waiting for opponent submission'
              : 'Ready to place fleet'}
        </p>
      )}
      {phase.kind === 'battle' && (
        <p data-testid="battle-detail">{phase.isMyTurn ? 'You may fire.' : 'Waiting for opponent shot.'}</p>
      )}
      {phase.kind === 'finished' && (
        <p data-testid="finished-detail">{phase.youWon ? 'Victory' : phase.youWon === false ? 'Defeat' : 'Complete'}</p>
      )}
    </div>
  )
}

export function MatchRouteShell() {
  const { deploymentId, matchId } = useParams()

  // For the GAME-102 slice we synthesize a mock MatchView from the URL so the
  // route can demonstrate phase rendering without a contract client and without
  // ever importing the local plaintext attack engine.
  const demoMatch = makeDemoMatch(deploymentId ?? 'arb-sepolia-v1', matchId ?? 'demo')

  // Use a fixed demo wallet/chain for the shell UI in this slice.
  // Real shell will read from Privy + chain guard + contract reads.
  const demoInput = {
    hasWallet: true,
    walletAddress: '0x1111111111111111111111111111111111111111' as const,
    isCorrectChain: true,
    match: demoMatch,
  }

  const phase = resolveMatchPhase(demoInput)

  return (
    <div className="overlay home">
      <div className="title-lockup">
        <span className="title-kicker">On-chain Match</span>
        <h1>Match Route</h1>
        <p className="tagline">
          Deployment {deploymentId ?? 'unknown'} · Match {matchId ?? 'unknown'}
        </p>
      </div>

      <PhasePanel phase={phase} />

      <div className="home-actions">
        <Link className="btn primary" to="/practice">
          Back to Practice
        </Link>
        <p className="footnote">Mocked on-chain phases for GAME-102. Real contract wiring later.</p>
      </div>
    </div>
  )
}

