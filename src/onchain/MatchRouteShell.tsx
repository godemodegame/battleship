import { Link, useParams } from 'react-router-dom'
import {
  resolveMatchPhase,
  phaseLabel,
  type MatchView,
} from './phaseResolver'

/** Demo addresses (match the ones used in phaseResolver.test.ts for consistency). */
const DEMO_CREATOR = '0x1111111111111111111111111111111111111111' as const
const DEMO_OPPONENT = '0x2222222222222222222222222222222222222222' as const
const DEMO_INVITED = '0x3333333333333333333333333333333333333333' as const

/**
 * Demo-only mock factory so the route can render different phases
 * for visual verification and route tests without any contract client.
 *
 * Selection uses explicit rules checked in order (specific keys like 'battle-mine'
 * before any potential overlap). Real implementation will replace this with
 * contract reads + a proper MatchView from on-chain state.
 */
function makeDemoMatch(deploymentId: string, matchId: string): MatchView {
  const base: MatchView = {
    deploymentId,
    matchId,
    status: 'WaitingForOpponent',
    creator: DEMO_CREATOR,
    opponent: null,
    invitedOpponent: DEMO_INVITED,
    currentTurn: null,
    winner: null,
  }

  const id = (matchId || '').toLowerCase()

  // Rules are checked in declaration order. Put more specific matchers first.
  const rules: Array<{ key: string; patch: Partial<MatchView> & { status: MatchView['status'] } }> = [
    { key: 'battle-mine', patch: { status: 'InProgress', opponent: DEMO_OPPONENT, currentTurn: DEMO_CREATOR } },
    { key: 'battle-opp',  patch: { status: 'InProgress', opponent: DEMO_OPPONENT, currentTurn: DEMO_OPPONENT } },
    { key: 'resolv',      patch: { status: 'ResolvingShot', opponent: DEMO_OPPONENT, currentTurn: DEMO_CREATOR } },
    { key: 'win',         patch: { status: 'Finished', opponent: DEMO_OPPONENT, winner: DEMO_CREATOR } },
    { key: 'lose',        patch: { status: 'Finished', opponent: DEMO_OPPONENT, winner: DEMO_OPPONENT } },
    { key: 'place',       patch: { status: 'WaitingForPlacement', opponent: DEMO_OPPONENT } },
    { key: 'valid',       patch: { status: 'ValidatingPlacement', opponent: DEMO_OPPONENT } },
    { key: 'ready',       patch: { status: 'ReadyToStart', opponent: DEMO_OPPONENT } },
    { key: 'wait-opp',    patch: { status: 'WaitingForOpponent', opponent: DEMO_OPPONENT } },
    { key: 'join',        patch: { status: 'WaitingForOpponent' } },
    { key: 'cancel',      patch: { status: 'Cancelled', opponent: DEMO_OPPONENT } },
    { key: 'forfeit',     patch: { status: 'Forfeited', opponent: DEMO_OPPONENT } },
  ]

  for (const rule of rules) {
    if (id.includes(rule.key)) {
      return { ...base, ...rule.patch }
    }
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

  // Demo-only: synthesize a mock MatchView from the URL so the route shell can
  // demonstrate phase rendering without a contract client and without ever
  // importing the local plaintext attack engine (GAME-103 empty shell).
  const demoMatch = makeDemoMatch(deploymentId ?? 'arb-sepolia-v1', matchId ?? 'demo')

  // Demo viewer/wallet context is also derived from matchId for broader phase coverage
  // in the shell (e.g. "demo-join-invited" will render the 'join' phase for the invited wallet).
  // Supported demo tokens (extendable):
  //   - join / invited → invited wallet (exercises 'join')
  //   - no-wallet → hasWallet:false (exercises 'wallet-required')
  //   - wrong-chain → isCorrectChain:false (exercises 'wrong-network')
  //   - (default) creator wallet for placement/battle/finished/etc.
  // NOTE: Full coverage of every MatchPhase kind through the route shell + PhasePanel
  // is intentionally limited in this slice; unit tests in phaseResolver.test.ts cover the
  // pure function exhaustively. Real implementation will source values from Privy + chain
  // guard and the match from on-chain reads (public MatchView shape only).
  const id = (matchId || '').toLowerCase()
  const demoWallet = (id.includes('join') || id.includes('invited'))
    ? DEMO_INVITED
    : DEMO_CREATOR

  const demoInput = {
    hasWallet: !id.includes('no-wallet'),
    walletAddress: id.includes('no-wallet') ? null : demoWallet,
    isCorrectChain: !id.includes('wrong-chain'),
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
        <p className="footnote">Mocked on-chain phases for GAME-103 (empty shell via URL matchId). Real contract wiring later.</p>
      </div>
    </div>
  )
}

