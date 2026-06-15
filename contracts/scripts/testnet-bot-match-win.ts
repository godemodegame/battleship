/**
 * Full live bot-match playthrough on Arbitrum Sepolia — player plays to a WIN.
 *
 * The 1-shot smoke (testnet-bot-match.ts) only exercises a Miss + one bot move.
 * This drives the COMPLETE player turn the frontend honest-UI bot battle relies
 * on, for every result type, mirroring BotBattleController.runPlayerShot exactly:
 *
 *   attack(cell) → getPendingShot → finalizeAttackWithProof → getMove(moveId)
 *
 * and asserts getMove's decrypted {result, sunkShipId} against the known bot
 * fleet on every shot — Hit (2), Sunk (3 + sunkShipId), and the final Win (4).
 * The player attacks only bot-ship cells, so every shot hits and the turn never
 * passes to the bot; the match ends when the last ship sinks (Win). This is the
 * exact on-chain sequence + getMove mapping the frontend now depends on, run
 * against real transactions.
 *
 * Required env: ARBITRUM_SEPOLIA_RPC_URL (or the public default),
 *   CREATOR_PRIVATE_KEY, DEPLOYMENT_RECORD=deployments/421614/<id>.json
 */

import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatEther,
  type ContractTransactionReceipt,
  type ContractTransactionResponse,
  type InterfaceAbi,
  type Log,
} from 'ethers'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { createCofheClient, createCofheConfig } from '@cofhe/sdk/node'
import { Encryptable } from '@cofhe/sdk'
import { arbSepolia } from '@cofhe/sdk/chains'

import { type DeploymentRecord } from './deploymentRecord'

const PROOF_RETRY_MS = 3_000
const PROOF_TIMEOUT_MS = 5 * 60_000

// Player fleet (valid classic layout) and a KNOWN bot fleet whose ship groups we
// assert against. SHIP_LENGTHS = [4,3,3,2,2,2,1,1,1,1] in fleet/submission order.
const PLAYER_FLEET = [
  0, 1, 2, 3, 20, 21, 22, 40, 41, 42, 60, 61, 80, 81, 5, 6, 25, 45, 65, 85,
] as const
const BOT_FLEET = [
  0, 10, 20, 30, 2, 12, 22, 4, 14, 24, 6, 16, 8, 18, 50, 60, 52, 54, 56, 58,
] as const
const SHIP_LENGTHS = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1]

// ShotResult enum (BattleshipGame.sol): None=0, Miss=1, Hit=2, Sunk=3, Win=4.
const RESULT = { None: 0, Miss: 1, Hit: 2, Sunk: 3, Win: 4 } as const

/** Split BOT_FLEET into per-ship cell groups in fleet order. */
function botShipGroups(): number[][] {
  const groups: number[][] = []
  let offset = 0
  for (const len of SHIP_LENGTHS) {
    groups.push(BOT_FLEET.slice(offset, offset + len))
    offset += len
  }
  return groups
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name} before running the bot-match win test`)
  return value
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function connectCofheClient(privateKey: string, rpcUrl: string) {
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport: http(rpcUrl) })
  const client = createCofheClient(
    createCofheConfig({ environment: 'node', supportedChains: [arbSepolia] }),
  )
  await client.connect(publicClient, walletClient)
  return client
}
type CofheClient = Awaited<ReturnType<typeof connectCofheClient>>

async function encryptFleet(client: CofheClient, segments: readonly number[]) {
  return client.encryptInputs(segments.map((s) => Encryptable.uint8(BigInt(s)))).execute()
}

async function fetchProof(client: CofheClient, label: string, ctHash: bigint) {
  const startedAt = Date.now()
  for (;;) {
    try {
      const r = await client.decryptForTx(ctHash).withoutPermit().execute()
      return { value: r.decryptedValue, signature: r.signature as `0x${string}` }
    } catch (error) {
      if (Date.now() - startedAt > PROOF_TIMEOUT_MS) {
        throw new Error(`${label}: decrypt proof unavailable: ${(error as Error).message}`)
      }
      await sleep(PROOF_RETRY_MS)
    }
  }
}

function parseEvent(game: Contract, receipt: ContractTransactionReceipt, name: string) {
  for (const log of receipt.logs as Log[]) {
    try {
      const parsed = game.interface.parseLog(log)
      if (parsed?.name === name) return parsed.args.toObject()
    } catch {
      /* non-game logs */
    }
  }
  throw new Error(`event ${name} not found in ${receipt.hash}`)
}

async function measured(
  label: string,
  send: () => Promise<ContractTransactionResponse>,
): Promise<ContractTransactionReceipt> {
  const tx = await send()
  const receipt = await tx.wait()
  if (!receipt) throw new Error(`${label}: no receipt`)
  console.log(`  ${label}: gas ${receipt.gasUsed.toString()} (tx ${receipt.hash})`)
  return receipt
}

/**
 * One player shot through the exact frontend driver sequence, returning the
 * decrypted on-chain outcome read via getMove.
 */
async function playerShot(
  game: Contract,
  cofhe: CofheClient,
  matchId: bigint,
  cell: number,
): Promise<{ result: number; sunkShipId: number }> {
  const attackReceipt = await measured(`attack cell ${cell}`, () => game.attack(matchId, cell))
  const submitted = parseEvent(game, attackReceipt, 'ShotSubmitted')
  const pending = await game.getPendingShot(matchId)
  const resultProof = await fetchProof(cofhe, 'result', pending.resultCtHash)
  const sunkProof = await fetchProof(cofhe, 'sunk', pending.sunkShipCtHash)
  await measured('finalize', () =>
    game.finalizeAttackWithProof(
      matchId,
      submitted.moveId,
      resultProof.value,
      resultProof.signature,
      sunkProof.value,
      sunkProof.signature,
    ),
  )
  const move = await game.getMove(matchId, submitted.moveId)
  if (!move.finalized) throw new Error(`move ${submitted.moveId} not finalized in getMove`)
  return { result: Number(move.result), sunkShipId: Number(move.sunkShipId) }
}

const RESULT_NAME = ['None', 'Miss', 'Hit', 'Sunk', 'Win']

async function main(): Promise<void> {
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? 'https://sepolia-rollup.arbitrum.io/rpc'
  const playerKey = required('CREATOR_PRIVATE_KEY')
  const recordArg = required('DEPLOYMENT_RECORD')
  const recordPath = isAbsolute(recordArg) ? recordArg : join(process.cwd(), recordArg)
  const record = JSON.parse(readFileSync(recordPath, 'utf8')) as DeploymentRecord
  const abi = JSON.parse(
    readFileSync(join(__dirname, '..', 'abi', 'BattleshipGame.json'), 'utf8'),
  ) as InterfaceAbi

  const provider = new JsonRpcProvider(rpcUrl)
  const chainId = Number((await provider.getNetwork()).chainId)
  if (chainId !== record.chainId) throw new Error(`chain ${chainId} != record ${record.chainId}`)
  const player = new Wallet(playerKey, provider)
  console.log(`player ${player.address} balance ${formatEther(await provider.getBalance(player.address))} ETH`)
  console.log(`contract ${record.address} (${record.deploymentId})`)

  const game = new Contract(record.address, abi, player)
  const cofhe = await connectCofheClient(playerKey, rpcUrl)

  // 1. Create the bot match (both fleets encrypted) and start it.
  console.log('\nencrypting fleets…')
  const playerFleet = await encryptFleet(cofhe, PLAYER_FLEET)
  const botFleet = await encryptFleet(cofhe, BOT_FLEET)
  const createReceipt = await measured('createBotMatch', () => game.createBotMatch(playerFleet, botFleet))
  const matchId = parseEvent(game, createReceipt, 'MatchCreated').matchId as bigint
  console.log(`bot match id ${matchId}`)

  const pendingValidation = await game.getPendingPlacementValidation(matchId, player.address)
  const validityProof = await fetchProof(cofhe, 'placement', pendingValidation.validityCtHash)
  await measured('finalizeFleetValidationWithProof', () =>
    game.finalizeFleetValidationWithProof(
      matchId,
      player.address,
      validityProof.value,
      validityProof.signature,
    ),
  )
  let match = await game.getMatch(matchId)
  if (Number(match.status) !== 5) throw new Error(`match not InProgress (status ${match.status})`)
  if (match.currentTurn.toLowerCase() !== player.address.toLowerCase()) {
    throw new Error('player should move first')
  }

  // 2. Sink every bot ship in fleet order. Each ship's last cell sinks it; the
  //    final cell of the last ship wins. Every shot is a hit, so the turn never
  //    passes to the bot. Assert getMove's result on each shot.
  const groups = botShipGroups()
  const failures: string[] = []
  let shotNo = 0
  for (let shipIdx = 0; shipIdx < groups.length; shipIdx++) {
    const cells = groups[shipIdx]
    for (let i = 0; i < cells.length; i++) {
      shotNo++
      const cell = cells[i]
      const isLastCellOfShip = i === cells.length - 1
      const isLastShip = shipIdx === groups.length - 1
      const expectedResult = isLastCellOfShip
        ? isLastShip
          ? RESULT.Win
          : RESULT.Sunk
        : RESULT.Hit
      const expectedSunkId = isLastCellOfShip ? shipIdx + 1 : 0

      const outcome = await playerShot(game, cofhe, matchId, cell)
      const ok = outcome.result === expectedResult && outcome.sunkShipId === expectedSunkId
      const line =
        `shot ${shotNo}: ship ${shipIdx + 1} cell ${cell} → ${RESULT_NAME[outcome.result]}` +
        ` (sunkShipId ${outcome.sunkShipId}) expected ${RESULT_NAME[expectedResult]}` +
        ` (sunkShipId ${expectedSunkId}) ${ok ? '✅' : '❌'}`
      console.log(line)
      if (!ok) failures.push(line)
    }
  }

  // 3. The winning shot must have finished the match for the player.
  match = await game.getMatch(matchId)
  const finished = Number(match.status) === 7 // Finished
  const playerWon = match.winner.toLowerCase() === player.address.toLowerCase()
  console.log(`\nfinal: status ${match.status} (${finished ? 'Finished' : 'NOT finished'}), winner ${match.winner} ${playerWon ? '(player) ✅' : '❌'}`)
  if (!finished) failures.push('match did not reach Finished')
  if (!playerWon) failures.push('player is not the winner')

  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} assertion(s) failed:`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('\n✅ full bot-match playthrough passed: every getMove result (Hit/Sunk/Win) matched the known bot fleet, and the player won on-chain.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
