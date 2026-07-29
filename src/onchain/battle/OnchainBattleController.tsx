/**
 * The on-chain battle — every mode, always the 3D engine. There is no flat
 * board anywhere in the game.
 *
 * The opponent's fleet (bot or human) stays encrypted on-chain, so the enemy
 * board never carries geometry: player shots are applied strictly from the
 * contract's decrypted result, and the player cannot know hit/miss before the
 * transaction. The controller mounts the practice scene + HUD (3D hulls,
 * projectile arcs, hit/miss/sunk VFX, camera swings, sound) and drives every
 * move through an injected `BattleDriver`:
 *  - the player's shot → `attack` + auto `finalizeAttackWithProof`, then the
 *    finalized result is read back and animated;
 *  - the bot's shot → `executeBotMove`, whose contract-chosen cell is read back;
 *  - a human opponent's shot → poll the chain for their next finalized move,
 *    helping finalize a shot they left pending (finalization is permissionless,
 *    so a stalled opponent client can never wedge this one).
 *
 * `ownFleet` is this client's own plaintext placement when it still holds it
 * (it placed the fleet in this session). Fleets are never persisted, so a
 * reload drops it — then the player's own board is hidden as well and incoming
 * shots are stamped from the contract's finalized results instead of local
 * geometry. Either way the board is rebuilt from chain history on mount
 * (`hydrateLocalMatch`), so a refresh or a second device resumes the real match
 * rather than an empty one.
 *
 * No manual "Finalize Shot" / "Advance Opponent Turn" buttons: the store's
 * `fire()` loop drives the whole sequence.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GameCanvas } from '../../three/Scene'
import { BattleHUD } from '../../ui/BattleHUD'
import { GameOverScreen } from '../../ui/GameOverScreen'
import { LoadingOverlay, StatusOverlay } from '../../ui/common'
import { battleCopy, botBattleCopy } from '../../copy/en'
import { errorMessage } from '../../copy/errors'
import {
  resetPracticeState,
  useStore,
  type OpponentShotOutcome,
  type PlayerShotOutcome,
} from '../../practice/practiceStore'
import type { Placement } from '../../game/types'
import { hydrateLocalMatch, lastFinalizedMoveId, resolvedShotOf } from './hydrateLocalMatch'
import type { BattleshipReadClient, BattleshipWriteClient } from '../client/battleshipClient'
import type { ChainMatchView, ChainMoveView } from '../client/mapping'
import type { HexAddress } from '../phaseResolver'
import { useMatchScopes } from './useMatchScopes'
import { useTrackedWrite, type TrackedWrite } from '../client/useTrackedWrite'
import { useCofheMatchClient, type CofheClientState } from '../fhenix/useCofheMatchClient'
import type { WalletContextValue } from '../wallet/WalletSessionContext'

/** Everything the on-chain mirror needs, captured in a ref so the driver is stable. */
interface DriverApi {
  matchId: bigint
  /** This client's address, to tell our own finalized moves from the opponent's. */
  viewer: HexAddress | null
  /** Highest move id already animated locally; the PvP poller waits past it. */
  lastMoveIdRef: { current: number }
  /** False once the controller unmounts, so the PvP poll loop stops. */
  aliveRef: { current: boolean }
  writeClient: BattleshipWriteClient | null
  readClient: BattleshipReadClient | null
  cofhe: CofheClientState
  wallet: WalletContextValue
  attackWrite: TrackedWrite
  botMoveWrite: TrackedWrite
  resolveWrite: TrackedWrite
  forfeitWrite: TrackedWrite
  onRefetch: () => void
}

/**
 * Backoff (ms) between automatic retries of an on-chain turn. A transient RPC
 * blip, a dropped receipt, or a momentary nonce gap on the embedded wallet is
 * far more common than a real revert; one or two quiet retries clear those
 * before the player ever sees the stall + Retry button. Both `runPlayerShot`
 * and `runBotShot` are idempotent (they reconcile against the contract's
 * pending-shot state first), so re-running them never double-fires.
 */
const RETRY_BACKOFF_MS = [700, 1800]

/**
 * Backoff (ms) for the AUTOMATIC reconnect loop. After the in-turn retries above
 * are exhausted and the turn stalls (`driverError`), the controller keeps
 * re-running `resumeBattle()` on this schedule — capped, but never giving up —
 * so a longer outage (RPC down, wallet asleep) recovers on its own without the
 * player tapping anything. The last value repeats for all further attempts.
 */
const RECONNECT_BACKOFF_MS = [800, 1600, 3000, 5000]

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const backoff = RETRY_BACKOFF_MS[attempt]
      if (backoff === undefined) break
      await new Promise((resolve) => setTimeout(resolve, backoff))
    }
  }
  throw lastError
}

/** Fetch the pending shot's decrypt proofs and publish them (finalize). */
async function finalizePending(api: DriverApi): Promise<void> {
  if (!api.readClient?.getPendingShot || !api.writeClient?.finalizeAttackWithProof) {
    throw new Error('Battle client not ready')
  }
  const client = api.cofhe.client
  if (!client) throw new Error('CoFHE session not ready')
  const pending = await api.readClient.getPendingShot(api.matchId)
  if (!pending || !pending.exists) {
    // Already finalized (e.g. a retry after a missed receipt); the read decides.
    api.onRefetch()
    return
  }
  const [resultProof, sunkShipProof] = await Promise.all([
    client.fetchDecryptProof(pending.resultCtHash),
    client.fetchDecryptProof(pending.sunkShipCtHash),
  ])
  api.wallet.actions.prepareHandoff()
  const res = await api.resolveWrite.run((onState) =>
    api.writeClient!.finalizeAttackWithProof!(
      api.matchId,
      pending.moveId,
      resultProof,
      sunkShipProof,
      onState,
    ),
  )
  if (!res?.ok) throw new Error('Could not finalize the shot on-chain')
}

/** Map a finalized on-chain move to the local animation outcome. */
function chainMoveToOutcome(move: ChainMoveView): PlayerShotOutcome {
  const sunkShipSlot = move.sunkShipId > 0 ? move.sunkShipId - 1 : null
  switch (move.result) {
    case 'Miss':
      return { result: 'miss', sunkShipSlot: null }
    case 'Hit':
      return { result: 'hit', sunkShipSlot: null }
    case 'Sunk':
      return { result: 'sunk', sunkShipSlot }
    case 'Win':
      return { result: 'won', sunkShipSlot }
    default:
      throw new Error(`Unresolved shot result: ${move.result}`)
  }
}

/**
 * Player shot: attack (unless one is already pending), finalize, then read the
 * contract's resolved result. That decrypted result — never a local fleet, which
 * this client no longer holds — is what the UI animates, so the player cannot
 * know hit/miss before the transaction, exactly like a human opponent in PvP.
 */
async function runPlayerShot(api: DriverApi, cell: number): Promise<PlayerShotOutcome> {
  if (!api.writeClient?.attack || !api.readClient?.getPendingShot || !api.readClient?.getMove) {
    throw new Error('Battle client not ready')
  }
  // Reconcile against the chain first: a retry after a dropped receipt finds the
  // shot already pending and skips a duplicate attack (which would revert).
  let pending = await api.readClient.getPendingShot(api.matchId)
  if (!pending?.exists) {
    api.wallet.actions.prepareHandoff()
    const res = await api.attackWrite.run((onState) =>
      api.writeClient!.attack!(api.matchId, cell, onState),
    )
    if (!res?.ok) throw new Error('Attack transaction failed')
    pending = await api.readClient.getPendingShot(api.matchId)
  }
  if (!pending?.exists) throw new Error('Player shot did not register on-chain')
  const moveId = pending.moveId
  await finalizePending(api)
  const move = await api.readClient.getMove(api.matchId, moveId)
  if (!move?.finalized) throw new Error('Shot result not yet on-chain')
  api.onRefetch()
  return chainMoveToOutcome(move)
}

/** Bot shot: run executeBotMove, read the contract-chosen cell, then finalize. */
async function runBotShot(api: DriverApi): Promise<number> {
  if (!api.writeClient?.executeBotMove || !api.readClient?.getPendingShot) {
    throw new Error('Battle client not ready')
  }
  let pending = await api.readClient.getPendingShot(api.matchId)
  if (!pending?.exists) {
    api.wallet.actions.prepareHandoff()
    const res = await api.botMoveWrite.run((onState) =>
      api.writeClient!.executeBotMove!(api.matchId, onState),
    )
    if (!res?.ok) throw new Error('Bot move transaction failed')
    pending = await api.readClient.getPendingShot(api.matchId)
  }
  if (!pending?.exists) throw new Error('Bot shot did not register on-chain')
  const cell = pending.cellIndex
  await finalizePending(api)
  api.onRefetch()
  return cell
}

/** How long to wait between chain reads while the opponent is thinking. */
const OPPONENT_POLL_MS = 1500

/**
 * Await the opponent's next finalized move.
 *
 * Finalization is permissionless, so whenever their shot is left pending this
 * client publishes the proofs itself instead of waiting on their tab — a closed
 * or stalled opponent client can never wedge the match. Returns the move as the
 * contract resolved it; the caller decides whether to use the result (own board
 * hidden) or only the cell (own fleet known, resolved locally).
 */
async function awaitOpponentShot(api: DriverApi): Promise<OpponentShotOutcome> {
  if (!api.readClient?.getMatch || !api.readClient?.getMove) {
    throw new Error('Battle client not ready')
  }
  while (api.aliveRef.current) {
    const pending = await api.readClient.getPendingShot?.(api.matchId)
    if (pending?.exists && pending.attacker !== api.viewer) {
      // Their shot is unresolved: publish the decrypt proofs ourselves.
      await finalizePending(api)
    }

    const view = await api.readClient.getMatch(api.matchId)
    if (!view) throw new Error('Match not found on-chain')
    for (let moveId = api.lastMoveIdRef.current + 1; moveId <= view.moveCount; moveId++) {
      const move = await api.readClient.getMove(api.matchId, moveId)
      if (!move?.finalized) break
      api.lastMoveIdRef.current = moveId
      if (move.attacker === api.viewer) continue
      const resolved = resolvedShotOf(move)
      if (!resolved) continue
      api.onRefetch()
      return {
        cell: move.cellIndex,
        result: resolved.winner ? 'won' : resolved.result,
        sunkShipSlot: resolved.shipSlot,
      }
    }

    // The match can end without another opponent move (forfeit, timeout sweep);
    // the terminal effect below lands that, so stop polling.
    if (view.status === 'Finished' || view.status === 'Forfeited') {
      throw new Error('Match ended before the opponent moved')
    }
    await new Promise((resolve) => setTimeout(resolve, OPPONENT_POLL_MS))
  }
  // The route left the battle (unmount): stop polling and let the store's
  // interrupt handling drop the turn.
  throw new Error('Battle closed')
}

/** Bot shot with the contract's finalized result, for a hidden own board. */
async function runBotShotResolved(api: DriverApi): Promise<OpponentShotOutcome> {
  const cell = await runBotShot(api)
  if (!api.readClient?.getMatch || !api.readClient?.getMove) {
    throw new Error('Battle client not ready')
  }
  const view = await api.readClient.getMatch(api.matchId)
  const move = view ? await api.readClient.getMove(api.matchId, view.moveCount) : null
  const resolved = move?.finalized ? resolvedShotOf(move) : null
  if (!resolved) throw new Error('Bot shot result not yet on-chain')
  api.lastMoveIdRef.current = move!.moveId
  return {
    cell,
    result: resolved.winner ? 'won' : resolved.result,
    sunkShipSlot: resolved.shipSlot,
  }
}

export interface OnchainBattleControllerProps {
  /** 'bot' drives the opponent's move itself; 'pvp' waits for a human. */
  mode: 'bot' | 'pvp'
  /** This client's own plaintext fleet, or null when it no longer holds it. */
  ownFleet: Placement[] | null
  match: ChainMatchView
  writeClient: BattleshipWriteClient | null
  readClient: BattleshipReadClient | null
  wallet: WalletContextValue
  onRefetch: () => void
}

export function OnchainBattleController({
  mode,
  ownFleet,
  match,
  writeClient,
  readClient,
  wallet,
  onRefetch,
}: OnchainBattleControllerProps) {
  const screen = useStore((s) => s.screen)
  const setBattleDriver = useStore((s) => s.setBattleDriver)
  const driverError = useStore((s) => s.driverError)
  const busy = useStore((s) => s.busy)
  const confirming = useStore((s) => s.confirming)
  const turn = useStore((s) => s.match?.turn)
  const hasWinner = useStore((s) => Boolean(s.match?.winner))
  const navigate = useNavigate()

  const viewer = wallet.session.address
  const chainId = wallet.session.chainId

  const { txScope, cofheScope } = useMatchScopes(match, viewer, chainId)
  const attackWrite = useTrackedWrite(txScope('attack'))
  const botMoveWrite = useTrackedWrite(txScope('botMove'))
  const resolveWrite = useTrackedWrite(txScope('resolve'))
  const forfeitWrite = useTrackedWrite(txScope('forfeit'))
  const timeoutWrite = useTrackedWrite(txScope('timeout'))

  // Start CoFHE init as soon as the wallet can write — it only needs the
  // public/wallet clients + scope, not the bound battle write client. Kicking
  // it off in parallel with that binding shortens the "preparing" wait.
  const cofhe = useCofheMatchClient({
    enabled: wallet.canWrite,
    scope: cofheScope,
    publicClient: wallet.publicClient,
    walletClient: wallet.walletClient,
  })

  // The driver is stable; it reads live values through this ref so it never
  // closes over a stale write client or CoFHE session.
  // Highest move id already animated; seeded from history so a reload does not
  // replay moves the hydrated board already shows.
  const lastMoveIdRef = useRef(lastFinalizedMoveId(match))
  const aliveRef = useRef(true)
  const apiRef = useRef<DriverApi>({
    matchId: match.matchIdBig,
    viewer,
    lastMoveIdRef,
    aliveRef,
    writeClient,
    readClient,
    cofhe,
    wallet,
    attackWrite,
    botMoveWrite,
    resolveWrite,
    forfeitWrite,
    onRefetch,
  })
  apiRef.current = {
    matchId: match.matchIdBig,
    viewer,
    lastMoveIdRef,
    aliveRef,
    writeClient,
    readClient,
    cofhe,
    wallet,
    attackWrite,
    botMoveWrite,
    resolveWrite,
    forfeitWrite,
    onRefetch,
  }

  // Own fleet known → the incoming shot is resolved against local geometry
  // (cell only), which reproduces the contract exactly and keeps the player's
  // own hulls and sunk halos intact. Own board hidden → take the contract's
  // finalized result as well, since there is nothing local to resolve against.
  const ownBoardHidden = ownFleet === null
  const driver = useMemo(
    () => ({
      submitPlayerShot: (cell: number) => withRetry(() => runPlayerShot(apiRef.current, cell)),
      resolveBotShot: () =>
        withRetry(() =>
          mode === 'bot'
            ? runBotShot(apiRef.current)
            : awaitOpponentShot(apiRef.current).then((outcome) => outcome.cell),
        ),
      ...(ownBoardHidden
        ? {
            resolveOpponentShot: () =>
              withRetry(() =>
                mode === 'bot'
                  ? runBotShotResolved(apiRef.current)
                  : awaitOpponentShot(apiRef.current),
              ),
          }
        : {}),
      forfeit: async () => {
        const api = apiRef.current
        if (!api.writeClient) return
        api.wallet.actions.prepareHandoff()
        await api.forfeitWrite.run((onState) => api.writeClient!.forfeit(api.matchId, onState))
        api.onRefetch()
      },
    }),
    [mode, ownBoardHidden],
  )

  // Seed the practice store once, rebuilding the board from chain history so a
  // reload or a mid-match arrival resumes the real match. `busy` gates input
  // until CoFHE is ready. Only a participant ever reaches this controller; the
  // guard is for the render before the players read lands.
  useEffect(() => {
    if (!viewer) return
    const seeded = hydrateLocalMatch({ match, viewer, ownFleet })
    useStore.setState({
      // A match that is already over when this client arrives (direct link,
      // reload after the final shot, on-chain forfeit) lands straight on the
      // 3D result screen rather than an unplayable board.
      screen: seeded.winner ? 'gameover' : 'battle',
      match: seeded,
      focus: 'enemy',
      selectedCell: null,
      busy: !seeded.winner,
      confirming: false,
      driverError: false,
      recoveryCell: null,
      battleDriver: null,
      effects: [],
      projectiles: [],
      toast: null,
      forfeited: match.status === 'Forfeited',
    })
    return () => {
      aliveRef.current = false
      setBattleDriver(null)
      resetPracticeState()
    }
    // Seed exactly once on mount; later match refetches must not reset the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Install the on-chain driver and release the input gate once CoFHE is ready
  // and the contract clients are bound.
  useEffect(() => {
    if (cofhe.status === 'ready' && writeClient && readClient) {
      setBattleDriver(driver)
      const state = useStore.getState()
      if (state.busy && !state.confirming) useStore.setState({ busy: false })
    }
  }, [cofhe.status, writeClient, readClient, driver, setBattleDriver])

  // Land the 3D victory/defeat overlay whenever the contract reports a terminal
  // result the local sequence hasn't reached on its own: an on-chain forfeit, a
  // turn timeout swept by the contract, or a direct navigation to an already
  // finished match. Normal play sets `gameover` locally first (with the real
  // sunk-ship board), so the `winner` guard leaves that authoritative state
  // untouched — this only fills the gap, and it ensures the flat DOM summary is
  // never the bot-mode terminal screen.
  const terminal = match.status === 'Finished' || match.status === 'Forfeited'
  useEffect(() => {
    if (!terminal) return
    const local = useStore.getState().match
    if (!local || local.winner) return
    const won = Boolean(viewer && match.winner && match.winner === viewer)
    useStore.setState({
      match: { ...local, winner: won ? 'player' : 'bot' },
      forfeited: match.status === 'Forfeited',
      screen: 'gameover',
      busy: false,
      confirming: false,
      driverError: false,
    })
  }, [terminal, match.status, match.winner, viewer])

  // Automatic reconnect: while a turn is stalled on-chain, re-run resumeBattle on
  // a capped backoff until it clears — no manual Retry tap needed. resumeBattle
  // flips busy=true (this effect backs off), then on success clears driverError
  // (counter resets) or on a fresh stall re-sets it (next, longer attempt). It is
  // idempotent (reconciles against the contract), so re-runs never double-fire.
  const reconnectAttemptRef = useRef(0)
  useEffect(() => {
    if (busy || hasWinner || screen === 'gameover') return
    if (!driverError) {
      reconnectAttemptRef.current = 0
      return
    }
    const attempt = reconnectAttemptRef.current
    const wait = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)]
    const timer = setTimeout(() => {
      reconnectAttemptRef.current = attempt + 1
      void useStore.getState().resumeBattle()
    }, wait)
    return () => clearTimeout(timer)
  }, [driverError, busy, hasWinner, screen])

  const warming = cofhe.status !== 'ready'

  // GAME-710: the player who is NOT on turn may claim the win once the turn
  // deadline passes. A bot match is paced by the player and the contract
  // rejects the claim there, so it is never offered.
  const nowSeconds = Math.floor(Date.now() / 1000)
  const timeoutClaimable =
    mode === 'pvp' &&
    match.status === 'InProgress' &&
    Boolean(viewer) &&
    match.currentTurn !== viewer &&
    match.deadlines.turnDeadline > 0 &&
    nowSeconds > match.deadlines.turnDeadline &&
    Boolean(writeClient?.claimTimeoutWin)

  async function claimTimeout() {
    if (!writeClient?.claimTimeoutWin || !wallet.canWrite) return
    wallet.actions.prepareHandoff()
    const result = await timeoutWrite.run((onState) =>
      writeClient.claimTimeoutWin!(match.matchIdBig, onState),
    )
    if (result?.ok) onRefetch()
  }

  // Hash of whichever on-chain write is currently in flight, for the explorer
  // link in the confirming overlay (null until the tx is broadcast).
  const writes = [resolveWrite, botMoveWrite, attackWrite, forfeitWrite, timeoutWrite]
  const inFlightWrite = writes.find((w) => w.busy)
  const activeTxHash = inFlightWrite?.state.hash ?? null

  // GAME-810: a failed write surfaces its MAPPED message — never a raw revert
  // string — alongside the automatic retry, so the player learns what the
  // contract refused (wrong turn, cell already taken, rejected signature).
  const writeError = writes.find((w) => w.state.error)?.state.error ?? null

  // Mid-battle full-screen status so every on-chain wait between shots is
  // legible: a reconnect in progress, the player's own shot landing, or the
  // opponent's move settling. It covers only the on-chain wait (`confirming`),
  // then clears the instant the result is known — so the hit/miss reveal still
  // animates on the board. Each variant links the in-flight transaction.
  const reconnecting = driverError && !hasWinner
  const settling = confirming && !hasWinner
  const showChainOverlay = !warming && screen !== 'gameover' && (reconnecting || settling)
  const overlay = reconnecting
    ? { title: botBattleCopy.reconnectingTitle, sub: botBattleCopy.reconnectingSub, tone: 'amber' as const, testId: 'bot-battle-reconnecting' }
    : turn === 'bot'
      ? { title: botBattleCopy.confirmingTitle, sub: botBattleCopy.confirmingBotSub, tone: 'cyan' as const, testId: 'bot-battle-confirming' }
      : { title: botBattleCopy.resolvingTitle, sub: botBattleCopy.resolvingSub, tone: 'cyan' as const, testId: 'bot-battle-resolving' }

  return (
    <div className="app" data-testid="onchain-battle-3d">
      <GameCanvas />
      {screen === 'battle' && <BattleHUD />}
      {screen === 'gameover' && (
        <GameOverScreen
          onPlayAgain={() => navigate(mode === 'bot' ? '/match/bot' : '/lobby')}
          onMainMenu={() => navigate('/practice')}
        />
      )}
      {warming && screen !== 'gameover' && (
        <StatusOverlay
          title={botBattleCopy.warmingTitle}
          sub={cofhe.status === 'error' ? botBattleCopy.syncFailed : botBattleCopy.warmingSub}
          testId="bot-battle-warming"
        />
      )}
      {timeoutClaimable && screen !== 'gameover' && (
        <div className="chain-claim" data-testid="timeout-claim">
          <p className="status-sub">{battleCopy.timeoutAvailable}</p>
          <button
            className="btn wide"
            data-testid="claim-timeout-win"
            disabled={timeoutWrite.busy || !wallet.canWrite}
            onClick={() => void claimTimeout()}
          >
            {battleCopy.claimTimeoutWin}
          </button>
        </div>
      )}
      {writeError && screen !== 'gameover' && (
        <p className="chain-error-note" role="alert" data-testid="tx-error">
          {errorMessage(writeError)}
        </p>
      )}
      {showChainOverlay && (
        <StatusOverlay
          dim
          tone={overlay.tone}
          title={overlay.title}
          sub={overlay.sub}
          txHash={activeTxHash}
          testId={overlay.testId}
        />
      )}
      <LoadingOverlay />
    </div>
  )
}
