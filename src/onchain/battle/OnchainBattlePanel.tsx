/**
 * On-chain battle panel (GAME-701..708, GAME-710, GAME-712).
 *
 * Renders the viewer's battle from authoritative contract reads only: the
 * decoded public boards, finalized move history, turn-gated target selection,
 * the `attack` transaction, and the pending-shot resolving state. Resolution
 * fetches the threshold-network decrypt proofs for the pending shot and
 * publishes them through the permissionless `finalizeAttackWithProof`.
 *
 * The frontend never computes hit, sunk, winner, or turn changes — every
 * board cell and result shown here was finalized by the contract, and an
 * attack receipt only moves the match into ResolvingShot (GAME-704); the
 * result appears after finalization publishes it.
 */

import { useMemo, useState } from 'react'
import { cellLabel } from '../../game/constants'
import { battleCopy } from '../../copy/en'
import { errorMessage, type ErrorCode } from '../../copy/errors'
import { sfx } from '../../lib/sfx'
import { haptics } from '../../lib/haptics'
import type { BattleshipWriteClient } from '../client/battleshipClient'
import type { ChainMatchView, ChainMoveView } from '../client/mapping'
import type { MatchPhase } from '../phaseResolver'
import type { Address } from '../renderModel'
import type { WalletContextValue } from '../wallet/WalletSessionContext'
import { TxStatusLine } from '../match/TxStatusLine'
import { pendingTxScope } from '../client/pendingTxStore'
import { useTrackedWrite } from '../client/useTrackedWrite'
import type { CofheScope } from '../fhenix/types'
import { useCofheMatchClient } from '../fhenix/useCofheMatchClient'
import { BattleGrid } from './BattleGrid'
import { buildPublicBattleModel, TOTAL_SHIPS } from './publicBattleModel'
import { useShotFx, type ShotFx } from './useShotFx'

type BattlePhase = Extract<MatchPhase, { kind: 'battle' } | { kind: 'resolving' }>

/** Transient banner for the most recent finalized shot (GAME-707). */
export function ShotResultBanner({ fx }: { fx: ShotFx | null }) {
  if (!fx) return null
  return (
    <p
      key={fx.moveId}
      className={`battle-banner tone-${fx.tone}`}
      role="status"
      data-testid="shot-result-banner"
      data-move-id={fx.moveId}
      data-result={fx.result}
    >
      {cellLabel(fx.cell)} — {fx.text}
    </p>
  )
}

/** Public move history rebuilt from contract reads (GAME-708). */
export function MoveHistoryList({
  moves,
  viewer,
}: {
  moves: ReadonlyArray<ChainMoveView> | undefined
  viewer: Address
}) {
  return (
    <div className="battle-history" data-testid="move-history">
      <span className="status-label">{battleCopy.historyTitle}</span>
      {!moves || moves.length === 0 ? (
        <p className="footnote">{battleCopy.historyEmpty}</p>
      ) : (
        <ol className="battle-history-list">
          {moves.map((move) => (
            <li key={move.moveId} data-testid="move-history-entry" data-move-id={move.moveId}>
              <span>
                {move.attacker === viewer ? battleCopy.historyYou : battleCopy.historyOpponent}
                {' → '}
                {cellLabel(move.cellIndex)}
              </span>
              <span className={`history-result ${move.result.toLowerCase()}`}>
                {battleCopy.historyResults[move.result]}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export interface OnchainBattlePanelProps {
  phase: BattlePhase
  match: ChainMatchView
  writeClient: BattleshipWriteClient | null
  wallet: WalletContextValue
  onRefetch: () => void
}

export function OnchainBattlePanel({
  phase,
  match,
  writeClient,
  wallet,
  onRefetch,
}: OnchainBattlePanelProps) {
  const viewer = wallet.session.address
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const [confirmForfeit, setConfirmForfeit] = useState(false)
  // Persist in-flight hashes per write kind so a suspended browser re-attaches
  // to the receipt after resume (GAME-802).
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
  const timeoutWrite = useTrackedWrite(txScope('timeout'))
  const [fetchingProof, setFetchingProof] = useState(false)
  const [proofError, setProofError] = useState<ErrorCode | null>(null)
  const fx = useShotFx(match, viewer)

  const model = useMemo(
    () => (viewer ? buildPublicBattleModel(match, viewer, selectedCell) : null),
    [match, viewer, selectedCell],
  )

  // The CoFHE session fetches the pending shot's decrypt proofs; it is only
  // needed while a shot is unresolved.
  const chainId = wallet.session.chainId
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
    enabled:
      phase.kind === 'resolving' &&
      wallet.canWrite &&
      Boolean(writeClient?.finalizeAttackWithProof),
    scope: cofheScope,
    publicClient: wallet.publicClient,
    walletClient: wallet.walletClient,
  })

  // The phase resolver routes non-participants away from the battle phase;
  // this guard only covers a missing players read.
  if (!viewer || !model) {
    return (
      <p className="footnote" data-testid="battle-spectator">
        {battleCopy.spectatorBattleBody}
      </p>
    )
  }

  const resolving = phase.kind === 'resolving'
  const isMyTurn = phase.kind === 'battle' && phase.isMyTurn
  // In a Bot match the "opponent turn" is the bot's: any caller advances it via
  // executeBotMove (the contract picks the target). The player drives it here.
  const isBotMatch = match.matchType === 'Bot'
  const botTurn = phase.kind === 'battle' && !isMyTurn && isBotMatch
  const busy =
    fetchingProof ||
    attackWrite.busy ||
    botMoveWrite.busy ||
    resolveWrite.busy ||
    forfeitWrite.busy ||
    timeoutWrite.busy
  const canFire =
    isMyTurn &&
    selectedCell !== null &&
    !busy &&
    wallet.canWrite &&
    Boolean(writeClient?.attack)

  // GAME-710: the player not on turn may claim once the deadline passes. Bot
  // matches are paced by the player and the contract rejects timeout claims, so
  // never offer it there.
  const nowSeconds = Math.floor(Date.now() / 1000)
  const timeoutClaimable =
    phase.kind === 'battle' &&
    !isMyTurn &&
    !isBotMatch &&
    match.deadlines.turnDeadline > 0 &&
    nowSeconds > match.deadlines.turnDeadline &&
    Boolean(writeClient?.claimTimeoutWin)

  async function fire() {
    const cell = selectedCell
    if (cell === null || !writeClient?.attack || !wallet.canWrite || busy) return
    // Prime audio in the click gesture (iOS Safari) and play the launch cue;
    // result effects wait for the finalized outcome (GAME-707).
    haptics.prime()
    sfx.fire()
    wallet.actions.prepareHandoff()
    const result = await attackWrite.run((onState) =>
      writeClient.attack!(match.matchIdBig, cell, onState),
    )
    if (result?.ok) {
      setSelectedCell(null)
      onRefetch()
    }
  }

  /**
   * Fetch both decrypt proofs for the pending shot and publish them through
   * `finalizeAttackWithProof`. Re-running after a failure is the recovery
   * path — proof fetches and the publish are re-entrant.
   */
  async function finalizeShot() {
    const pending = match.pendingShot
    if (!writeClient?.finalizeAttackWithProof || !wallet.canWrite || !cofhe.client) return
    if (!pending) {
      // The authoritative read lost the pending shot (already finalized or
      // stale view) — refetch instead of guessing ctHashes.
      onRefetch()
      return
    }

    resolveWrite.reset()
    setProofError(null)
    setFetchingProof(true)
    let resultProof: Awaited<ReturnType<typeof cofhe.client.fetchDecryptProof>>
    let sunkShipProof: Awaited<ReturnType<typeof cofhe.client.fetchDecryptProof>>
    try {
      ;[resultProof, sunkShipProof] = await Promise.all([
        cofhe.client.fetchDecryptProof(pending.resultCtHash),
        cofhe.client.fetchDecryptProof(pending.sunkShipCtHash),
      ])
    } catch {
      setProofError('proof-unavailable')
      return
    } finally {
      setFetchingProof(false)
    }

    wallet.actions.prepareHandoff()
    const result = await resolveWrite.run((onState) =>
      writeClient.finalizeAttackWithProof!(
        match.matchIdBig,
        pending.moveId,
        resultProof,
        sunkShipProof,
        onState,
      ),
    )
    if (result?.ok) onRefetch()
  }

  /**
   * Advance the bot's turn. Permissionless on-chain: the contract chooses the
   * target. The bot's shot then resolves through the same ResolvingShot flow
   * as a human attack (finalizeShot below).
   */
  async function advanceBot() {
    if (!writeClient?.executeBotMove || !wallet.canWrite || busy) return
    haptics.prime()
    wallet.actions.prepareHandoff()
    const result = await botMoveWrite.run((onState) =>
      writeClient.executeBotMove!(match.matchIdBig, onState),
    )
    if (result?.ok) onRefetch()
  }

  async function forfeit() {
    setConfirmForfeit(false)
    if (!writeClient || !wallet.canWrite) return
    wallet.actions.prepareHandoff()
    const result = await forfeitWrite.run((onState) =>
      writeClient.forfeit(match.matchIdBig, onState),
    )
    if (result?.ok) onRefetch()
  }

  async function claimTimeout() {
    if (!writeClient?.claimTimeoutWin || !wallet.canWrite) return
    wallet.actions.prepareHandoff()
    const result = await timeoutWrite.run((onState) =>
      writeClient.claimTimeoutWin!(match.matchIdBig, onState),
    )
    if (result?.ok) onRefetch()
  }

  const pendingCell = match.pendingShot?.cellIndex ?? null

  return (
    <section className="onchain-battle panel" data-testid="onchain-battle-panel">
      <div className="battle-strips">
        <span className="footnote" data-testid="enemy-ships-remaining">
          {battleCopy.enemyShips(model.opponentBoard.shipsRemaining, TOTAL_SHIPS)}
        </span>
        <span className="footnote" data-testid="your-ships-remaining">
          {battleCopy.yourShips(model.playerBoard.shipsRemaining, TOTAL_SHIPS)}
        </span>
      </div>

      <ShotResultBanner fx={fx} />

      <div className="battle-board">
        <span className="status-label">{battleCopy.enemyBoard}</span>
        <BattleGrid
          board={model.opponentBoard}
          label={battleCopy.enemyBoard}
          interactive={isMyTurn && !busy}
          selectedCell={selectedCell}
          onSelect={(cell) => {
            haptics.select()
            setSelectedCell(cell)
          }}
          flashCell={fx && fx.mine ? fx.cell : null}
          testId="enemy-battle-grid"
        />
      </div>

      {resolving && (
        <div className="home-actions" data-testid="shot-resolving">
          <span className="status-label">{battleCopy.resolvingTitle}</span>
          <p className="status-sub">
            {pendingCell !== null
              ? battleCopy.resolvingShotAt(cellLabel(pendingCell))
              : battleCopy.resolvingBody}
          </p>
          <button
            className="btn primary wide"
            data-ic="check"
            data-testid="finalize-shot"
            disabled={
              busy ||
              !wallet.canWrite ||
              !writeClient?.finalizeAttackWithProof ||
              cofhe.status !== 'ready'
            }
            onClick={() => void finalizeShot()}
          >
            {battleCopy.finalizeShot}
          </button>
          {cofhe.status === 'initializing' && (
            <p className="status-sub" data-testid="cofhe-initializing">
              {battleCopy.preparingCofhe}
            </p>
          )}
          {cofhe.status === 'error' && (
            <p className="error-note" role="alert">
              {errorMessage('proof-unavailable')}
            </p>
          )}
          {fetchingProof && (
            <p className="status-sub" data-testid="proof-fetching" role="status">
              {battleCopy.fetchingProof}
            </p>
          )}
          {proofError && (
            <p className="error-note" role="alert" data-testid="proof-error">
              {errorMessage(proofError)}
            </p>
          )}
          <TxStatusLine state={resolveWrite.state} onRetry={resolveWrite.reset} />
        </div>
      )}

      {!resolving && botTurn && (
        <div className="home-actions" data-testid="bot-turn">
          <span className="status-label">{battleCopy.botTurnTitle}</span>
          <button
            className="btn primary wide"
            data-ic="play"
            data-testid="advance-bot-turn"
            disabled={busy || !wallet.canWrite || !writeClient?.executeBotMove}
            onClick={() => void advanceBot()}
          >
            {battleCopy.advanceBotTurn}
          </button>
          <TxStatusLine state={botMoveWrite.state} onRetry={botMoveWrite.reset} />
        </div>
      )}

      {!resolving && !botTurn && (
        <>
          <button
            className="btn fire wide"
            data-testid="fire-button"
            disabled={!canFire}
            onClick={() => void fire()}
          >
            {canFire && selectedCell !== null
              ? battleCopy.fireAt(cellLabel(selectedCell))
              : isMyTurn
                ? battleCopy.selectTarget
                : battleCopy.opponentTurn}
          </button>
          <TxStatusLine state={attackWrite.state} onRetry={attackWrite.reset} />
        </>
      )}

      {timeoutClaimable && (
        <div className="home-actions" data-testid="timeout-claim">
          <p className="status-sub">{battleCopy.timeoutAvailable}</p>
          <button
            className="btn wide"
            data-testid="claim-timeout-win"
            disabled={busy || !wallet.canWrite}
            onClick={() => void claimTimeout()}
          >
            {battleCopy.claimTimeoutWin}
          </button>
          <TxStatusLine state={timeoutWrite.state} onRetry={timeoutWrite.reset} />
        </div>
      )}

      <div className="battle-board">
        <span className="status-label">{battleCopy.yourBoard}</span>
        <BattleGrid
          board={model.playerBoard}
          label={battleCopy.yourBoard}
          interactive={false}
          flashCell={fx && !fx.mine ? fx.cell : null}
          testId="player-battle-grid"
        />
      </div>

      <MoveHistoryList moves={match.moves} viewer={viewer} />

      <button
        className="btn small danger"
        data-testid="forfeit-button"
        disabled={busy || !wallet.canWrite}
        onClick={() => setConfirmForfeit(true)}
      >
        {battleCopy.forfeit}
      </button>
      <TxStatusLine state={forfeitWrite.state} onRetry={forfeitWrite.reset} />

      {confirmForfeit && (
        <div className="modal-backdrop" onClick={() => setConfirmForfeit(false)}>
          <div className="panel modal" onClick={(e) => e.stopPropagation()}>
            <h2>{battleCopy.forfeitTitle}</h2>
            <p>{battleCopy.forfeitBody}</p>
            <div className="button-row">
              <button
                className="btn small"
                data-testid="forfeit-cancel"
                onClick={() => setConfirmForfeit(false)}
              >
                {battleCopy.forfeitCancel}
              </button>
              <button
                className="btn small danger"
                data-testid="forfeit-confirm"
                onClick={() => void forfeit()}
              >
                {battleCopy.forfeitConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
