/**
 * Funded two-wallet full encrypted match on Arbitrum Sepolia
 * (GAME-1003, GAME-1006, GAME-1009).
 *
 * Plays a complete real-chain match against the recorded deployment: create,
 * join, both encrypted fleet submissions, CoFHE placement validation, one
 * miss per side (exercising turn handoff), and a full sink-out to Win by the
 * invited opponent. Every transaction's gas/fee/latency and every CoFHE
 * decrypt-ready wait is measured and optionally written as evidence.
 *
 * It verifies chain id, deployment bytecode, record hash, wallet separation,
 * and balances before spending gas.
 *
 * Required environment:
 *   ARBITRUM_SEPOLIA_RPC_URL
 *   CREATOR_PRIVATE_KEY
 *   OPPONENT_PRIVATE_KEY
 *   DEPLOYMENT_RECORD=deployments/421614/<deploymentId>.json
 * Optional:
 *   TESTNET_EVIDENCE_PATH=/absolute/path/to/evidence.json
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatEther,
  keccak256,
  type ContractTransactionReceipt,
  type ContractTransactionResponse,
  type InterfaceAbi,
  type Log,
} from 'ethers'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
// The deployed CoFHE testnet serves tfhe-rs 1.x safe-serialized keys, which
// the legacy cofhejs 0.3.1 client cannot parse; encryption must go through
// the current @cofhe/sdk stack.
import { createCofheClient, createCofheConfig } from '@cofhe/sdk/node'
import { Encryptable } from '@cofhe/sdk'
import { arbSepolia } from '@cofhe/sdk/chains'

import { validateRecordSchema, type DeploymentRecord } from './deploymentRecord'

// Full match sends ~50 transactions including two FHE-heavy fleet
// submissions, so the floor is higher than the create/join/cancel run.
const MIN_BALANCE = 2_000_000_000_000_000n
const DECRYPT_POLL_MS = 3_000
const DECRYPT_RETRY_AFTER_MS = 4 * 60_000
const DECRYPT_TIMEOUT_MS = 10 * 60_000

const SHIP_LENGTHS = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1] as const

/// Horizontal classic-rules layout (same fixture as the contract tests).
const CREATOR_FLEET = [
  0, 1, 2, 3, 20, 21, 22, 40, 41, 42, 60, 61, 80, 81, 5, 6, 25, 45, 65, 85,
] as const

/// Vertical classic-rules layout, distinct from CREATOR_FLEET.
const OPPONENT_FLEET = [
  0, 10, 20, 30, 2, 12, 22, 4, 14, 24, 6, 16, 8, 18, 50, 60, 52, 54, 56, 58,
] as const

/// Water on both fixture boards.
const MISS_CELL = 99

const SHOT_RESULT = { Miss: 1n, Hit: 2n, Sunk: 3n, Win: 4n } as const
const STATUS = { InProgress: 5n, Finished: 7n } as const

let activeProvider: JsonRpcProvider | null = null

interface TransactionEvidence {
  action: string
  player: string
  hash: string
  gasUsed: string
  gasPriceWei: string
  feeWei: string
  walletToReceiptMs: number
}

interface ShotEvidence {
  moveId: string
  attacker: string
  cellIndex: number
  expectedResult: string
  result: string
  sunkShipId: string
  attackGas: string
  finalizeGas: string
  decryptReadyMs: number
}

interface Evidence {
  schemaVersion: number
  checkedAt: string
  chainId: number
  deploymentId: string
  contractAddress: string
  status: 'passed' | 'failed'
  error?: string
  matchId?: string
  creator?: string
  opponent?: string
  winner?: string
  moveCount?: string
  cofhe: {
    creatorEncryptMs?: number
    opponentEncryptMs?: number
    creatorValidationReadyMs?: number
    opponentValidationReadyMs?: number
  }
  transactions: TransactionEvidence[]
  shots: ShotEvidence[]
  totalGas?: string
  totalFeeWei?: string
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name} before running the full-match regression`)
  return value
}

/// Encrypts a fleet in the frozen InEuint8[20] shape as `privateKey`'s
/// account, signature-bound to that account by the CoFHE zk verifier.
async function encryptFleetAs(
  privateKey: string,
  rpcUrl: string,
  segments: readonly number[],
) {
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpcUrl) })
  const walletClient = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http(rpcUrl),
  })
  const client = createCofheClient(
    createCofheConfig({ environment: 'node', supportedChains: [arbSepolia] }),
  )
  await client.connect(publicClient, walletClient)
  return client
    .encryptInputs(segments.map((segment) => Encryptable.uint8(BigInt(segment))))
    .execute()
}

function parseEvent(
  game: Contract,
  receipt: ContractTransactionReceipt,
  eventName: string,
): Record<string, unknown> {
  for (const log of receipt.logs as Log[]) {
    try {
      const parsed = game.interface.parseLog(log)
      if (parsed?.name === eventName) return parsed.args.toObject()
    } catch {
      // Logs from CoFHE/system contracts are skipped.
    }
  }
  throw new Error(`event ${eventName} not found in receipt ${receipt.hash}`)
}

function revertName(game: Contract, error: unknown): string | null {
  const data =
    (error as { data?: unknown })?.data ??
    (error as { info?: { error?: { data?: unknown } } })?.info?.error?.data
  if (typeof data !== 'string' || !data.startsWith('0x')) return null
  try {
    return game.interface.parseError(data)?.name ?? null
  } catch {
    return null
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/// Polls a finalize static call until the CoFHE decrypt result is ready,
/// sending one on-chain retry request if it takes suspiciously long.
/// Returns the wait in milliseconds from `startedAt`.
async function waitForDecrypt(
  game: Contract,
  label: string,
  probe: () => Promise<unknown>,
  retry: () => Promise<ContractTransactionResponse>,
  startedAt: number,
): Promise<number> {
  let retried = false
  for (;;) {
    try {
      await probe()
      return Date.now() - startedAt
    } catch (error) {
      const name = revertName(game, error)
      if (name && name !== 'DecryptionResultNotReady') {
        throw new Error(`${label} failed with ${name}`)
      }
      if (name === null) {
        console.warn(`${label}: retryable probe error: ${(error as Error).message}`)
      }
    }
    const waited = Date.now() - startedAt
    if (waited > DECRYPT_TIMEOUT_MS) {
      throw new Error(`${label}: decrypt result not ready after ${waited} ms`)
    }
    if (!retried && waited > DECRYPT_RETRY_AFTER_MS) {
      retried = true
      console.warn(`${label}: re-requesting decryption after ${waited} ms`)
      await (await retry()).wait()
    }
    await sleep(DECRYPT_POLL_MS)
  }
}

async function main(): Promise<void> {
  const contractsDir = join(__dirname, '..')
  const rpcUrl = required('ARBITRUM_SEPOLIA_RPC_URL')
  const recordArg = required('DEPLOYMENT_RECORD')
  const recordPath = isAbsolute(recordArg) ? recordArg : join(contractsDir, recordArg)
  const record = JSON.parse(readFileSync(recordPath, 'utf8')) as DeploymentRecord
  const problems = validateRecordSchema(record)
  if (problems.length) throw new Error(`Invalid deployment record: ${problems.join('; ')}`)
  if (record.chainId !== 421614) throw new Error(`Expected chain 421614, got ${record.chainId}`)

  const abi = JSON.parse(
    readFileSync(join(contractsDir, 'abi', `${record.contractName}.json`), 'utf8'),
  ) as InterfaceAbi
  const provider = new JsonRpcProvider(rpcUrl)
  activeProvider = provider
  const network = await provider.getNetwork()
  if (Number(network.chainId) !== record.chainId) {
    throw new Error(`RPC chain ${network.chainId} does not match record ${record.chainId}`)
  }

  const code = await provider.getCode(record.address)
  if (code === '0x') throw new Error(`No bytecode at ${record.address}`)
  const codeHash = `keccak256:${keccak256(code)}`
  if (codeHash !== record.deployedBytecodeKeccak256) {
    throw new Error(`On-chain bytecode hash ${codeHash} does not match the record`)
  }

  const creatorKey = required('CREATOR_PRIVATE_KEY')
  const opponentKey = required('OPPONENT_PRIVATE_KEY')
  const creator = new Wallet(creatorKey, provider)
  const opponent = new Wallet(opponentKey, provider)
  if (creator.address.toLowerCase() === opponent.address.toLowerCase()) {
    throw new Error('Creator and opponent keys resolve to the same address')
  }

  const [creatorBalance, opponentBalance] = await Promise.all([
    provider.getBalance(creator.address),
    provider.getBalance(opponent.address),
  ])
  if (creatorBalance < MIN_BALANCE || opponentBalance < MIN_BALANCE) {
    throw new Error(
      `Both wallets need at least ${formatEther(MIN_BALANCE)} ETH; ` +
        `creator=${formatEther(creatorBalance)}, opponent=${formatEther(opponentBalance)}`,
    )
  }

  const evidence: Evidence = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    chainId: record.chainId,
    deploymentId: record.deploymentId,
    contractAddress: record.address,
    status: 'failed',
    creator: creator.address,
    opponent: opponent.address,
    cofhe: {},
    transactions: [],
    shots: [],
  }

  const writeEvidence = () => {
    if (process.env.TESTNET_EVIDENCE_PATH) {
      writeFileSync(
        process.env.TESTNET_EVIDENCE_PATH,
        `${JSON.stringify(evidence, null, 2)}\n`,
      )
    }
  }

  const creatorGame = new Contract(record.address, abi, creator)
  const opponentGame = new Contract(record.address, abi, opponent)

  const measuredWrite = async (
    action: string,
    player: Wallet,
    send: () => Promise<ContractTransactionResponse>,
  ): Promise<ContractTransactionReceipt> => {
    const startedAt = Date.now()
    const transaction = await send()
    const receipt = await transaction.wait()
    const finishedAt = Date.now()
    if (!receipt) throw new Error(`${action} receipt missing`)
    evidence.transactions.push({
      action,
      player: player.address,
      hash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
      gasPriceWei: receipt.gasPrice.toString(),
      feeWei: (receipt.gasUsed * receipt.gasPrice).toString(),
      walletToReceiptMs: finishedAt - startedAt,
    })
    console.log(`${action.padEnd(24)} ${receipt.hash} gas=${receipt.gasUsed}`)
    return receipt
  }

  try {
    // --- create and join -------------------------------------------------
    const createReceipt = await measuredWrite('createMatch', creator, () =>
      creatorGame.createMatch(opponent.address),
    )
    const matchId = parseEvent(creatorGame, createReceipt, 'MatchCreated').matchId as bigint
    evidence.matchId = matchId.toString()
    console.log(`match ${matchId}`)

    await measuredWrite('joinMatch', opponent, () => opponentGame.joinMatch(matchId))

    // --- encrypted fleet submission and validation -----------------------
    const creatorEncryptStart = Date.now()
    const creatorFleet = await encryptFleetAs(creatorKey, rpcUrl, CREATOR_FLEET)
    evidence.cofhe.creatorEncryptMs = Date.now() - creatorEncryptStart
    console.log(`creator fleet encrypted in ${evidence.cofhe.creatorEncryptMs} ms`)
    await measuredWrite('submitFleet (creator)', creator, () =>
      creatorGame.submitFleet(matchId, creatorFleet),
    )

    const opponentEncryptStart = Date.now()
    const opponentFleet = await encryptFleetAs(opponentKey, rpcUrl, OPPONENT_FLEET)
    evidence.cofhe.opponentEncryptMs = Date.now() - opponentEncryptStart
    console.log(`opponent fleet encrypted in ${evidence.cofhe.opponentEncryptMs} ms`)
    await measuredWrite('submitFleet (opponent)', opponent, () =>
      opponentGame.submitFleet(matchId, opponentFleet),
    )

    for (const [player, key] of [
      [creator, 'creatorValidationReadyMs'],
      [opponent, 'opponentValidationReadyMs'],
    ] as const) {
      const waitMs = await waitForDecrypt(
        creatorGame,
        `fleet validation (${player.address})`,
        () => creatorGame.finalizeFleetValidation.staticCall(matchId, player.address),
        () => creatorGame.retryFleetValidation(matchId, player.address),
        Date.now(),
      )
      evidence.cofhe[key] = waitMs
      console.log(`fleet validation ready for ${player.address} after ${waitMs} ms`)
      const receipt = await measuredWrite(
        `finalizeFleetValidation (${player.address === creator.address ? 'creator' : 'opponent'})`,
        creator,
        () => creatorGame.finalizeFleetValidation(matchId, player.address),
      )
      const validated = parseEvent(creatorGame, receipt, 'FleetValidated')
      if (validated.valid !== true) {
        throw new Error(`Fleet for ${player.address} was rejected as invalid`)
      }
    }

    const started = await creatorGame.getMatch(matchId)
    if (started.status !== STATUS.InProgress) {
      throw new Error(`Match did not reach InProgress, status=${started.status}`)
    }
    if (started.currentTurn.toLowerCase() !== opponent.address.toLowerCase()) {
      throw new Error('Invited opponent does not have the first turn')
    }
    console.log('match started, invited opponent on turn')

    // --- shot plan: one miss each, then opponent sinks creator's fleet ---
    interface PlannedShot {
      attacker: Wallet
      game: Contract
      cellIndex: number
      expected: bigint
    }
    const plan: PlannedShot[] = [
      { attacker: opponent, game: opponentGame, cellIndex: MISS_CELL, expected: SHOT_RESULT.Miss },
      { attacker: creator, game: creatorGame, cellIndex: MISS_CELL, expected: SHOT_RESULT.Miss },
    ]
    let cursor = 0
    for (const [shipIndex, length] of SHIP_LENGTHS.entries()) {
      for (let segment = 0; segment < length; segment++) {
        const last = segment === length - 1
        const lastShip = shipIndex === SHIP_LENGTHS.length - 1
        plan.push({
          attacker: opponent,
          game: opponentGame,
          cellIndex: CREATOR_FLEET[cursor],
          expected: last ? (lastShip ? SHOT_RESULT.Win : SHOT_RESULT.Sunk) : SHOT_RESULT.Hit,
        })
        cursor += 1
      }
    }

    for (const [index, shot] of plan.entries()) {
      const attackReceipt = await measuredWrite(
        `attack #${index + 1} cell ${shot.cellIndex}`,
        shot.attacker,
        () => shot.game.attack(matchId, shot.cellIndex),
      )
      const moveId = parseEvent(creatorGame, attackReceipt, 'ShotSubmitted').moveId as bigint

      const decryptReadyMs = await waitForDecrypt(
        creatorGame,
        `shot #${index + 1} resolution`,
        () => creatorGame.finalizeAttack.staticCall(matchId, moveId),
        () => creatorGame.retryShotResolution(matchId),
        Date.now(),
      )
      const finalizeReceipt = await measuredWrite(
        `finalizeAttack #${index + 1}`,
        creator,
        () => creatorGame.finalizeAttack(matchId, moveId),
      )
      const resolved = parseEvent(creatorGame, finalizeReceipt, 'ShotResolved')
      const result = resolved.result as bigint
      evidence.shots.push({
        moveId: moveId.toString(),
        attacker: shot.attacker.address,
        cellIndex: shot.cellIndex,
        expectedResult: shot.expected.toString(),
        result: result.toString(),
        sunkShipId: String(resolved.sunkShipId),
        attackGas: attackReceipt.gasUsed.toString(),
        finalizeGas: finalizeReceipt.gasUsed.toString(),
        decryptReadyMs,
      })
      writeEvidence()
      if (result !== shot.expected) {
        throw new Error(
          `Shot #${index + 1} at cell ${shot.cellIndex} resolved to ${result}, ` +
            `expected ${shot.expected}`,
        )
      }
      console.log(
        `shot #${index + 1} cell ${shot.cellIndex} result=${result} ` +
          `decryptReady=${decryptReadyMs} ms`,
      )
    }

    // --- final state ------------------------------------------------------
    const finished = await creatorGame.getMatch(matchId)
    if (finished.status !== STATUS.Finished) {
      throw new Error(`Match did not reach Finished, status=${finished.status}`)
    }
    if (finished.winner.toLowerCase() !== opponent.address.toLowerCase()) {
      throw new Error(`Unexpected winner ${finished.winner}`)
    }
    evidence.winner = finished.winner
    evidence.moveCount = String(finished.moveCount)
    evidence.totalGas = evidence.transactions
      .reduce((sum, tx) => sum + BigInt(tx.gasUsed), 0n)
      .toString()
    evidence.totalFeeWei = evidence.transactions
      .reduce((sum, tx) => sum + BigInt(tx.feeWei), 0n)
      .toString()
    evidence.status = 'passed'
    writeEvidence()

    console.log(`Full encrypted match passed for match ${matchId}`)
    console.log(`winner ${finished.winner} after ${finished.moveCount} moves`)
    console.log(`total gas ${evidence.totalGas}, total fee ${formatEther(evidence.totalFeeWei)} ETH`)
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error)
    writeEvidence()
    throw error
  }
}

void main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => activeProvider?.destroy())
