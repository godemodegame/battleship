/**
 * GAME-904 (browser surfaces): drives a complete place → encrypt → submit
 * flow and proves the plaintext fleet never escapes the encryption boundary:
 *
 * - the only consumer of plaintext segments is the CoFHE encryptor;
 * - the write client receives exactly the encryptor's opaque ciphertext
 *   handles, never cell indexes;
 * - no web storage entry and no console output produced by the flow contains
 *   the fleet;
 * - the in-memory plaintext is wiped as soon as the receipt confirms.
 *
 * Together with `fhenix/privacy.test.ts` (static source scan) and the
 * contract-side `fleetPrivacy.test.ts`, this closes the release blocker
 * "any plaintext fleet leak".
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BattleshipWriteClient } from '../client/battleshipClient'
import type { ChainMatchView } from '../client/mapping'
import type { TxState } from '../client/txTracker'
import {
  CofheClientFactoryContext,
  type CofheClientFactory,
} from '../fhenix/useCofheMatchClient'
import {
  cofheScopeKey,
  type CofheMatchClient,
  type EncryptedFleetSegment,
} from '../fhenix/types'
import type { MatchPhase } from '../phaseResolver'
import { connectedWalletValue, CREATOR, INVITED, TX_HASH } from '../testSupport'
import { EncryptedFleetPanel } from './EncryptedFleetPanel'
import { encodeFleetSegments } from './fleetEncoding'
import { usePlacementStore } from './placementStore'

const PHASE: Extract<MatchPhase, { kind: 'placement' }> = {
  kind: 'placement',
  canSubmit: true,
  submitted: false,
  waitingForOpponent: false,
  validating: false,
  invalid: false,
}

const MATCH: ChainMatchView = {
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
  deadlines: { joinDeadline: 0, placementDeadline: 100, turnDeadline: 0, resolvingDeadline: 0 },
}

/** Everything the fake encryptor saw and produced, for boundary assertions. */
const encryptorLog: { plaintext: number[][]; produced: EncryptedFleetSegment[][] } = {
  plaintext: [],
  produced: [],
}

const factory: CofheClientFactory = (config) => {
  const client: CofheMatchClient = {
    execution: 'worker',
    scopeKey: cofheScopeKey(config.scope),
    initialize: async () => {},
    encryptFleet: async (segments) => {
      encryptorLog.plaintext.push([...segments])
      const produced = segments.map((_, index) => ({
        // Opaque 256-bit-domain handles: nothing about the cell survives.
        ctHash: (1n << 200n) + BigInt(index),
        securityZone: 0,
        utype: 8,
        signature: '0xfaded',
      }))
      encryptorLog.produced.push(produced)
      return produced
    },
    fetchDecryptProof: async () => ({ value: 0n, signature: '0x00' }),
    dispose: () => {},
  }
  return client
}

const submittedPayloads: Array<{
  matchId: bigint
  segments: readonly EncryptedFleetSegment[]
}> = []

const writeClient = {
  submitFleet: async (
    matchId: bigint,
    segments: readonly EncryptedFleetSegment[],
    onState: (state: TxState) => void,
  ) => {
    submittedPayloads.push({ matchId, segments })
    onState({ phase: 'wallet', hash: null, replaced: false, error: null })
    onState({ phase: 'pending', hash: TX_HASH, replaced: false, error: null })
    onState({ phase: 'success', hash: TX_HASH, replaced: false, error: null })
    return { ok: true as const, hash: TX_HASH }
  },
} as unknown as BattleshipWriteClient

function allWebStorage(): string {
  const dump: Record<string, string | null> = {}
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)!
      dump[key] = storage.getItem(key)
    }
  }
  return JSON.stringify(dump)
}

beforeEach(() => {
  encryptorLog.plaintext.length = 0
  encryptorLog.produced.length = 0
  submittedPayloads.length = 0
  window.localStorage.clear()
  window.sessionStorage.clear()
  usePlacementStore.getState().bindScope(null)
})
afterEach(cleanup)

describe('plaintext fleet leakage across browser surfaces (GAME-904)', () => {
  it('keeps the plaintext fleet inside the encryption boundary end to end', async () => {
    const consoleSpies = (['log', 'info', 'debug', 'warn', 'error'] as const).map((level) =>
      vi.spyOn(console, level),
    )

    const wallet = connectedWalletValue(CREATOR, {
      publicClient: {} as never,
      walletClient: {} as never,
    })
    render(
      <CofheClientFactoryContext.Provider value={factory}>
        <EncryptedFleetPanel
          phase={PHASE}
          match={MATCH}
          readClient={null}
          writeClient={writeClient}
          wallet={wallet}
          onRefetch={() => {}}
        />
      </CofheClientFactoryContext.Provider>,
    )
    await waitFor(() => expect(screen.queryByTestId('cofhe-initializing')).toBeNull())

    // Place the whole fleet and capture the plaintext encoding before submit.
    await userEvent.click(screen.getByRole('button', { name: /auto/i }))
    const placements = usePlacementStore.getState().placements
    const plaintextSegments = [...encodeFleetSegments(placements)]
    expect(plaintextSegments).toHaveLength(20)

    const submitButton = screen.getByTestId('submit-encrypted-fleet')
    await waitFor(() => expect((submitButton as HTMLButtonElement).disabled).toBe(false))
    await userEvent.click(submitButton)
    await waitFor(() => expect(submittedPayloads).toHaveLength(1))

    // 1. The encryptor is the only consumer of the plaintext.
    expect(encryptorLog.plaintext).toEqual([plaintextSegments])

    // 2. The write client got exactly the opaque handles, nothing else.
    const sent = submittedPayloads[0]
    expect(sent.matchId).toBe(7n)
    expect(sent.segments).toEqual(encryptorLog.produced[0])
    for (const segment of sent.segments) {
      expect(segment.ctHash).toBeGreaterThan(1n << 64n)
      expect(JSON.stringify(segment, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      )).not.toContain(JSON.stringify(plaintextSegments))
    }

    // 3. No web storage entry contains the fleet or any placement structure.
    const storageDump = allWebStorage()
    expect(storageDump).not.toContain(plaintextSegments.join(','))
    expect(storageDump).not.toMatch(/placement|orientation|"row"|"col"/i)

    // 4. Nothing logged to the console carries the fleet.
    const fleetText = plaintextSegments.join(',')
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        const rendered = call
          .map((arg) => {
            try {
              return typeof arg === 'string'
                ? arg
                : JSON.stringify(arg, (_, value) =>
                    typeof value === 'bigint' ? value.toString() : value,
                  )
            } catch {
              return String(arg)
            }
          })
          .join(' ')
        expect(rendered).not.toContain(fleetText)
        expect(rendered).not.toContain('"placements"')
      }
    }
    consoleSpies.forEach((spy) => spy.mockRestore())

    // 5. The in-memory plaintext is wiped once the receipt confirms.
    await waitFor(() =>
      expect(usePlacementStore.getState().placements.every((p) => p === null)).toBe(true),
    )
  })
})
