import { encodeEventTopics } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { battleshipGameAbi } from '../abi/battleshipGame'
import {
  createBattleshipReadClient,
  createBattleshipWriteClient,
  extractCreatedMatchId,
  type MatchEventRef,
  type PublicClientLike,
  type WalletClientLike,
} from './battleshipClient'
import type { RawMatchView } from './mapping'
import type { Hash, TxState } from './txTracker'

const CONTRACT = '0xcccc000000000000000000000000000000000003' as const
const CREATOR = '0xaaaa000000000000000000000000000000000001' as const
const INVITED = '0xbbbb000000000000000000000000000000000002' as const
const TX_HASH = '0xdddd000000000000000000000000000000000000000000000000000000000004' as Hash

function rawMatch(over: Partial<RawMatchView> = {}): RawMatchView {
  return {
    id: 7n,
    matchType: 0,
    status: 1,
    creator: CREATOR,
    opponent: '0x0000000000000000000000000000000000000000',
    invitedOpponent: INVITED,
    currentTurn: '0x0000000000000000000000000000000000000000',
    winner: '0x0000000000000000000000000000000000000000',
    createdAt: 1n,
    joinedAt: 0n,
    startedAt: 0n,
    finishedAt: 0n,
    lastActionAt: 1n,
    moveCount: 0,
    pendingMoveId: 0,
    timeoutState: {
      joinDeadline: 100n,
      placementDeadline: 0n,
      turnDeadline: 0n,
      resolvingDeadline: 0n,
    },
    ...over,
  }
}

/** A raw (unparsed) MatchCreated log as a receipt would carry it. */
function matchCreatedLog(matchId: bigint, address: string = CONTRACT) {
  return {
    address,
    topics: encodeEventTopics({
      abi: battleshipGameAbi,
      eventName: 'MatchCreated',
      args: { matchId, creator: CREATOR, invitedOpponent: INVITED },
    }),
    data: '0x',
  }
}

function revertError(errorName: string): Error {
  return Object.assign(new Error('execution reverted'), {
    name: 'ContractFunctionExecutionError',
    cause: Object.assign(new Error('reverted'), {
      name: 'ContractFunctionRevertedError',
      data: { errorName },
    }),
  })
}

function makePublicClient(over: Partial<PublicClientLike> = {}): PublicClientLike {
  return {
    readContract: vi.fn(async () => rawMatch()),
    simulateContract: vi.fn(async () => ({ request: { mocked: true } })),
    waitForTransactionReceipt: vi.fn(async () => ({
      status: 'success' as const,
      transactionHash: TX_HASH,
      logs: [matchCreatedLog(7n)],
    })),
    watchContractEvent: vi.fn(() => () => {}),
    ...over,
  }
}

const walletClient: WalletClientLike = {
  writeContract: vi.fn(async () => TX_HASH),
}

function readClientFor(publicClient: PublicClientLike) {
  return createBattleshipReadClient({
    publicClient,
    contractAddress: CONTRACT,
    deploymentId: 'arb-sepolia-v1',
  })
}

function writeClientFor(publicClient: PublicClientLike) {
  return createBattleshipWriteClient({
    publicClient,
    walletClient,
    contractAddress: CONTRACT,
    deploymentId: 'arb-sepolia-v1',
    account: CREATOR,
  })
}

describe('createBattleshipReadClient (GAME-502/503)', () => {
  it('reads and maps getMatch through the typed view', async () => {
    const publicClient = makePublicClient()
    const view = await readClientFor(publicClient).getMatch(7n)
    expect(view!.status).toBe('WaitingForOpponent')
    expect(view!.creator).toBe(CREATOR)
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: CONTRACT, functionName: 'getMatch', args: [7n] }),
    )
  })

  it('reads and maps public placement state for both players', async () => {
    const rawPlayer = {
      player: CREATOR,
      joined: true,
      placementStatus: 3,
      fleetSubmitted: true,
      fleetValid: false,
      publicBoard: {
        attackedMask: 0n,
        missMask: 0n,
        hitMask: 0n,
        sunkMask: 0n,
      },
    }
    const publicClient = makePublicClient({
      readContract: vi.fn(async (params: { functionName: string }) =>
        params.functionName === 'getPlayers'
          ? [rawPlayer, { ...rawPlayer, player: INVITED, placementStatus: 1 }]
          : rawMatch(),
      ) as PublicClientLike['readContract'],
    })
    const players = await readClientFor(publicClient).getPlayers!(7n)
    expect(players.creator.placementStatus).toBe('ResolvingValidation')
    expect(players.opponent.placementStatus).toBe('NotSubmitted')
  })

  it('returns null for MatchNotFound instead of throwing', async () => {
    const publicClient = makePublicClient({
      readContract: vi.fn(async () => {
        throw revertError('MatchNotFound')
      }),
    })
    await expect(readClientFor(publicClient).getMatch(99n)).resolves.toBeNull()
  })

  it('rethrows non-not-found read failures for the query layer to map', async () => {
    const publicClient = makePublicClient({
      readContract: vi.fn(async () => {
        throw new Error('rpc down')
      }),
    })
    await expect(readClientFor(publicClient).getMatch(7n)).rejects.toThrow('rpc down')
  })

  it('forwards only this match’s events from the contract watcher', () => {
    let emit: (logs: unknown[]) => void = () => {}
    const publicClient = makePublicClient({
      watchContractEvent: vi.fn((params: { onLogs: (logs: unknown[]) => void }) => {
        emit = params.onLogs
        return () => {}
      }) as unknown as PublicClientLike['watchContractEvent'],
    })
    const received: MatchEventRef[][] = []
    readClientFor(publicClient).watchMatch(7n, (events) => received.push(events))

    emit([
      { eventName: 'MatchJoined', args: { matchId: 7n }, blockHash: '0xb1', logIndex: 0, transactionHash: '0xt1' },
      { eventName: 'MatchJoined', args: { matchId: 8n }, blockHash: '0xb1', logIndex: 1, transactionHash: '0xt2' },
      { eventName: 'Unrelated', args: {}, blockHash: '0xb1', logIndex: 2, transactionHash: '0xt3' },
    ])

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual([
      { eventName: 'MatchJoined', blockHash: '0xb1', logIndex: 0, transactionHash: '0xt1' },
    ])
  })
})

describe('battle reads (GAME-701/705/708)', () => {
  const rawMove = (moveId: number) => ({
    moveId,
    attacker: CREATOR,
    defender: INVITED,
    cellIndex: moveId,
    result: 1,
    sunkShipId: 0,
    submittedAt: 1n,
    resolvedAt: 2n,
    finalized: true,
  })

  it('getMoveHistory reads one page for short histories', async () => {
    const readContract = vi.fn(async () => [rawMove(1), rawMove(2)])
    const publicClient = makePublicClient({
      readContract: readContract as PublicClientLike['readContract'],
    })
    const moves = await readClientFor(publicClient).getMoveHistory!(7n, 2)
    expect(moves.map((m) => m.moveId)).toEqual([1, 2])
    expect(moves[0].result).toBe('Miss')
    expect(readContract).toHaveBeenCalledTimes(1)
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'getMoveHistory', args: [7n, 0, 50] }),
    )
  })

  it('getMoveHistory pages past the contract limit of 50', async () => {
    const readContract = vi.fn(async (params: { args: readonly unknown[] }) => {
      const offset = params.args[1] as number
      const count = offset === 0 ? 50 : 10
      return Array.from({ length: count }, (_, i) => rawMove(offset + i + 1))
    })
    const publicClient = makePublicClient({
      readContract: readContract as PublicClientLike['readContract'],
    })
    const moves = await readClientFor(publicClient).getMoveHistory!(7n, 60)
    expect(moves).toHaveLength(60)
    expect(moves.at(-1)!.moveId).toBe(60)
    expect(readContract).toHaveBeenCalledTimes(2)
  })

  it('getPendingShot maps the pending struct and null when absent', async () => {
    const rawPending = {
      exists: true,
      moveId: 5,
      attacker: CREATOR,
      defender: INVITED,
      cellIndex: 33,
      resultCtHash: 1n,
      sunkShipCtHash: 2n,
      submittedAt: 9n,
    }
    const publicClient = makePublicClient({
      readContract: vi.fn(async () => rawPending) as PublicClientLike['readContract'],
    })
    const pending = await readClientFor(publicClient).getPendingShot!(7n)
    expect(pending).toEqual({
      exists: true,
      moveId: 5,
      attacker: CREATOR,
      defender: INVITED,
      cellIndex: 33,
      resultCtHash: 1n,
      sunkShipCtHash: 2n,
      submittedAt: 9,
    })

    const absent = makePublicClient({
      readContract: vi.fn(async () => ({
        ...rawPending,
        exists: false,
      })) as PublicClientLike['readContract'],
    })
    await expect(readClientFor(absent).getPendingShot!(7n)).resolves.toBeNull()
  })

  it('getPendingPlacementValidation maps the struct and null when absent', async () => {
    const raw = { exists: true, validityCtHash: 77n, requestedAt: 4n }
    const readContract = vi.fn(async () => raw)
    const publicClient = makePublicClient({
      readContract: readContract as PublicClientLike['readContract'],
    })
    await expect(
      readClientFor(publicClient).getPendingPlacementValidation!(7n, CREATOR),
    ).resolves.toEqual({ validityCtHash: 77n, requestedAt: 4 })
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'getPendingPlacementValidation',
        args: [7n, CREATOR],
      }),
    )

    const absent = makePublicClient({
      readContract: vi.fn(async () => ({
        ...raw,
        exists: false,
      })) as PublicClientLike['readContract'],
    })
    await expect(
      readClientFor(absent).getPendingPlacementValidation!(7n, CREATOR),
    ).resolves.toBeNull()
  })
})

describe('battle writes (GAME-704/705/710/712)', () => {
  const okReceipt = () =>
    makePublicClient({
      waitForTransactionReceipt: vi.fn(async () => ({
        status: 'success' as const,
        transactionHash: TX_HASH,
        logs: [],
      })),
    })

  it('attack simulates and submits the cell index', async () => {
    const publicClient = okReceipt()
    const result = await writeClientFor(publicClient).attack!(7n, 42, () => {})
    expect(result).toEqual({ ok: true, hash: TX_HASH })
    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'attack', args: [7n, 42], account: CREATOR }),
    )
  })

  it('attack maps NotYourTurn and CellAlreadyAttacked reverts', async () => {
    for (const [name, code] of [
      ['NotYourTurn', 'not-your-turn'],
      ['CellAlreadyAttacked', 'cell-already-attacked'],
      ['PendingShotExists', 'shot-resolving'],
    ] as const) {
      const publicClient = makePublicClient({
        simulateContract: vi.fn(async () => {
          throw revertError(name)
        }),
      })
      const result = await writeClientFor(publicClient).attack!(7n, 1, () => {})
      expect(result).toEqual({ ok: false, error: code })
    }
  })

  it('exposes finalizeAttackWithProof and claimTimeoutWin', async () => {
    const publicClient = okReceipt()
    const client = writeClientFor(publicClient)
    const resultProof = { value: 2n, signature: '0xaa' as const }
    const sunkProof = { value: 0n, signature: '0xbb' as const }

    await expect(
      client.finalizeAttackWithProof!(7n, 3, resultProof, sunkProof, () => {}),
    ).resolves.toEqual({
      ok: true,
      hash: TX_HASH,
    })
    await expect(client.claimTimeoutWin!(7n, () => {})).resolves.toEqual({
      ok: true,
      hash: TX_HASH,
    })

    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'finalizeAttackWithProof',
        args: [7n, 3, 2n, '0xaa', 0n, '0xbb'],
      }),
    )
    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'claimTimeoutWin', args: [7n] }),
    )
  })

  it('finalizeAttackWithProof maps a not-ready decryption onto retryable copy', async () => {
    const publicClient = makePublicClient({
      simulateContract: vi.fn(async () => {
        throw revertError('DecryptionResultNotReady')
      }),
    })
    const proof = { value: 0n, signature: '0x00' as const }
    const result = await writeClientFor(publicClient).finalizeAttackWithProof!(
      7n,
      3,
      proof,
      proof,
      () => {},
    )
    expect(result).toEqual({ ok: false, error: 'decryption-not-ready' })
  })
})

describe('extractCreatedMatchId', () => {
  it('extracts the id from a MatchCreated log of this contract', () => {
    expect(extractCreatedMatchId([matchCreatedLog(41n)], CONTRACT)).toBe(41n)
  })

  it('ignores MatchCreated logs from other contracts', () => {
    const foreign = matchCreatedLog(41n, '0x9999000000000000000000000000000000000009')
    expect(extractCreatedMatchId([foreign], CONTRACT)).toBeNull()
  })

  it('returns null when no MatchCreated log exists', () => {
    expect(extractCreatedMatchId([], CONTRACT)).toBeNull()
  })
})

describe('createBattleshipWriteClient (GAME-503/506/507)', () => {
  it('createMatch simulates, writes, waits, and returns the created match id', async () => {
    const publicClient = makePublicClient()
    const states: TxState[] = []
    const result = await writeClientFor(publicClient).createMatch(INVITED, (s) => states.push(s))

    expect(result).toEqual({ ok: true, hash: TX_HASH, matchId: 7n })
    expect(states.map((s) => s.phase)).toEqual(['wallet', 'pending', 'success'])
    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'createMatch', args: [INVITED], account: CREATOR }),
    )
    expect(walletClient.writeContract).toHaveBeenCalled()
  })

  it('surfaces simulation reverts before the wallet ever opens', async () => {
    const publicClient = makePublicClient({
      simulateContract: vi.fn(async () => {
        throw revertError('SelfInviteNotAllowed')
      }),
    })
    const states: TxState[] = []
    const result = await writeClientFor(publicClient).createMatch(CREATOR, (s) => states.push(s))
    expect(result).toEqual({ ok: false, error: 'self-invite' })
    expect(states.at(-1)!.phase).toBe('error')
  })

  it('joinMatch maps deadline reverts onto the join-expired code', async () => {
    const publicClient = makePublicClient({
      simulateContract: vi.fn(async () => {
        throw revertError('JoinDeadlineExpired')
      }),
    })
    const result = await writeClientFor(publicClient).joinMatch(7n, () => {})
    expect(result).toEqual({ ok: false, error: 'join-deadline-expired' })
  })

  it('cancelMatch resolves ok on a confirmed receipt', async () => {
    const publicClient = makePublicClient({
      waitForTransactionReceipt: vi.fn(async () => ({
        status: 'success' as const,
        transactionHash: TX_HASH,
        logs: [],
      })),
    })
    const result = await writeClientFor(publicClient).cancelMatch(7n, () => {})
    expect(result).toEqual({ ok: true, hash: TX_HASH })
  })

  it('reports a reverted receipt as a failed write', async () => {
    const publicClient = makePublicClient({
      waitForTransactionReceipt: vi.fn(async () => ({
        status: 'reverted' as const,
        transactionHash: TX_HASH,
        logs: [],
      })),
    })
    const result = await writeClientFor(publicClient).forfeit(7n, () => {})
    expect(result).toEqual({ ok: false, error: 'transaction-reverted' })
  })

  it('submits encrypted fleet inputs and exposes validation recovery writes', async () => {
    const publicClient = makePublicClient({
      waitForTransactionReceipt: vi.fn(async () => ({
        status: 'success' as const,
        transactionHash: TX_HASH,
        logs: [],
      })),
    })
    const client = writeClientFor(publicClient)
    const segments = Array.from({ length: 20 }, (_, index) => ({
      ctHash: BigInt(index + 1),
      securityZone: 0,
      utype: 2,
      signature: '0x12',
    }))

    await expect(client.submitFleet!(7n, segments, () => {})).resolves.toEqual({
      ok: true,
      hash: TX_HASH,
    })
    await expect(
      client.finalizeFleetValidationWithProof!(
        7n,
        CREATOR,
        { value: 1n, signature: '0xcc' },
        () => {},
      ),
    ).resolves.toEqual({ ok: true, hash: TX_HASH })

    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'submitFleet',
        args: [7n, segments],
        account: CREATOR,
      }),
    )
    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'finalizeFleetValidationWithProof',
        args: [7n, CREATOR, 1n, '0xcc'],
      }),
    )
  })
})
