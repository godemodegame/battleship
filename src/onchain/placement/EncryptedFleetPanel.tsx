import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { FLEET, cellLabel } from '../../game/constants'
import { isFleetComplete, shipCells } from '../../game/board'
import { encryptedPlacementCopy } from '../../copy/en'
import { perf } from '../../lib/perf'
import { errorMessage, type ErrorCode } from '../../copy/errors'
import type { TxState } from '../client/txTracker'
import { pendingTxScope } from '../client/pendingTxStore'
import { useTrackedWrite } from '../client/useTrackedWrite'
import type {
  BattleshipReadClient,
  BattleshipWriteClient,
} from '../client/battleshipClient'
import type { ChainMatchView } from '../client/mapping'
import type { MatchPhase } from '../phaseResolver'
import type { WalletContextValue } from '../wallet/WalletSessionContext'
import { TxStatusLine } from '../match/TxStatusLine'
import { cofheScopeKey, type CofheProgress, type CofheScope } from '../fhenix/types'
import { useCofheMatchClient } from '../fhenix/useCofheMatchClient'
import { encodeFleetSegments } from './fleetEncoding'
import {
  completedFleet,
  placementScopeKey,
  usePlacementStore,
  type PlacementScope,
} from './placementStore'

type PlacementPhase = Extract<MatchPhase, { kind: 'placement' }>

// The 3D board (three.js) loads as its own chunk so the panel stays light;
// the DOM grid below doubles as the loading state and the no-WebGL fallback.
const PlacementCanvas = lazy(() =>
  import('../../three/PlacementCanvas').then((m) => ({ default: m.PlacementCanvas })),
)

let webglProbe: boolean | null = null
function supportsWebgl(): boolean {
  if (webglProbe !== null) return webglProbe
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    webglProbe = Boolean(gl)
    // Contexts count against a per-page budget; don't let the probe hold one.
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webglProbe = false
  }
  return webglProbe
}

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
  readClient: BattleshipReadClient | null
  writeClient: BattleshipWriteClient | null
  wallet: WalletContextValue
  onRefetch: () => void
}

export function EncryptedFleetPanel({
  phase,
  match,
  readClient,
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
  const [fetchingProof, setFetchingProof] = useState(false)
  const [proofError, setProofError] = useState<ErrorCode | null>(null)

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

  // The CoFHE session is needed for fleet encryption while placing and for
  // the validation decrypt-proof fetch while the result is pending.
  const validating = phase.validating || awaitingAuthoritativeRead
  const cofhe = useCofheMatchClient({
    enabled:
      wallet.canWrite &&
      ((phase.canSubmit && Boolean(writeClient?.submitFleet)) ||
        (validating && Boolean(writeClient?.finalizeFleetValidationWithProof))),
    scope: cofheScope,
    publicClient: wallet.publicClient,
    walletClient: wallet.walletClient,
  })

  const complete = isFleetComplete(placements)
  const placedCount = placements.filter(Boolean).length
  const cells = useMemo(() => occupiedSlots(placements), [placements])
  const busy = encrypting || fetchingProof || submitWrite.busy || validationWrite.busy

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
    setEncryptionProgress('initializing')
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
        // The CoFHE session stays alive: the validation decrypt-proof fetch
        // needs it, and it holds no fleet data after the encrypt call.
        clearFleet()
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

  /**
   * Fetch the threshold-network decrypt proof for the pending validation and
   * publish it through `finalizeFleetValidationWithProof`. Re-running this
   * action after a failure is the recovery path — every step is re-entrant.
   */
  async function finalizeValidation() {
    if (
      !address ||
      !wallet.canWrite ||
      !writeClient?.finalizeFleetValidationWithProof ||
      !readClient?.getPendingPlacementValidation ||
      !cofhe.client
    ) {
      return
    }

    validationWrite.reset()
    setProofError(null)
    setFetchingProof(true)
    let proof: Awaited<ReturnType<typeof cofhe.client.fetchDecryptProof>>
    try {
      const pending = await readClient.getPendingPlacementValidation(
        match.matchIdBig,
        address,
      )
      if (!pending) {
        // Someone already finalized this validation; the read shows it.
        onRefetch()
        return
      }
      proof = await cofhe.client.fetchDecryptProof(pending.validityCtHash)
    } catch {
      setProofError('proof-unavailable')
      return
    } finally {
      setFetchingProof(false)
    }

    wallet.actions.prepareHandoff()
    const result = await validationWrite.run((onState) =>
      writeClient.finalizeFleetValidationWithProof!(
        match.matchIdBig,
        address,
        proof,
        onState,
      ),
    )
    if (result?.ok) onRefetch()
  }

  if (validating) {
    return (
      <section className="onchain-placement panel" data-testid="placement-validating">
        <span className="status-label">{encryptedPlacementCopy.validatingTitle}</span>
        <p className="status-sub">{encryptedPlacementCopy.validatingBody}</p>
        <button
          className="btn primary wide"
          data-testid="finalize-validation"
          disabled={
            busy ||
            !wallet.canWrite ||
            !writeClient?.finalizeFleetValidationWithProof ||
            cofhe.status !== 'ready'
          }
          onClick={() => void finalizeValidation()}
        >
          {encryptedPlacementCopy.finalize}
        </button>
        {cofhe.status === 'initializing' && (
          <p className="status-sub" data-testid="cofhe-initializing">
            {encryptedPlacementCopy.preparing}
          </p>
        )}
        {cofhe.status === 'error' && (
          <p className="error-note" role="alert">
            {errorMessage('encryption-failed')}
          </p>
        )}
        {fetchingProof && (
          <p className="status-sub" data-testid="proof-fetching" role="status">
            {encryptedPlacementCopy.fetchingProof}
          </p>
        )}
        {proofError && (
          <p className="error-note" role="alert" data-testid="proof-error">
            {errorMessage(proofError)}
          </p>
        )}
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

      {(() => {
        const grid = (
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
        )
        if (!supportsWebgl()) return grid
        return (
          <div className="placement-stage" data-testid="placement-stage">
            <Suspense fallback={grid}>
              <PlacementCanvas
                placements={placements}
                selectedSlot={selectedSlot}
                orientation={orientation}
                disabled={busy}
                onPlace={(row, col) => void placeAt(row, col)}
                onPickUp={(cell) => void pickUpAt(cell)}
              />
            </Suspense>
          </div>
        )
      })()}

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
    </section>
  )
}
