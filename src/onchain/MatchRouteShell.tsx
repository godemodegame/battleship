import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  resolveMatchPhase,
  phaseLabel,
  type MatchView,
} from './phaseResolver'
import { getActiveDeploymentId } from './deployments'
import {
  deploymentCopy,
  joinCopy,
  matchRouteCopy,
  matchStateCopy,
  phaseCopy,
  walletCopy,
} from '../copy/en'
import { errorMessage } from '../copy/errors'
import { parseMatchIdParam } from './client/mapping'
import { useBattleshipClients } from './client/useBattleshipClients'
import { useMatchView } from './useMatchView'
import {
  InviteWaitingPanel,
  JoinPanel,
  MatchIdentityPanel,
} from './match/MatchLifecyclePanels'
import { useWalletSession } from './wallet/WalletSessionContext'
import { WalletSessionBar } from './wallet/WalletSessionBar'
import { WrongNetworkPanel } from './wallet/WrongNetworkPanel'
import { LowBalanceNotice, FAUCET_URL } from './wallet/LowBalanceNotice'

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
 * before any potential overlap). Real (non-demo) ids never reach this factory —
 * they load `ChainMatchView`s through the typed read client (GAME-503).
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
  // "demo" marker. This prevents a real on-chain matchId from accidentally
  // activating a mocked phase or viewer. Supported URLs use the "demo-*"
  // convention (see routes tests and comments below). The factory stays for
  // visual phase verification; the live path never consults it.
  const hasDemoMarker = id.includes('demo')
  if (!hasDemoMarker) {
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

/** Shown when an invite link references an unknown or invalid deployment id. */
function DeploymentUnavailable({
  deploymentId,
  reason,
}: {
  deploymentId: string
  reason: 'unknown' | 'invalid'
}) {
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
          {reason === 'invalid' ? deploymentCopy.invalidTitle : deploymentCopy.unknownTitle}
        </p>
      </div>
      <div className="home-actions">
        <p className="footnote">
          {reason === 'invalid'
            ? deploymentCopy.invalidBody(deploymentId)
            : deploymentCopy.unknownBody(deploymentId)}
        </p>
        <Link className="btn primary" to="/practice">
          {matchRouteCopy.backToPractice}
        </Link>
      </div>
    </div>
  )
}

export function MatchRouteShell() {
  const params = useParams()
  const wallet = useWalletSession()
  const deploymentId = params.deploymentId ?? getActiveDeploymentId()
  const matchIdParam = params.matchId ?? 'demo'

  const id = matchIdParam.toLowerCase()
  const hasDemoMarker = id.includes('demo')

  // GAME-501/502: resolve + validate the deployment and bind typed clients to
  // its contract address. Real reads run only for live deployments.
  const clients = useBattleshipClients(deploymentId)
  const { resolution, readClient, writeClient } = clients
  const ready = resolution.ok && resolution.ready

  // GAME-503/509/510: authoritative match view, kept fresh by contract events,
  // focus/reconnect, and account/chain changes. Demo ids never reach the chain.
  const numericMatchId = hasDemoMarker ? null : parseMatchIdParam(matchIdParam)
  const query = useMatchView({
    readClient,
    matchId: numericMatchId,
    accountEpoch: wallet.accountEpoch,
    chainId: wallet.session.chainId,
  })

  // GAME-210: consume the transient handoff-restore signal after the route has
  // had a chance to react. Writes call prepareHandoff() right before opening a
  // mobile wallet; the refetch hooks in useMatchView re-read on focus return.
  useEffect(() => {
    if (!hasDemoMarker && wallet.handoffRestored) {
      wallet.actions.clearHandoffRestore()
    }
  }, [hasDemoMarker, wallet.handoffRestored, wallet.actions])

  // GAME-110: resolve the versioned deployment before rendering any match phase.
  // Old invite links must keep pointing at their original deployment; an unknown
  // or invalid id resolves to a recoverable "unavailable" state.
  if (!resolution.ok) {
    return <DeploymentUnavailable deploymentId={deploymentId} reason={resolution.reason} />
  }

  // Demo-only: synthesize a mock MatchView from the URL so the route shell can
  // demonstrate phase rendering without a contract client and without ever
  // importing the local plaintext attack engine (GAME-103 empty shell).
  const demoMatch = makeDemoMatch(deploymentId, matchIdParam)

  // Demo viewer/wallet context is derived from matchId for broader phase coverage
  // in the shell (e.g. "demo-join-invited" renders the 'join' phase for the
  // invited wallet). Supported demo tokens (require the "demo" marker):
  //   - demo-join / demo-invited → invited wallet (exercises 'join')
  //   - demo-observer / demo-spectator → third-party non-participant wallet
  //   - demo-no-wallet → hasWallet:false; demo-wrong-chain → isCorrectChain:false
  //   - (default for demo- ids) creator wallet
  // Real ids source wallet identity from the live Privy session and the match
  // from on-chain reads (public MatchView shape only).
  const resolverInput = hasDemoMarker
    ? {
        hasWallet: !id.includes('no-wallet'),
        walletAddress: id.includes('no-wallet')
          ? null
          : id.includes('join') || id.includes('invited')
            ? DEMO_INVITED
            : id.includes('observer') || id.includes('spectator')
              ? DEMO_SPECTATOR
              : DEMO_CREATOR,
        isCorrectChain: !id.includes('wrong-chain'),
        match: demoMatch,
      }
    : {
        hasWallet: wallet.session.isConnected,
        walletAddress: wallet.session.address,
        isCorrectChain: wallet.session.isCorrectChain,
        match: query.match,
      }

  const phase = resolveMatchPhase(resolverInput)

  const me = wallet.session.address
  const match = query.match
  const isCreator = Boolean(match && me && match.creator === me)
  const isInvited = Boolean(match && me && match.invitedOpponent === me)

  // What the real (non-demo) route shows in its content slot, by priority:
  // wallet gates → deployment readiness → match query state → resolved phase.
  const walletGate = phase.kind === 'wallet-required' || phase.kind === 'wrong-network'
  const showLoading =
    !walletGate && ready && numericMatchId !== null && (query.status === 'loading' || query.status === 'idle')
  const showNotFound =
    !walletGate && ready && (numericMatchId === null || query.status === 'not-found')
  const showError = !walletGate && ready && numericMatchId !== null && query.status === 'error'
  const showMatch = !walletGate && ready && query.status === 'ready' && match !== null

  return (
    <div className="overlay home" data-game-slice="onchain-shell-103" data-testid="match-route-shell">
      <div className="title-lockup">
        <span className="title-kicker">{matchRouteCopy.kicker}</span>
        <h1>{matchRouteCopy.heading}</h1>
        <p className="tagline">{matchRouteCopy.tagline(deploymentId, matchIdParam)}</p>
      </div>

      {!hasDemoMarker && (
        <WalletSessionBar
          session={wallet.session}
          onConnect={wallet.actions.connect}
          onDisconnect={wallet.actions.disconnect}
          configMissing={wallet.configMissing}
        />
      )}

      {/* Demo harness renders the phase panel exactly as before. */}
      {hasDemoMarker && <PhasePanel phase={phase} />}

      {/* Real route: wallet gates first (panel keeps the phase visible). */}
      {!hasDemoMarker && walletGate && <PhasePanel phase={phase} />}

      {!hasDemoMarker && phase.kind === 'wallet-required' && !wallet.configMissing && (
        <p className="footnote" data-testid="wallet-connect-prompt">
          {walletCopy.connectPrompt}
        </p>
      )}

      {!hasDemoMarker && phase.kind === 'wrong-network' && (
        <WrongNetworkPanel
          session={wallet.session}
          onSwitch={wallet.actions.switchToArbitrumSepolia}
          onDisconnect={wallet.actions.disconnect}
          switchError={wallet.lastError}
        />
      )}

      {/* GAME-209: surface funding guidance for zero-balance wallets on real routes. */}
      {!hasDemoMarker &&
        wallet.session.isConnected &&
        wallet.session.isCorrectChain &&
        wallet.balanceStatus === 'zero' && (
          <LowBalanceNotice
            session={wallet.session}
            balanceWei={wallet.balance}
            onFund={() => {
              wallet.actions.prepareHandoff()
              if (typeof window !== 'undefined') {
                window.open(FAUCET_URL, '_blank', 'noopener,noreferrer')
              }
            }}
          />
        )}

      {/* Match query states (GAME-508): loading, unavailable, not found. */}
      {showLoading && (
        <p className="status-sub" data-testid="match-loading">
          {matchStateCopy.loading}
        </p>
      )}

      {showError && (
        <div className="home-actions" data-testid="match-error">
          <p className="error-note" role="alert">
            {errorMessage(query.error ?? 'match-load-failed')}
          </p>
          <button className="btn" data-testid="match-retry" onClick={query.refetch}>
            {matchStateCopy.retry}
          </button>
        </div>
      )}

      {showNotFound && (
        <div className="home-actions" data-testid="match-not-found">
          <p className="status-label">{phaseCopy.notFound}</p>
          <p className="status-sub">{errorMessage('match-not-found')}</p>
        </div>
      )}

      {/* Live match content, keyed off the resolved phase (GAME-507/508). */}
      {showMatch && match && (
        <>
          <PhasePanel phase={phase} />

          {phase.kind === 'join' && (
            <JoinPanel
              match={match}
              writeClient={writeClient}
              canWrite={wallet.canWrite}
              onJoined={query.refetch}
              prepareHandoff={wallet.actions.prepareHandoff}
            />
          )}

          {phase.kind === 'waiting-for-opponent' &&
            match.status === 'WaitingForOpponent' &&
            isCreator && (
              <InviteWaitingPanel
                match={match}
                writeClient={writeClient}
                canWrite={wallet.canWrite}
                onCancelled={query.refetch}
                prepareHandoff={wallet.actions.prepareHandoff}
              />
            )}

          {phase.kind === 'waiting-for-opponent' &&
            match.status === 'WaitingForOpponent' &&
            !isCreator &&
            !isInvited && (
              <p className="footnote" data-testid="wrong-wallet-note">
                {joinCopy.wrongWallet}
              </p>
            )}

          {phase.kind === 'waiting-for-opponent' && match.status !== 'WaitingForOpponent' && (
            <p className="footnote" data-testid="spectator-note">
              {matchStateCopy.spectatorActiveBody}
            </p>
          )}

          {phase.kind === 'cancelled' && (
            <p className="status-sub" data-testid="match-cancelled">
              {matchStateCopy.cancelledBody}
            </p>
          )}

          {phase.kind === 'forfeited' && (
            <p className="status-sub" data-testid="match-forfeited">
              {matchStateCopy.forfeitedBody}
            </p>
          )}

          <MatchIdentityPanel
            match={match}
            contractAddress={resolution.ok ? resolution.record.address : null}
          />
        </>
      )}

      <div className="home-actions">
        <Link className="btn primary" to="/practice">
          {matchRouteCopy.backToPractice}
        </Link>
        {!ready && (
          <p className="footnote" data-testid="deployment-pending">
            {deploymentCopy.pendingNote}
          </p>
        )}
        {hasDemoMarker && <p className="footnote">{matchRouteCopy.shellFootnote}</p>}
        {/* Expose handoff restore signal for tests / visual verification (GAME-210). */}
        {!hasDemoMarker && wallet.handoffRestored && (
          <p className="footnote" data-testid="handoff-restored">
            {walletCopy.restoredFromHandoff}
          </p>
        )}
      </div>
    </div>
  )
}
