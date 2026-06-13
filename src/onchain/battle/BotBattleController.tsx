/**
 * On-chain bot battle, rendered through the practice 3D engine.
 *
 * A bot match is the one mode where the client knows BOTH plaintext fleets (the
 * player placed theirs; the client generated the bot's — see botFleetStash). So
 * this controller seeds the practice store with a local `MatchState` built from
 * those fleets and mounts the exact practice scene + HUD (3D ships, projectile
 * arcs, hit/miss/sunk VFX, camera swings, sounds). The battle plays instantly
 * and locally, while an injected `BattleDriver` mirrors every move on-chain:
 *  - the player's shot → `attack` + auto `finalizeAttackWithProof`;
 *  - the bot's shot → `executeBotMove` (the contract picks the cell, which we
 *    read back and animate) + auto-finalize.
 *
 * No manual "Finalize Shot" / "Advance Opponent Turn" buttons: the store's
 * `fire()` loop drives the whole sequence. The local result always matches what
 * the contract finalizes (both sides hold the same fleets), so the boards stay
 * in lockstep with the chain. On an unrecoverable on-chain error the player can
 * forfeit (on-chain) or reload (which drops the stash and falls back to the
 * authoritative DOM battle panel).
 */

import { useEffect, useMemo, useRef } from 'react'
import { GameCanvas } from '../../three/Scene'
import { BattleHUD } from '../../ui/BattleHUD'
import { LoadingOverlay, StatusOverlay } from '../../ui/common'
import { createMatch } from '../../game/engine'
import { botBattleCopy } from '../../copy/en'
import { resetPracticeState, useStore } from '../../practice/practiceStore'
import type { BattleshipReadClient, BattleshipWriteClient } from '../client/battleshipClient'
import type { ChainMatchView } from '../client/mapping'
import { pendingTxScope } from '../client/pendingTxStore'
import { useTrackedWrite, type TrackedWrite } from '../client/useTrackedWrite'
import type { CofheScope } from '../fhenix/types'
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

/** Player shot: attack (unless one is already pending) then finalize. */
async function runPlayerShot(api: DriverApi, cell: number): Promise<void> {
  if (!api.writeClient?.attack || !api.readClient?.getPendingShot) {
    throw new Error('Battle client not ready')
  }
  const existing = await api.readClient.getPendingShot(api.matchId)
  if (!existing?.exists) {
    api.wallet.actions.prepareHandoff()
    const res = await api.attackWrite.run((onState) =>
      api.writeClient!.attack!(api.matchId, cell, onState),
    )
    if (!res?.ok) throw new Error('Attack transaction failed')
  }
  await finalizePending(api)
  api.onRefetch()
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

  const viewer = wallet.session.address
  const chainId = wallet.session.chainId

  const txScope = (kind: string) =>
    viewer
      ? pendingTxScope({
          deploymentId: match.deploymentId,
          matchId: match.matchIdBig,
          address: viewer,
          kind,
        })
      : null
  const attackWrite = useTrackedWrite(txScope('attack'))
  const botMoveWrite = useTrackedWrite(txScope('botMove'))
  const resolveWrite = useTrackedWrite(txScope('resolve'))
  const forfeitWrite = useTrackedWrite(txScope('forfeit'))

  const cofheScope = useMemo<CofheScope | null>(
    () =>
      viewer && chainId
        ? {
            address: viewer,
            chainId,
            deploymentId: match.deploymentId,
            matchId: match.matchIdBig,
          }
        : null,
    [viewer, chainId, match.deploymentId, match.matchIdBig],
  )
  const cofhe = useCofheMatchClient({
    enabled: wallet.canWrite && Boolean(writeClient?.finalizeAttackWithProof),
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
      submitPlayerShot: (cell: number) => runPlayerShot(apiRef.current, cell),
      resolveBotShot: () => runBotShot(apiRef.current),
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
      match: createMatch(fleets.player.slice(), fleets.bot.slice()),
      focus: 'enemy',
      selectedCell: null,
      busy: true,
      confirming: false,
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

  const warming = cofhe.status !== 'ready'

  return (
    <div className="app" data-testid="bot-battle-3d">
      <GameCanvas />
      {screen === 'battle' && <BattleHUD />}
      {warming && (
        <StatusOverlay
          title={botBattleCopy.warmingTitle}
          sub={cofhe.status === 'error' ? botBattleCopy.syncFailed : botBattleCopy.warmingSub}
          testId="bot-battle-warming"
        />
      )}
      <LoadingOverlay />
    </div>
  )
}
