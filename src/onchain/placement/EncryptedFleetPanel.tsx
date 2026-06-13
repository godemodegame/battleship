import { useEffect, useMemo, useRef, useState } from 'react'
import { FLEET } from '../../game/constants'
import { isFleetComplete } from '../../game/board'
import { botBattleCopy, encryptedPlacementCopy } from '../../copy/en'
import { StatusOverlay } from '../../ui/common'
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
import type { CofheProgress, CofheScope } from '../fhenix/types'
import { FleetPlacementBoard } from './FleetPlacementBoard'
import { useFleetSubmission } from './useFleetSubmission'
import {
  placementScopeKey,
  usePlacementStore,
  type PlacementScope,
} from './placementStore'

type PlacementPhase = Extract<MatchPhase, { kind: 'placement' }>

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
  const orientation = usePlacementStore((state) => state.placeOrientation)
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
  // the validation decrypt-proof fetch while the result is pending. The shared
  // hook owns the session plus the encrypt + scope-stability logic; this panel
  // wraps the returned ciphertext in its own tracked submit write.
  const validating = phase.validating || awaitingAuthoritativeRead
  const {
    cofhe,
    encrypting,
    progress: encryptionProgress,
    error: encryptionError,
    encrypt,
  } = useFleetSubmission({
    enabled:
      wallet.canWrite &&
      ((phase.canSubmit && Boolean(writeClient?.submitFleet)) ||
        (validating && Boolean(writeClient?.finalizeFleetValidationWithProof))),
    cofheScope,
    placementScope,
    publicClient: wallet.publicClient,
    walletClient: wallet.walletClient,
  })

  const complete = isFleetComplete(placements)
  const placedCount = placements.filter(Boolean).length
  const busy = encrypting || fetchingProof || submitWrite.busy || validationWrite.busy

  async function submitFleet() {
    if (!writeClient?.submitFleet || !wallet.canWrite) return

    submitWrite.reset()
    // `encrypt` reads the completed fleet from the store, runs the CoFHE encrypt
    // with progress/error wiring, and enforces scope stability; it returns null
    // (and sets `encryptionError`) if the fleet is incomplete, the session is
    // not ready, encryption fails, or the scope drifted mid-encryption.
    const encrypted = await encrypt()
    if (!encrypted) return

    wallet.actions.prepareHandoff()
    const result = await submitWrite.run((onState: (state: TxState) => void) =>
      writeClient.submitFleet!(match.matchIdBig, encrypted, onState),
    )
    if (result?.ok) {
      // GAME-607: clear plaintext immediately after the receipt confirms.
      // The CoFHE session stays alive: the validation decrypt-proof fetch
      // needs it, and it holds no fleet data after the encrypt call.
      clearFleet()
      setAwaitingAuthoritativeRead(true)
      onRefetch()
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

  // Bot match: the player should never press "Finalize Validation". The bot's
  // fleet is auto-valid on-chain, so once the CoFHE session is ready we publish
  // the player's validation proof automatically and flow straight into battle.
  // Latched to one auto-attempt; on failure the manual button below is the
  // fallback (re-armed only when the panel remounts).
  const isBot = match.matchType === 'Bot'
  const autoFinalizeRef = useRef(false)
  const validationFailed =
    proofError !== null ||
    cofhe.status === 'error' ||
    validationWrite.state.phase === 'error'
  useEffect(() => {
    if (
      isBot &&
      validating &&
      !autoFinalizeRef.current &&
      !validationFailed &&
      wallet.canWrite &&
      cofhe.status === 'ready' &&
      Boolean(writeClient?.finalizeFleetValidationWithProof) &&
      Boolean(readClient?.getPendingPlacementValidation) &&
      !busy
    ) {
      autoFinalizeRef.current = true
      void finalizeValidation()
    }
    // finalizeValidation is a stable closure over the same deps tracked here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBot, validating, validationFailed, wallet.canWrite, cofhe.status, busy])

  if (validating) {
    return (
      <section className="onchain-placement panel" data-testid="placement-validating">
        {isBot && !validationFailed && (
          <StatusOverlay
            title={botBattleCopy.startingTitle}
            sub={botBattleCopy.startingSub}
            testId="bot-validation-loading"
          />
        )}
        <span className="status-label">{encryptedPlacementCopy.validatingTitle}</span>
        <p className="status-sub">{encryptedPlacementCopy.validatingBody}</p>
        <button
          className="btn primary wide"
          data-ic="check"
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

      <FleetPlacementBoard busy={busy} />

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
        data-ic="check"
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
