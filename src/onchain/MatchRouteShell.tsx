import { Link, useParams } from 'react-router-dom'
import {
  resolveMatchPhase,
  phaseLabel,
  type MatchView,
} from './phaseResolver'
import { getActiveDeploymentId, getDeployment, isDeploymentReady } from './deployments'
import { deploymentCopy, matchRouteCopy } from '../copy/en'

/** Demo addresses (match the ones used in phaseResolver.test.ts for consistency). */
const DEMO_CREATOR = '0x1111111111111111111111111111111111111111' as const
const DEMO_OPPONENT = '0x2222222222222222222222222222222222222222' as const
const DEMO_INVITED = '0x3333333333333333333333333333333333333333' as const
const DEMO_SPECTATOR = '0x4444444444444444444444444444444444444444' as const

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

  // Only apply special demo phase synthesis when the matchId contains an explicit
  // "demo" marker. This prevents a real future on-chain matchId (opaque, e.g. a uuid
  // or on-chain id) that happens to contain substrings like "win", "place", "battle",
  // "join", "resolv" etc. from accidentally activating a mocked phase or viewer.
  // Supported URLs now use the "demo-*" convention (see routes tests and comments below).
  // The entire makeDemoMatch factory is temporary and will be replaced by real
  // MatchView loading from contract reads in later slices.
  const hasDemoMarker = id.includes('demo')
  if (!hasDemoMarker) {
    // Plain ids (e.g. the restore-navigation test using "42") get the safe default
    // creator + WaitingForOpponent view. No special patches.
    return base
  }

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

/** Shown when an invite link references a deployment id not in the manifest. */
function DeploymentUnavailable({ deploymentId }: { deploymentId: string }) {
  return (
    <div
      className="overlay home"
      data-game-slice="onchain-shell-103"
      data-testid="match-route-shell"
    >
      <div className="title-lockup">
        <span className="title-kicker">{matchRouteCopy.kicker}</span>
        <h1>{matchRouteCopy.heading}</h1>
        <p className="tagline" data-testid="deployment-unavailable">
          {deploymentCopy.unknownTitle}
        </p>
      </div>
      <div className="home-actions">
        <p className="footnote">{deploymentCopy.unknownBody(deploymentId)}</p>
        <Link className="btn primary" to="/practice">
          {matchRouteCopy.backToPractice}
        </Link>
      </div>
    </div>
  )
}

export function MatchRouteShell() {
  const params = useParams()
  const deploymentId = params.deploymentId ?? getActiveDeploymentId()
  const matchId = params.matchId ?? 'demo'

  // GAME-110: resolve the versioned deployment before rendering any match phase.
  // Old invite links must keep pointing at their original deployment; an unknown
  // id resolves to a recoverable "unavailable" state instead of a phantom match.
  const deployment = getDeployment(deploymentId)
  if (!deployment) {
    return <DeploymentUnavailable deploymentId={deploymentId} />
  }

  // Demo-only: synthesize a mock MatchView from the URL so the route shell can
  // demonstrate phase rendering without a contract client and without ever
  // importing the local plaintext attack engine (GAME-103 empty shell).
  const demoMatch = makeDemoMatch(deploymentId, matchId)

  // Demo viewer/wallet context is also derived from matchId for broader phase coverage
  // in the shell (e.g. "demo-join-invited" will render the 'join' phase for the invited wallet).
  // Supported demo tokens (extendable; require "demo" marker to avoid clashing with real IDs):
  //   - demo-join / demo-invited → invited wallet (exercises 'join')
  //   - demo-observer / demo-spectator → third-party non-participant wallet (exercises
  //     the participant guard in resolveMatchPhase → waiting-for-opponent for active phases)
  //   - demo-no-wallet → hasWallet:false (exercises 'wallet-required')
  //   - demo-wrong-chain → isCorrectChain:false (exercises 'wrong-network')
  //   - (default for demo- ids) creator wallet for placement/battle/finished/etc.
  //   - plain ids (e.g. "42") → safe default creator + waiting-for-opponent view
  // NOTE: Full coverage of every MatchPhase kind through the route shell + PhasePanel
  // is intentionally limited in this slice; unit tests in phaseResolver.test.ts cover the
  // pure function exhaustively. Real implementation will source values from Privy + chain
  // guard and the match from on-chain reads (public MatchView shape only).
  const id = matchId.toLowerCase()
  const hasDemoMarker = id.includes('demo')
  const demoWallet = hasDemoMarker && (id.includes('join') || id.includes('invited'))
    ? DEMO_INVITED
    : hasDemoMarker && (id.includes('observer') || id.includes('spectator'))
    ? DEMO_SPECTATOR
    : DEMO_CREATOR

  const demoInput = {
    hasWallet: !(hasDemoMarker && id.includes('no-wallet')),
    walletAddress: (hasDemoMarker && id.includes('no-wallet')) ? null : demoWallet,
    isCorrectChain: !(hasDemoMarker && id.includes('wrong-chain')),
    match: demoMatch,
  }

  const phase = resolveMatchPhase(demoInput)
  const ready = isDeploymentReady(deployment)

  return (
    <div className="overlay home" data-game-slice="onchain-shell-103" data-testid="match-route-shell">
      <div className="title-lockup">
        <span className="title-kicker">{matchRouteCopy.kicker}</span>
        <h1>{matchRouteCopy.heading}</h1>
        <p className="tagline">{matchRouteCopy.tagline(deploymentId, matchId)}</p>
      </div>

      <PhasePanel phase={phase} />

      <div className="home-actions">
        <Link className="btn primary" to="/practice">
          {matchRouteCopy.backToPractice}
        </Link>
        {!ready && (
          <p className="footnote" data-testid="deployment-pending">
            {deploymentCopy.pendingNote}
          </p>
        )}
        <p className="footnote">{matchRouteCopy.shellFootnote}</p>
      </div>
    </div>
  )
}
