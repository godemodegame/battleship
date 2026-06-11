import { useEffect, useMemo, useState } from 'react'
import { FLEET, cellLabel } from '../../game/constants'
import { isFleetComplete, shipCells } from '../../game/board'
import { encryptedPlacementCopy } from '../../copy/en'
import { perf } from '../../lib/perf'
import { errorMessage, type ErrorCode } from '../../copy/errors'
import type { TxState } from '../client/txTracker'
import { pendingTxScope } from '../client/pendingTxStore'
import { useTrackedWrite } from '../client/useTrackedWrite'
import type { BattleshipWriteClient } from '../client/battleshipClient'
import type { ChainMatchView } from '../client/mapping'
import type { MatchPhase } from '../phaseResolver'
import type { WalletContextValue } from '../wallet/WalletSessionContext'
import { TxStatusLine } from '../match/TxStatusLine'
import { cofheScopeKey, type CofheProgress, type CofheScope } from '../fhenix/types'
import { useCofheFleetClient } from '../fhenix/useCofheFleetClient'
import { encodeFleetSegments } from './fleetEncoding'
import {
  completedFleet,
  placementScopeKey,
  usePlacementStore,
  type PlacementScope,
} from './placementStore'

type PlacementPhase = Extract<MatchPhase, { kind: 'placement' }>

function occupiedSlots(
  placements: ReturnType<typeof usePlacementStore.getState>['placements'],
): Array<number | null> {
  const cells: Array<number | null> = Array.from({ length: 100 }, () => null)
  for (const placement of placements) {
    if (!placement) continue
    for (const cell of shipCells(placement, FLEET[placement.slot].length) ?? []) {
      cells[cell] = placement.slot
    }
  }
  return cells
}

function progressLabel(progress: CofheProgress): string {
  return encryptedPlacementCopy.progress[progress]
}

export interface EncryptedFleetPanelProps {
  phase: PlacementPhase
  match: ChainMatchView
  writeClient: BattleshipWriteClient | null
  wallet: WalletContextValue
  onRefetch: () => void
}

export function EncryptedFleetPanel({
  phase,
  match,
  writeClient,
  wallet,
  onRefetch,
}: EncryptedFleetPanelProps) {
  const placements = usePlacementStore((state) => state.placements)
  const selectedSlot = usePlacementStore((state) => state.selectedSlot)
  const orientation = usePlacementStore((state) => state.placeOrientation)
  const selectSlot = usePlacementStore((state) => state.selectSlot)
  const rotateSelected = usePlacementStore((state) => state.rotateSelected)
  const placeAt = usePlacementStore((state) => state.placeAt)
  const pickUpAt = usePlacementStore((state) => state.pickUpAt)
  const autoPlace = usePlacementStore((state) => state.autoPlace)
  const clearFleet = usePlacementStore((state) => state.clearFleet)
  const bindScope = usePlacementStore((state) => state.bindScope)

  // Persisted per write kind for suspension recovery (GAME-802). Only public
  // identifiers enter the scope; never ciphertext or fleet data.
  const txScope = (kind: string) =>
    wallet.session.address
      ? pendingTxScope({
          deploymentId: match.deploymentId,
          matchId: match.matchIdBig,
          address: wallet.session.address,
          kind,
        })
      : null
  const submitWrite = useTrackedWrite(txScope('submit-fleet'))
  const validationWrite = useTrackedWrite(txScope('validation'))
  const [encryptionProgress, setEncryptionProgress] =
    useState<CofheProgress>('initializing')
  const [encryptionError, setEncryptionError] = useState<ErrorCode | null>(null)
  const [encrypting, setEncrypting] = useState(false)
  const [awaitingAuthoritativeRead, setAwaitingAuthoritativeRead] = useState(false)

  const address = wallet.session.address
  const chainId = wallet.session.chainId
  const placementScope = useMemo<PlacementScope | null>(
    () =>
      address && chainId
        ? {
            address,
            chainId,
            deploymentId: match.deploymentId,
            matchId: match.matchIdBig,
          }
        : null,
    [address, chainId, match.deploymentId, match.matchIdBig],
  )
  const placementKey = placementScope ? placementScopeKey(placementScope) : null
  const cofheScope = useMemo<CofheScope | null>(
    () =>
      address && chainId
        ? {
            address,
            chainId,
            deploymentId: match.deploymentId,
            matchId: match.matchIdBig,
          }
        : null,
    [address, chainId, match.deploymentId, match.matchIdBig],
  )
  const expectedCofheKey = cofheScope ? cofheScopeKey(cofheScope) : null

  useEffect(() => {
    bindScope(placementScope)
    return () => bindScope(null)
  }, [bindScope, placementKey])

  useEffect(() => {
    if (phase.invalid || phase.validating || phase.waitingForOpponent) {
      setAwaitingAuthoritativeRead(false)
    }
  }, [phase.invalid, phase.validating, phase.waitingForOpponent])

  const cofhe = useCofheFleetClient({
    enabled: phase.canSubmit && wallet.canWrite && Boolean(writeClient?.submitFleet),
    scope: cofheScope,
    publicClient: wallet.publicClient,
    walletClient: wallet.walletClient,
  })

  const complete = isFleetComplete(placements)
  const placedCount = placements.filter(Boolean).length
  const cells = useMemo(() => occupiedSlots(placements), [placements])
  const busy = encrypting || submitWrite.busy || validationWrite.busy

  async function submitFleet() {
    const fleet = completedFleet(usePlacementStore.getState())
    if (
      !fleet ||
      !placementKey ||
      !expectedCofheKey ||
      !cofhe.client ||
      !writeClient?.submitFleet ||
      !wallet.canWrite
    ) {
      return
    }

    setEncryptionError(null)
    setEncryptionProgress('extract')
    setEncrypting(true)
    submitWrite.reset()
    let encrypted: Awaited<ReturnType<typeof cofhe.client.encryptFleet>> | null = null
    // GAME-809: encryption duration, recorded locally only (no payload data).
    const stopEncryptTimer = perf.start('encrypt-fleet')
    try {
      encrypted = await cofhe.client.encryptFleet(
        encodeFleetSegments(fleet),
        setEncryptionProgress,
      )
      stopEncryptTimer()

      const currentPlacementKey = usePlacementStore.getState().scopeKey
      if (
        currentPlacementKey !== placementKey ||
        cofhe.client.scopeKey !== expectedCofheKey
      ) {
        throw new Error('Placement scope changed during encryption')
      }

      wallet.actions.prepareHandoff()
      const result = await submitWrite.run((onState: (state: TxState) => void) =>
        writeClient.submitFleet!(match.matchIdBig, encrypted!, onState),
      )
      if (result?.ok) {
        // GAME-607: clear plaintext immediately after the receipt confirms.
        clearFleet()
        cofhe.client.dispose()
        setAwaitingAuthoritativeRead(true)
        onRefetch()
      }
    } catch {
      setEncryptionError('encryption-failed')
    } finally {
      // Do not retain account-bound ciphertext inputs for retries or another scope.
      encrypted = null
      setEncrypting(false)
    }
  }

  async function validationAction(action: 'finalize' | 'retry') {
    if (!address || !wallet.canWrite || !writeClient) return
    const method =
      action === 'finalize'
        ? writeClient.finalizeFleetValidation
        : writeClient.retryFleetValidation
    if (!method) return

    validationWrite.reset()
    wallet.actions.prepareHandoff()
    const result = await validationWrite.run((onState) =>
      method(match.matchIdBig, address, onState),
    )
    if (result?.ok) onRefetch()
  }

  if (phase.validating || awaitingAuthoritativeRead) {
    return (
      <section className="onchain-placement panel" data-testid="placement-validating">
        <span className="status-label">{encryptedPlacementCopy.validatingTitle}</span>
        <p className="status-sub">{encryptedPlacementCopy.validatingBody}</p>
        <button
          className="btn primary wide"
          disabled={busy || !wallet.canWrite || !writeClient?.finalizeFleetValidation}
          onClick={() => void validationAction('finalize')}
        >
          {encryptedPlacementCopy.finalize}
        </button>
        <button
          className="btn small"
          disabled={busy || !wallet.canWrite || !writeClient?.retryFleetValidation}
          onClick={() => void validationAction('retry')}
        >
          {encryptedPlacementCopy.retryRequest}
        </button>
        <TxStatusLine state={validationWrite.state} onRetry={validationWrite.reset} />
      </section>
    )
  }

  if (phase.waitingForOpponent && !phase.canSubmit) {
    return (
      <section className="onchain-placement panel" data-testid="placement-valid">
        <span className="status-label">{encryptedPlacementCopy.validTitle}</span>
        <p className="status-sub">{encryptedPlacementCopy.waitingOpponent}</p>
      </section>
    )
  }

  return (
    <section className="onchain-placement panel" data-testid="encrypted-placement-panel">
      <div className="placement-heading">
        <div>
          <span className="status-label">{encryptedPlacementCopy.title}</span>
          <p className="status-sub">
            {placedCount}/{FLEET.length} placed · {encryptedPlacementCopy.helper}
          </p>
        </div>
        <span className="orientation-badge">{orientation === 'h' ? 'Horizontal' : 'Vertical'}</span>
      </div>

      {phase.invalid && (
        <div className="placement-alert" role="alert" data-testid="placement-invalid">
          <strong>{encryptedPlacementCopy.invalidTitle}</strong>
          <span>{encryptedPlacementCopy.invalidBody}</span>
        </div>
      )}

      <div className="placement-grid" role="grid" aria-label="Fleet placement grid">
        {cells.map((slot, cell) => (
          <button
            key={cell}
            type="button"
            role="gridcell"
            className={`placement-cell ${slot !== null ? 'occupied' : ''}`}
            aria-label={`${cellLabel(cell)}${slot !== null ? `, ${FLEET[slot].label}` : ''}`}
            onClick={() => {
              if (busy) return
              if (slot !== null) pickUpAt(cell)
              else placeAt(Math.floor(cell / 10), cell % 10)
            }}
          >
            {slot !== null ? slot + 1 : ''}
          </button>
        ))}
      </div>

      <div className="fleet-tray">
        {FLEET.map((ship) => {
          const placed = placements[ship.slot] !== null
          const active = selectedSlot === ship.slot
          return (
            <button
              type="button"
              key={ship.slot}
              className={`chip ${placed ? 'placed' : ''} ${active ? 'active' : ''}`}
              disabled={busy}
              onClick={() => selectSlot(active ? null : ship.slot)}
            >
              <span className="chip-cells">
                {Array.from({ length: ship.length }, (_, index) => <i key={index} />)}
              </span>
              <span className="chip-label">{ship.label}</span>
            </button>
          )
        })}
      </div>

      <div className="button-row">
        <button
          className="btn small"
          disabled={busy || selectedSlot === null}
          onClick={rotateSelected}
        >
          {encryptedPlacementCopy.rotate}
        </button>
        <button className="btn small" disabled={busy} onClick={() => autoPlace()}>
          {encryptedPlacementCopy.autoPlace}
        </button>
        <button
          className="btn small"
          disabled={busy || placedCount === 0}
          onClick={clearFleet}
        >
          {encryptedPlacementCopy.clear}
        </button>
      </div>

      {cofhe.status === 'initializing' && (
        <p className="status-sub" data-testid="cofhe-initializing">
          {encryptedPlacementCopy.preparing}
        </p>
      )}
      {cofhe.status === 'ready' && cofhe.client && (
        <p className="footnote" data-testid="cofhe-execution">
          {cofhe.client.execution === 'worker'
            ? encryptedPlacementCopy.worker
            : encryptedPlacementCopy.mainThread}
        </p>
      )}
      {cofhe.status === 'error' && (
        <p className="error-note" role="alert">
          {errorMessage('encryption-failed')}
        </p>
      )}
      {encrypting && (
        <p className="status-sub" data-testid="encryption-progress">
          {encryptedPlacementCopy.encrypting}: {progressLabel(encryptionProgress)}
        </p>
      )}
      {encryptionError && (
        <p className="error-note" role="alert" data-testid="encryption-error">
          {errorMessage(encryptionError)}
        </p>
      )}

      <button
        className="btn primary wide"
        data-testid="submit-encrypted-fleet"
        disabled={
          !complete ||
          busy ||
          !wallet.canWrite ||
          cofhe.status !== 'ready' ||
          !writeClient?.submitFleet
        }
        onClick={() => void submitFleet()}
      >
        {encryptedPlacementCopy.confirm}
      </button>
      <TxStatusLine state={submitWrite.state} onRetry={submitWrite.reset} />
      <p className="footnote">{encryptedPlacementCopy.privacyNote}</p>
    </section>
  )
}
