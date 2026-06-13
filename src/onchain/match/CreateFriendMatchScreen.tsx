/**
 * Friend match creation (GAME-505 / GAME-506, Flow 5 in docs/user-flows.md).
 *
 * Placement-first invite: the creator enters the friend's wallet address AND
 * arranges their fleet locally, then a single action encrypts the fleet and
 * submits `createWithFleet(invitedOpponent, segments)` — one transaction that
 * both creates the match and locks in the encrypted fleet. The match stays
 * WaitingForOpponent; the creator's fleet validates in the background. On
 * confirmation the creator lands on the versioned match route where the invite
 * link lives. Validation happens before the wallet ever opens; duplicate
 * submission is blocked by the tracked-write busy state.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  createMatchCopy,
  openMatchCopy,
  botMatchCopy,
  botBattleCopy,
  deploymentCopy,
  encryptedPlacementCopy,
  matchStateCopy,
  walletCopy,
} from '../../copy/en'
import { StatusOverlay } from '../../ui/common'
import { errorMessage } from '../../copy/errors'
import { autoPlaceFleet, isFleetComplete } from '../../game/board'
import { useBattleshipClients } from '../client/useBattleshipClients'
import { pendingTxScope } from '../client/pendingTxStore'
import { isTxBusy } from '../client/txTracker'
import { useTrackedWrite } from '../client/useTrackedWrite'
import { getActiveDeploymentId } from '../deployments'
import { type CofheScope } from '../fhenix/types'
import { inviteLinkPath } from '../inviteLink'
import type { HexAddress } from '../phaseResolver'
import { useWalletSession } from '../wallet/WalletSessionContext'
import { WalletSessionBar } from '../wallet/WalletSessionBar'
import { WrongNetworkPanel } from '../wallet/WrongNetworkPanel'
import { LowBalanceNotice, LowBalanceWarning, FAUCET_URL } from '../wallet/LowBalanceNotice'
import { FleetPlacementBoard } from '../placement/FleetPlacementBoard'
import { useFleetSubmission } from '../placement/useFleetSubmission'
import {
  completedFleet,
  placementScopeKey,
  usePlacementStore,
  type PlacementScope,
} from '../placement/placementStore'
import { stashBotFleets } from './botFleetStash'
import { TxStatusLine } from './TxStatusLine'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

// No contract match id exists while placing; the placement / CoFHE / recovery
// scopes use this provisional key. Ciphertext binds to the account, not the
// match id, so encrypting here stays valid for the createWithFleet call.
const PROVISIONAL_MATCH_ID = 'new'

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

/**
 * Shared placement-first creation screen for both match modes:
 *   - `friend` → invite a specific wallet, then `createWithFleet`;
 *   - `open`   → host a game any random player can join, then `createOpenWithFleet`.
 * Open mode drops the invited-address input entirely (random matchmaking).
 */
function CreateMatchScreen({ mode }: { mode: 'friend' | 'open' | 'bot' }) {
  const isOpen = mode === 'open'
  const isBot = mode === 'bot'
  const isFriend = mode === 'friend'
  const copy = isBot ? botMatchCopy : isOpen ? openMatchCopy : createMatchCopy
  const wallet = useWalletSession()
  const navigate = useNavigate()
  const location = useLocation()
  const deploymentId = getActiveDeploymentId()
  const clients = useBattleshipClients(deploymentId)
  // No match id exists yet; 'new' scopes creation recovery (GAME-802).
  const tx = useTrackedWrite(
    wallet.session.address
      ? pendingTxScope({
          deploymentId,
          matchId: PROVISIONAL_MATCH_ID,
          address: wallet.session.address,
          kind: 'create',
        })
      : null,
  )

  // Rematch routes here with the previous opponent prefilled (GAME-711). A
  // rematch is a brand-new contract match; only the address carries over.
  const prefill = (location.state as { invited?: string } | null)?.invited
  const [address, setAddress] = useState(
    typeof prefill === 'string' && ADDRESS_RE.test(prefill) ? prefill : '',
  )
  const [validationError, setValidationError] = useState<string | null>(null)
  const [pasteNote, setPasteNote] = useState<string | null>(null)

  const session = wallet.session
  const { resolution, writeClient } = clients
  const deploymentReady = resolution.ok && resolution.ready

  // Local fleet placement, bound to the provisional pre-match scope.
  const placements = usePlacementStore((state) => state.placements)
  const bindScope = usePlacementStore((state) => state.bindScope)
  const clearFleet = usePlacementStore((state) => state.clearFleet)

  const walletAddress = session.address
  const chainId = session.chainId
  const placementScope = useMemo<PlacementScope | null>(
    () =>
      walletAddress && chainId
        ? {
            address: walletAddress,
            chainId,
            deploymentId,
            matchId: PROVISIONAL_MATCH_ID,
          }
        : null,
    [walletAddress, chainId, deploymentId],
  )
  const placementKey = placementScope ? placementScopeKey(placementScope) : null
  const cofheScope = useMemo<CofheScope | null>(
    () =>
      walletAddress && chainId
        ? {
            address: walletAddress,
            chainId,
            deploymentId,
            matchId: PROVISIONAL_MATCH_ID,
          }
        : null,
    [walletAddress, chainId, deploymentId],
  )

  useEffect(() => {
    bindScope(placementScope)
    return () => bindScope(null)
  }, [bindScope, placementKey])

  const canCreate = isBot
    ? Boolean(writeClient?.createBotMatch)
    : isOpen
      ? Boolean(writeClient?.createOpenWithFleet)
      : Boolean(writeClient?.createWithFleet)
  const submission = useFleetSubmission({
    enabled: wallet.canWrite && deploymentReady && canCreate,
    cofheScope,
    placementScope,
    publicClient: wallet.publicClient,
    walletClient: wallet.walletClient,
  })

  const complete = isFleetComplete(placements)
  const placedCount = placements.filter(Boolean).length
  const busy = isTxBusy(tx.state) || submission.encrypting

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
    // Only friend mode validates an invited address; open and bot have none.
    if (isFriend) {
      const problem = validateInvitedAddress(address, session.address)
      setValidationError(problem)
      if (problem) return
    }
    if (!complete || !canCreate || !wallet.canWrite || busy) {
      return
    }

    let result
    if (isBot) {
      // The bot's fleet is auto-placed and encrypted client-side ALONGSIDE the
      // player's — both in one CoFHE proof round (≈2× faster than two) — then
      // stored under the bot sentinel on-chain (no usable on-chain randomness;
      // see docs/computer-opponent-design.md). Both fleets are bound to this
      // wallet, which submits them in one createBotMatch tx. We retain both
      // plaintext fleets in memory so the battle route can render the 3D match
      // locally while every move is mirrored on-chain (see botFleetStash).
      const botPlacements = autoPlaceFleet()
      const pair = await submission.encryptBotPair(placements, botPlacements)
      if (!pair) return
      // A mobile wallet confirmation may background the browser; record the
      // route so the return path restores match creation (GAME-210).
      wallet.actions.prepareHandoff()
      result = await tx.run((onState) =>
        writeClient!.createBotMatch!(pair.player, pair.bot, onState),
      )
      const playerFleet = completedFleet({ placements })
      if (result?.ok && playerFleet) {
        stashBotFleets(deploymentId, result.matchId.toString(), {
          player: playerFleet,
          bot: botPlacements,
        })
      }
    } else {
      const encrypted = await submission.encrypt()
      if (!encrypted) return
      wallet.actions.prepareHandoff()
      if (isOpen) {
        result = await tx.run((onState) => writeClient!.createOpenWithFleet!(encrypted, onState))
      } else {
        result = await tx.run((onState) =>
          writeClient!.createWithFleet!(
            address.trim().toLowerCase() as HexAddress,
            encrypted,
            onState,
          ),
        )
      }
    }
    if (result?.ok) {
      // GAME-607: clear the plaintext fleet once the fleet is on-chain.
      clearFleet()
      navigate(inviteLinkPath(deploymentId, result.matchId.toString()))
    }
  }

  return (
    <div
      className="overlay home match-placement-route"
      data-testid={
        isBot
          ? 'create-bot-match-screen'
          : isOpen
            ? 'create-open-match-screen'
            : 'create-match-screen'
      }
    >
      <div className="title-lockup">
        <span className="title-kicker">{copy.kicker}</span>
        <h1>{copy.title}</h1>
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

      {/* GAME-804: non-blocking warning when the balance may not last a match.
          Skipped under sponsored gas — embedded-wallet writes are gasless. */}
      {!wallet.gasSponsored &&
        session.isConnected &&
        session.isCorrectChain &&
        wallet.balanceStatus === 'low' && <LowBalanceWarning balanceWei={wallet.balance} />}

      {session.isConnected && wallet.lastError === 'unsupported-wallet' && (
        <p className="error-note" role="alert" data-testid="unsupported-wallet">
          {walletCopy.unsupportedWalletBody}
        </p>
      )}

      {!wallet.gasSponsored &&
        session.isConnected &&
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
        <section className="onchain-placement panel" data-testid="create-match-form">
          {isFriend && (
            <>
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
                <button
                  className="btn"
                  data-testid="paste-address"
                  disabled={busy}
                  onClick={onPaste}
                >
                  {createMatchCopy.paste}
                </button>
              </div>
            </>
          )}

          {!isFriend && (
            <p className="footnote" data-testid={isBot ? 'bot-match-helper' : 'open-match-helper'}>
              {copy.helper}
            </p>
          )}

          <div className="placement-heading">
            <div>
              <span className="status-label">{copy.placementTitle}</span>
              <p className="status-sub">
                {placedCount}/10 placed · {copy.placementHelper}
              </p>
            </div>
          </div>

          <FleetPlacementBoard busy={busy} />

          {submission.cofhe.status === 'initializing' && (
            <p className="status-sub" data-testid="cofhe-initializing">
              {encryptedPlacementCopy.preparing}
            </p>
          )}
          {submission.cofhe.status === 'error' && (
            <p className="error-note" role="alert">
              {errorMessage('encryption-failed')}
            </p>
          )}
          {submission.encrypting && (
            <p className="status-sub" data-testid="encryption-progress">
              {encryptedPlacementCopy.encrypting}:{' '}
              {encryptedPlacementCopy.progress[submission.progress]}
            </p>
          )}
          {submission.error && (
            <p className="error-note" role="alert" data-testid="encryption-error">
              {errorMessage(submission.error)}
            </p>
          )}
          {!complete && (
            <p className="footnote" data-testid="placement-incomplete">
              {copy.placementIncomplete}
            </p>
          )}

          <button
            className="btn primary wide"
            data-ic="plus"
            data-testid="create-match"
            disabled={
              busy ||
              !complete ||
              !wallet.canWrite ||
              submission.cofhe.status !== 'ready' ||
              !canCreate
            }
            onClick={onCreate}
          >
            {busy ? copy.submittingFleet : copy.createAndSubmit}
          </button>

          <TxStatusLine state={tx.state} onRetry={tx.reset} />
        </section>
      )}

      <div className="home-actions">
        <Link
          className="btn ghost"
          data-ic="back"
          data-testid="create-back"
          to={isOpen ? '/lobby' : '/practice'}
        >
          {matchStateCopy.backToMenu}
        </Link>
      </div>

      {/* A bot match encrypts both fleets then opens the match on-chain; that
          whole gap reads as one continuous load so the frozen button is never
          on screen (the layout above stays behind it). */}
      {isBot && busy && (
        <StatusOverlay
          title={botBattleCopy.preparingTitle}
          sub={
            submission.encrypting
              ? encryptedPlacementCopy.progress[submission.progress]
              : botBattleCopy.preparingSub
          }
          testId="bot-create-loading"
        />
      )}
    </div>
  )
}

/** Friend match creation route (`/match/new`): invite a specific wallet. */
export function CreateFriendMatchScreen() {
  return <CreateMatchScreen mode="friend" />
}

/** Open match creation route (`/match/open`): host a game for any player. */
export function CreateOpenMatchScreen() {
  return <CreateMatchScreen mode="open" />
}

/** Bot match creation route (`/match/bot`): practice against the on-chain bot. */
export function CreateBotMatchScreen() {
  return <CreateMatchScreen mode="bot" />
}
