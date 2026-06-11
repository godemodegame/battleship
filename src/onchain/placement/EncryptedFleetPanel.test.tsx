import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ErrorCode } from '../../copy/errors'
import type {
  BattleshipWriteClient,
  WriteResult,
} from '../client/battleshipClient'
import type { ChainMatchView } from '../client/mapping'
import type { TxState } from '../client/txTracker'
import {
  CofheEncryptorFactoryContext,
  type CofheEncryptorFactory,
} from '../fhenix/useCofheFleetClient'
import {
  cofheScopeKey,
  type CofheFleetEncryptor,
  type CofheProgress,
} from '../fhenix/types'
import type { MatchPhase } from '../phaseResolver'
import { connectedWalletValue, CREATOR, INVITED, TX_HASH } from '../testSupport'
import { usePlacementStore } from './placementStore'
import { EncryptedFleetPanel } from './EncryptedFleetPanel'

const idleWrite = async (): Promise<WriteResult> => ({ ok: true, hash: TX_HASH })

function match(over: Partial<ChainMatchView> = {}): ChainMatchView {
  return {
    deploymentId: 'arb-sepolia-v1',
    matchId: '7',
    matchIdBig: 7n,
    status: 'WaitingForPlacement',
    matchType: 'Friend',
    creator: CREATOR,
    opponent: INVITED,
    invitedOpponent: INVITED,
    currentTurn: null,
    winner: null,
    createdAt: 1,
    joinedAt: 2,
    startedAt: 0,
    finishedAt: 0,
    lastActionAt: 2,
    moveCount: 0,
    pendingMoveId: 0,
    deadlines: {
      joinDeadline: 0,
      placementDeadline: 100,
      turnDeadline: 0,
      resolvingDeadline: 0,
    },
    ...over,
  }
}

function placementPhase(over: Partial<Extract<MatchPhase, { kind: 'placement' }>> = {}) {
  return {
    kind: 'placement',
    canSubmit: true,
    submitted: false,
    waitingForOpponent: false,
    validating: false,
    invalid: false,
    ...over,
  } as const
}

function txSuccess(onState: (state: TxState) => void) {
  onState({ phase: 'wallet', hash: null, replaced: false, error: null })
  onState({ phase: 'pending', hash: TX_HASH, replaced: false, error: null })
  onState({ phase: 'success', hash: TX_HASH, replaced: false, error: null })
}

function writeClient(over: Partial<BattleshipWriteClient> = {}): BattleshipWriteClient {
  return {
    createMatch: vi.fn(async () => ({ ok: false as const, error: 'unknown' as ErrorCode })),
    joinMatch: vi.fn(idleWrite),
    cancelMatch: vi.fn(idleWrite),
    forfeit: vi.fn(idleWrite),
    submitFleet: vi.fn(async (_matchId, _segments, onState) => {
      txSuccess(onState)
      return { ok: true as const, hash: TX_HASH }
    }),
    ...over,
  }
}

function encryptorFactory(encryptFleet = vi.fn()): CofheEncryptorFactory {
  return (config) => {
    const client: CofheFleetEncryptor = {
      execution: 'worker',
      scopeKey: cofheScopeKey(config.scope),
      initialize: vi.fn(async () => {}),
      encryptFleet: encryptFleet.mockImplementation(async (
        segments: readonly number[],
        onProgress?: (progress: CofheProgress) => void,
      ) => {
        onProgress?.('pack')
        onProgress?.('prove')
        onProgress?.('done')
        return segments.map((segment, index) => ({
          ctHash: BigInt(segment + index + 1),
          securityZone: 0,
          utype: 2,
          signature: `0x${index.toString(16).padStart(2, '0')}`,
        }))
      }),
      dispose: vi.fn(),
    }
    return client
  }
}

function renderPanel(options: {
  phase?: ReturnType<typeof placementPhase>
  client?: BattleshipWriteClient
  factory?: CofheEncryptorFactory
  onRefetch?: () => void
}) {
  const wallet = connectedWalletValue(CREATOR, {
    publicClient: {} as never,
    walletClient: {} as never,
  })
  return render(
    <CofheEncryptorFactoryContext.Provider
      value={options.factory ?? encryptorFactory()}
    >
      <EncryptedFleetPanel
        phase={options.phase ?? placementPhase()}
        match={match()}
        writeClient={options.client ?? writeClient()}
        wallet={wallet}
        onRefetch={options.onRefetch ?? vi.fn()}
      />
    </CofheEncryptorFactoryContext.Provider>,
  )
}

beforeEach(() => {
  usePlacementStore.getState().bindScope(null)
  localStorage.clear()
  sessionStorage.clear()
})

describe('EncryptedFleetPanel (GAME-602..611)', () => {
  it('encrypts 20 segments, submits once, and clears all plaintext after confirmation', async () => {
    const submitFleet = vi.fn(async (
      _matchId: bigint,
      segments: readonly unknown[],
      onState: (state: TxState) => void,
    ) => {
      expect(segments).toHaveLength(20)
      expect(segments[0]).toEqual(
        expect.objectContaining({ ctHash: expect.any(BigInt), utype: 2 }),
      )
      txSuccess(onState)
      return { ok: true as const, hash: TX_HASH }
    })
    const encryptFleet = vi.fn()
    const onRefetch = vi.fn()
    renderPanel({
      client: writeClient({ submitFleet }),
      factory: encryptorFactory(encryptFleet),
      onRefetch,
    })

    await waitFor(() => expect(screen.getByTestId('cofhe-execution')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Auto Place' }))
    expect(usePlacementStore.getState().placements.every(Boolean)).toBe(true)

    fireEvent.click(screen.getByTestId('submit-encrypted-fleet'))

    await waitFor(() => expect(submitFleet).toHaveBeenCalledTimes(1))
    expect(encryptFleet).toHaveBeenCalledTimes(1)
    expect(usePlacementStore.getState().placements.every((value) => value === null)).toBe(true)
    expect(onRefetch).toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(window.location.search).toBe('')
  })

  it('keeps plaintext for an encryption failure so the player can retry', async () => {
    const failingFactory: CofheEncryptorFactory = (config) => ({
      execution: 'worker',
      scopeKey: cofheScopeKey(config.scope),
      initialize: vi.fn(async () => {}),
      encryptFleet: vi.fn(async () => {
        throw new Error('proof failed')
      }),
      dispose: vi.fn(),
    })
    renderPanel({ factory: failingFactory })
    await waitFor(() => expect(screen.getByTestId('cofhe-execution')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Auto Place' }))
    fireEvent.click(screen.getByTestId('submit-encrypted-fleet'))

    await waitFor(() => expect(screen.getByTestId('encryption-error')).toBeTruthy())
    expect(usePlacementStore.getState().placements.every(Boolean)).toBe(true)
  })

  it('recovers a validating placement after refresh with finalize and retry actions', async () => {
    const finalizeFleetValidation = vi.fn(async (
      _matchId: bigint,
      _player: string,
      onState: (state: TxState) => void,
    ) => {
      txSuccess(onState)
      return { ok: true as const, hash: TX_HASH }
    })
    const retryFleetValidation = vi.fn(async (
      _matchId: bigint,
      _player: string,
      onState: (state: TxState) => void,
    ) => {
      txSuccess(onState)
      return { ok: true as const, hash: TX_HASH }
    })
    const onRefetch = vi.fn()
    renderPanel({
      phase: placementPhase({
        canSubmit: false,
        submitted: true,
        validating: true,
        waitingForOpponent: false,
      }),
      client: writeClient({ finalizeFleetValidation, retryFleetValidation }),
      onRefetch,
    })

    expect(screen.getByTestId('placement-validating')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Finalize Validation' }))
    await waitFor(() => expect(finalizeFleetValidation).toHaveBeenCalledWith(
      7n,
      CREATOR,
      expect.any(Function),
    ))
    expect(onRefetch).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Retry CoFHE Request' }))
    await waitFor(() => expect(retryFleetValidation).toHaveBeenCalled())
    expect(onRefetch).toHaveBeenCalledTimes(2)
  })

  it('shows an invalid contract verdict as a recoverable fresh placement', () => {
    renderPanel({ phase: placementPhase({ invalid: true }) })
    expect(screen.getByTestId('placement-invalid')).toBeTruthy()
    expect(screen.getByTestId('encrypted-placement-panel')).toBeTruthy()
  })
})
