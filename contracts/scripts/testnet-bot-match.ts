/**
 * Live bot-match smoke test on Arbitrum Sepolia.
 *
 * Exercises the two new on-chain bot paths against the recorded deployment and
 * measures their real gas:
 *   1. createBotMatch(playerFleet, botFleet) — both fleets encrypted by and
 *      bound to the player, the bot's stored under the BOT_OPPONENT sentinel;
 *   2. executeBotMove(matchId) — permissionless, the contract picks the target
 *      via the hard heatmap (no cellIndex argument), then the shot is resolved
 *      through the same CoFHE flow as a human attack.
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

const BOT_OPPONENT = '0x0000000000000000000000000000000000000b07'
const PROOF_RETRY_MS = 3_000
const PROOF_TIMEOUT_MS = 5 * 60_000

// Player fleet (horizontal classic layout) and the bot fleet (vertical, water
// at cell 99 so the player's opening shot there misses and hands the bot a turn).
const PLAYER_FLEET = [
  0, 1, 2, 3, 20, 21, 22, 40, 41, 42, 60, 61, 80, 81, 5, 6, 25, 45, 65, 85,
] as const
const BOT_FLEET = [
  0, 10, 20, 30, 2, 12, 22, 4, 14, 24, 6, 16, 8, 18, 50, 60, 52, 54, 56, 58,
] as const
const MISS_CELL = 99

const STATUS = { InProgress: 5n, ResolvingShot: 6n } as const

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name} before running the bot-match smoke test`)
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
  console.log(`${label}: gas ${receipt.gasUsed.toString()} (tx ${receipt.hash})`)
  return receipt
}

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
  const balance = await provider.getBalance(player.address)
  console.log(`player ${player.address} balance ${formatEther(balance)} ETH`)
  console.log(`contract ${record.address} (${record.deploymentId})`)

  const game = new Contract(record.address, abi, player)
  const cofhe = await connectCofheClient(playerKey, rpcUrl)

  // 1. Create the bot match with both encrypted fleets in one transaction.
  console.log('\nencrypting fleets…')
  const playerFleet = await encryptFleet(cofhe, PLAYER_FLEET)
  const botFleet = await encryptFleet(cofhe, BOT_FLEET)
  const createReceipt = await measured('createBotMatch', () =>
    game.createBotMatch(playerFleet, botFleet),
  )
  const created = parseEvent(game, createReceipt, 'MatchCreated')
  const matchId = created.matchId as bigint
  console.log(`bot match id ${matchId}`)

  // 2. Finalize the player's placement validation → match auto-starts.
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
  console.log(
    `status ${match.status} matchType ${match.matchType} opponent ${match.opponent} turn ${match.currentTurn}`,
  )
  if (match.status !== STATUS.InProgress) throw new Error('match did not start')
  if (match.opponent.toLowerCase() !== BOT_OPPONENT) throw new Error('bot not seated')
  if (match.currentTurn.toLowerCase() !== player.address.toLowerCase()) {
    throw new Error('player should move first')
  }

  // 3. Player misses on water so the turn passes to the bot.
  const attackReceipt = await measured('attack (player miss)', () => game.attack(matchId, MISS_CELL))
  const submitted = parseEvent(game, attackReceipt, 'ShotSubmitted')
  const pShot = await game.getPendingShot(matchId)
  const pResult = await fetchProof(cofhe, 'player result', pShot.resultCtHash)
  const pSunk = await fetchProof(cofhe, 'player sunk', pShot.sunkShipCtHash)
  await measured('finalizeAttackWithProof (player)', () =>
    game.finalizeAttackWithProof(
      matchId,
      submitted.moveId,
      pResult.value,
      pResult.signature,
      pSunk.value,
      pSunk.signature,
    ),
  )
  match = await game.getMatch(matchId)
  console.log(`after player shot: turn ${match.currentTurn}`)
  if (match.currentTurn.toLowerCase() !== BOT_OPPONENT) {
    throw new Error(`expected bot turn, got ${match.currentTurn}`)
  }

  // The exact read the frontend honest-UI bot battle now relies on: the player's
  // hit/miss is the contract's decrypted result from getMove, never local state,
  // so the player cannot know it before the tx (PvP parity).
  const playerMove = await game.getMove(matchId, submitted.moveId)
  console.log(
    `player shot resolved via getMove: result ${playerMove.result}, sunkShipId ${playerMove.sunkShipId}, finalized ${playerMove.finalized}`,
  )
  if (!playerMove.finalized) throw new Error('player move not finalized in getMove')
  // MISS_CELL is open water, so the decrypted result must be Miss (ShotResult 1).
  if (Number(playerMove.result) !== 1) {
    throw new Error(`expected player Miss(1) from getMove, got ${playerMove.result}`)
  }

  // 4. THE BOT TURN: executeBotMove — contract picks the target (no cellIndex).
  const botReceipt = await measured('executeBotMove', () => game.executeBotMove(matchId))
  const botShot = parseEvent(game, botReceipt, 'ShotSubmitted')
  console.log(
    `bot fired at cell ${botShot.cellIndex} (attacker ${botShot.attacker}, defender ${botShot.defender})`,
  )
  if ((botShot.attacker as string).toLowerCase() !== BOT_OPPONENT) {
    throw new Error('bot move not attributed to the bot')
  }
  const bShot = await game.getPendingShot(matchId)
  const bResult = await fetchProof(cofhe, 'bot result', bShot.resultCtHash)
  const bSunk = await fetchProof(cofhe, 'bot sunk', bShot.sunkShipCtHash)
  await measured('finalizeAttackWithProof (bot)', () =>
    game.finalizeAttackWithProof(
      matchId,
      botShot.moveId,
      bResult.value,
      bResult.signature,
      bSunk.value,
      bSunk.signature,
    ),
  )
  const botMove = await game.getMove(matchId, botShot.moveId)
  console.log(`bot shot resolved: result ${botMove.result}, finalized ${botMove.finalized}`)

  console.log('\n✅ live bot-match smoke test passed: createBotMatch + executeBotMove work on-chain')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
