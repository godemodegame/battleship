/**
 * On-chain bot battle, rendered through the practice 3D engine.
 *
 * The client holds ONLY the player's plaintext fleet (see botFleetStash); the
 * bot's fleet stays encrypted on-chain, hidden from the player just like a human
 * opponent's. So this controller seeds the practice store with a `MatchState`
 * whose own board is known and whose enemy board has no geometry
 * (`createMatchVsHiddenEnemy`), and mounts the practice scene + HUD (3D ships on
 * the player's side, projectile arcs, hit/miss/sunk VFX, camera swings, sounds).
 * An injected `BattleDriver` runs every move on-chain and feeds results back:
 *  - the player's shot → `attack` + auto `finalizeAttackWithProof`, then the
 *    contract's decrypted result is read back and animated. The player therefore
 *    cannot know hit/miss before the transaction (the whole point of this mode);
 *  - the bot's shot → `executeBotMove` (the contract picks the cell, which we
 *    read back and resolve LOCALLY against the player's own known board) +
 *    auto-finalize.
 *
 * No manual "Finalize Shot" / "Advance Opponent Turn" buttons: the store's
 * `fire()` loop drives the whole sequence. The enemy board shows only the
 * chain's hit/miss/sunk markers (no revealed bot hulls). On an unrecoverable
 * on-chain error the player can forfeit (on-chain) or reload (which drops the
 * stash and falls back to the authoritative DOM battle panel).
 */

import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GameCanvas } from '../../three/Scene'
import { BattleHUD } from '../../ui/BattleHUD'
import { GameOverScreen } from '../../ui/GameOverScreen'
import { LoadingOverlay, StatusOverlay } from '../../ui/common'
import { createMatchVsHiddenEnemy } from '../../game/engine'
import { botBattleCopy } from '../../copy/en'
import {
  resetPracticeState,
  useStore,
  type PlayerShotOutcome,
} from '../../practice/practiceStore'
import type { BattleshipReadClient, BattleshipWriteClient } from '../client/battleshipClient'
import type { ChainMatchView, ChainMoveView } from '../client/mapping'
import { useMatchScopes } from './useMatchScopes'
import { useTrackedWrite, type TrackedWrite } from '../client/useTrackedWrite'
import { useCofheMatchClient, type CofheClientState } from '../fhenix/useCofheMatchClient'
import type { WalletContextValue } from '../wallet/WalletSessionContext'
import type { BotFleets } from '../match/botFleetStash'

/** Everything the on-chain mirror needs, captured in a ref so the driver is stable. */
interface DriverApi {
  matchId: bigint
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

export interface BotBattleControllerProps {
  fleets: BotFleets
  match: ChainMatchView
  writeClient: BattleshipWriteClient | null
  readClient: BattleshipReadClient | null
  wallet: WalletContextValue
  onRefetch: () => void
}

export function BotBattleController({
  fleets,
  match,
  writeClient,
  readClient,
  wallet,
  onRefetch,
}: BotBattleControllerProps) {
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
  const apiRef = useRef<DriverApi>({
    matchId: match.matchIdBig,
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

  const driver = useMemo(
    () => ({
      submitPlayerShot: (cell: number) => withRetry(() => runPlayerShot(apiRef.current, cell)),
      resolveBotShot: () => withRetry(() => runBotShot(apiRef.current)),
      forfeit: async () => {
        const api = apiRef.current
        if (!api.writeClient) return
        api.wallet.actions.prepareHandoff()
        await api.forfeitWrite.run((onState) => api.writeClient!.forfeit(api.matchId, onState))
        api.onRefetch()
      },
    }),
    [],
  )

  // Seed the practice store into a live battle from the known fleets, once. The
  // player moves first (contract rule); `busy` gates input until CoFHE is ready.
  useEffect(() => {
    useStore.setState({
      screen: 'battle',
      match: createMatchVsHiddenEnemy(fleets.player.slice()),
      focus: 'enemy',
      selectedCell: null,
      busy: true,
      confirming: false,
      driverError: false,
      recoveryCell: null,
      battleDriver: null,
      effects: [],
      projectiles: [],
      toast: null,
      forfeited: false,
    })
    return () => {
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

  // Hash of whichever on-chain write is currently in flight, for the explorer
  // link in the confirming overlay (null until the tx is broadcast).
  const inFlightWrite = [resolveWrite, botMoveWrite, attackWrite].find((w) => w.busy)
  const activeTxHash = inFlightWrite?.state.hash ?? null

  // Mid-battle full-screen status: a reconnect in progress, or the opponent's
  // move settling on-chain. The player's own shot keeps its projectile/impact
  // animation (no overlay) so the reveal still lands dramatically.
  const reconnecting = driverError && !hasWinner
  const opponentConfirming = confirming && turn === 'bot' && !hasWinner
  const showChainOverlay = !warming && screen !== 'gameover' && (reconnecting || opponentConfirming)

  return (
    <div className="app" data-testid="bot-battle-3d">
      <GameCanvas />
      {screen === 'battle' && <BattleHUD />}
      {screen === 'gameover' && (
        <GameOverScreen
          onPlayAgain={() => navigate('/match/bot')}
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
      {showChainOverlay && (
        <StatusOverlay
          dim
          tone={reconnecting ? 'amber' : 'cyan'}
          title={reconnecting ? botBattleCopy.reconnectingTitle : botBattleCopy.confirmingTitle}
          sub={reconnecting ? botBattleCopy.reconnectingSub : botBattleCopy.confirmingBotSub}
          txHash={activeTxHash}
          testId={reconnecting ? 'bot-battle-reconnecting' : 'bot-battle-confirming'}
        />
      )}
      <LoadingOverlay />
    </div>
  )
}
