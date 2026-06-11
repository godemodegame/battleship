/**
 * Friend match creation (GAME-505 / GAME-506, Flow 5 in docs/user-flows.md).
 *
 * Strict friend invite: the creator enters the friend's wallet address, the
 * write client submits `createMatch(invitedOpponent)`, and on confirmation the
 * creator lands on the versioned match route where the invite link lives.
 * Validation happens before the wallet ever opens; duplicate submission is
 * blocked by the tracked-write busy state.
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createMatchCopy, deploymentCopy, matchStateCopy, walletCopy } from '../../copy/en'
import { useBattleshipClients } from '../client/useBattleshipClients'
import { isTxBusy } from '../client/txTracker'
import { useTrackedWrite } from '../client/useTrackedWrite'
import { getActiveDeploymentId } from '../deployments'
import { inviteLinkPath } from '../inviteLink'
import type { HexAddress } from '../phaseResolver'
import { useWalletSession } from '../wallet/WalletSessionContext'
import { WalletSessionBar } from '../wallet/WalletSessionBar'
import { WrongNetworkPanel } from '../wallet/WrongNetworkPanel'
import { LowBalanceNotice, FAUCET_URL } from '../wallet/LowBalanceNotice'
import { TxStatusLine } from './TxStatusLine'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/** Pure input validation (GAME-505); returns player-facing copy or null. */
export function validateInvitedAddress(
  value: string,
  selfAddress: string | null,
): string | null {
  const trimmed = value.trim()
  if (!trimmed) return createMatchCopy.validationEmpty
  if (!ADDRESS_RE.test(trimmed)) return createMatchCopy.validationInvalid
  if (selfAddress && trimmed.toLowerCase() === selfAddress.toLowerCase()) {
    return createMatchCopy.validationSelf
  }
  return null
}

export function CreateFriendMatchScreen() {
  const wallet = useWalletSession()
  const navigate = useNavigate()
  const deploymentId = getActiveDeploymentId()
  const clients = useBattleshipClients(deploymentId)
  const tx = useTrackedWrite()

  const [address, setAddress] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [pasteNote, setPasteNote] = useState<string | null>(null)

  const session = wallet.session
  const { resolution, writeClient } = clients
  const deploymentReady = resolution.ok && resolution.ready
  const busy = isTxBusy(tx.state)

  async function onPaste() {
    setPasteNote(null)
    try {
      const text = await navigator.clipboard.readText()
      setAddress(text.trim())
      setValidationError(null)
    } catch {
      setPasteNote(createMatchCopy.pasteFailed)
    }
  }

  async function onCreate() {
    const problem = validateInvitedAddress(address, session.address)
    setValidationError(problem)
    if (problem || !writeClient || !wallet.canWrite || busy) return

    // A mobile wallet confirmation may background the browser; record the
    // route so the return path restores match creation (GAME-210).
    wallet.actions.prepareHandoff()
    const invited = address.trim().toLowerCase() as HexAddress
    const result = await tx.run((onState) => writeClient.createMatch(invited, onState))
    if (result?.ok) {
      navigate(inviteLinkPath(deploymentId, result.matchId.toString()))
    }
  }

  return (
    <div className="overlay home" data-testid="create-match-screen">
      <div className="title-lockup">
        <span className="title-kicker">{createMatchCopy.kicker}</span>
        <h1>{createMatchCopy.title}</h1>
      </div>

      <WalletSessionBar
        session={session}
        onConnect={wallet.actions.connect}
        onDisconnect={wallet.actions.disconnect}
        configMissing={wallet.configMissing}
      />

      {!session.isConnected && !wallet.configMissing && (
        <p className="footnote" data-testid="create-connect-prompt">
          {walletCopy.connectPrompt}
        </p>
      )}

      {session.isConnected && !session.isCorrectChain && (
        <WrongNetworkPanel
          session={session}
          onSwitch={wallet.actions.switchToArbitrumSepolia}
          onDisconnect={wallet.actions.disconnect}
          switchError={wallet.lastError}
        />
      )}

      {session.isConnected && session.isCorrectChain && !resolution.ok && (
        <p className="footnote" data-testid="create-deployment-unavailable">
          {resolution.reason === 'invalid'
            ? deploymentCopy.invalidBody(deploymentId)
            : deploymentCopy.unknownBody(deploymentId)}
        </p>
      )}

      {session.isConnected && session.isCorrectChain && resolution.ok && !resolution.ready && (
        <p className="footnote" data-testid="create-deployment-pending">
          {deploymentCopy.pendingNote}
        </p>
      )}

      {session.isConnected &&
        session.isCorrectChain &&
        wallet.balanceStatus === 'zero' && (
          <LowBalanceNotice
            session={session}
            balanceWei={wallet.balance}
            onFund={() => {
              wallet.actions.prepareHandoff()
              if (typeof window !== 'undefined') {
                window.open(FAUCET_URL, '_blank', 'noopener,noreferrer')
              }
            }}
          />
        )}

      {session.isConnected && session.isCorrectChain && deploymentReady && (
        <div className="home-actions" data-testid="create-match-form">
          <label className="field-label" htmlFor="invited-address">
            {createMatchCopy.addressLabel}
          </label>
          <input
            id="invited-address"
            className="text-field"
            data-testid="invited-address-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={createMatchCopy.addressPlaceholder}
            value={address}
            disabled={busy}
            onChange={(e) => {
              setAddress(e.target.value)
              if (validationError) setValidationError(null)
            }}
          />
          {validationError && (
            <p className="error-note" role="alert" data-testid="address-validation-error">
              {validationError}
            </p>
          )}
          {pasteNote && (
            <p className="footnote" data-testid="paste-note">
              {pasteNote}
            </p>
          )}
          <p className="footnote">{createMatchCopy.helper}</p>

          <div className="button-row">
            <button className="btn" data-testid="paste-address" disabled={busy} onClick={onPaste}>
              {createMatchCopy.paste}
            </button>
            <button
              className="btn primary"
              data-testid="create-match"
              disabled={busy || !wallet.canWrite}
              onClick={onCreate}
            >
              {busy ? createMatchCopy.creating : createMatchCopy.create}
            </button>
          </div>

          <TxStatusLine state={tx.state} onRetry={tx.reset} />
        </div>
      )}

      <div className="home-actions">
        <Link className="btn ghost" data-testid="create-back" to="/practice">
          {matchStateCopy.backToMenu}
        </Link>
      </div>
    </div>
  )
}
