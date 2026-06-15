import hre, { ethers } from 'hardhat'
import { Encryptable, TASK_MANAGER_ADDRESS } from '@cofhe/sdk'
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import type { BaseContract, ContractTransactionReceipt } from 'ethers'

// Shared test utilities: fleet fixtures in the frozen ship-segment encoding,
// per-signer encryption, and drivers for the client-published CoFHE decrypt
// flow (cofhe-contracts 0.1.x: results become readable only after a
// threshold-network-signed plaintext is published on-chain; the mock
// environment signs with a well-known key and the MockTaskManager verifies
// it exactly like the live one).

export const SHIP_LENGTHS = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1] as const

/// Horizontal classic-rules layout. Segments grouped by ship in the frozen
/// submission order.
export const VALID_FLEET = [
  0, 1, 2, 3, 20, 21, 22, 40, 41, 42, 60, 61, 80, 81, 5, 6, 25, 45, 65, 85,
] as const

/// Vertical classic-rules layout, distinct from VALID_FLEET.
export const VALID_FLEET_ALT = [
  0, 10, 20, 30, 2, 12, 22, 4, 14, 24, 6, 16, 8, 18, 50, 60, 52, 54, 56, 58,
] as const

/// Carrier has a gap (cell 4 missing, cell 5 in its place is not contiguous
/// with 0,1,2): fails the straightness check.
export const FLEET_WITH_GAP = [
  0, 1, 2, 5, 20, 21, 22, 40, 41, 42, 60, 61, 80, 81, 7, 8, 25, 45, 65, 85,
] as const

/// One segment out of board range (100): fails the range check.
export const FLEET_OUT_OF_RANGE = [
  0, 1, 2, 3, 20, 21, 22, 40, 41, 42, 60, 61, 80, 81, 5, 6, 25, 45, 65, 100,
] as const

/// Carrier placed diagonally (delta 11): fails straightness.
export const FLEET_DIAGONAL = [
  0, 11, 22, 33, 50, 51, 52, 70, 71, 72, 90, 91, 5, 6, 8, 9, 45, 65, 85, 87,
] as const

/// Carrier at cells 7,8,9,10: deltas are all 1 but the ship wraps from row 0
/// into row 1, so the column-bound check must reject it.
export const FLEET_ROW_WRAP = [
  7, 8, 9, 10, 30, 31, 32, 50, 51, 52, 70, 71, 90, 91, 34, 35, 55, 75, 95, 13,
] as const

// Hardhat's ethers v6 contract instances expose methods through a proxy, so
// helpers take them loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GameContract = any

// One connected CoFHE client per signer; creation deploys nothing but does
// permit/signature work, so reuse across tests in a file.
type CofheClient = Awaited<ReturnType<typeof hre.cofhe.createClientWithBatteries>>
const clientCache = new Map<string, CofheClient>()

export async function cofheClientFor(signer: HardhatEthersSigner): Promise<CofheClient> {
  const key = await signer.getAddress()
  const cached = clientCache.get(key)
  if (cached) return cached
  const client = await hre.cofhe.createClientWithBatteries(signer)
  clientCache.set(key, client)
  return client
}

/// Encrypts a fleet in the frozen InEuint8[20] shape as `signer`. Inputs are
/// signature-bound to the signer by the (mock) zk verifier.
export async function encryptFleetAs(
  signer: HardhatEthersSigner,
  segments: readonly number[],
) {
  const client = await cofheClientFor(signer)
  return client
    .encryptInputs(segments.map((segment) => Encryptable.uint8(BigInt(segment))))
    .execute()
}

export interface DecryptProof {
  value: bigint
  signature: `0x${string}`
}

/// Fetches the threshold-network decrypt proof for a globally-allowed
/// handle. Works for any signer because the game allows results globally.
export async function fetchDecryptProof(
  ctHash: bigint,
  signer?: HardhatEthersSigner,
): Promise<DecryptProof> {
  const actual = signer ?? (await ethers.getSigners())[0]
  const client = await cofheClientFor(actual)
  const result = await client.decryptForTx(ctHash).withoutPermit().execute()
  return { value: result.decryptedValue, signature: result.signature }
}

const TASK_MANAGER_ABI = [
  'function publishDecryptResult(uint256 ctHash, uint256 result, bytes signature) external',
]

/// Publishes a fetched decrypt proof straight at the TaskManager, leaving
/// the existing finalize entrypoints to read it (the two-transaction path).
export async function publishDecryptProof(
  ctHash: bigint,
  proof: DecryptProof,
  signer?: HardhatEthersSigner,
) {
  const actual = signer ?? (await ethers.getSigners())[0]
  const taskManager = new ethers.Contract(TASK_MANAGER_ADDRESS, TASK_MANAGER_ABI, actual)
  await (await taskManager.publishDecryptResult(ctHash, proof.value, proof.signature)).wait()
}

/// Makes a pending placement validation readable on-chain (replaces the old
/// mock decrypt-delay advance): fetch the proof, publish it, done.
export async function makeValidationReady(
  game: GameContract,
  matchId: bigint,
  player: HardhatEthersSigner | string,
) {
  const address = typeof player === 'string' ? player : player.address
  const pending = await game.getPendingPlacementValidation(matchId, address)
  const proof = await fetchDecryptProof(pending.validityCtHash as bigint)
  await publishDecryptProof(pending.validityCtHash as bigint, proof)
}

/// Makes the pending shot readable on-chain: fetch and publish both the
/// result and sunk-ship-id proofs.
export async function makeShotReady(game: GameContract, matchId: bigint) {
  const pending = await game.getPendingShot(matchId)
  for (const ctHash of [pending.resultCtHash, pending.sunkShipCtHash] as bigint[]) {
    const proof = await fetchDecryptProof(ctHash)
    await publishDecryptProof(ctHash, proof)
  }
}

/// Creates a friend match with the creator's encrypted fleet attached in one
/// transaction (placement-first path). Returns the receipt so callers can read
/// the assigned match id from MatchCreated.
export async function createWithEncryptedFleet(
  game: GameContract,
  creator: HardhatEthersSigner,
  invitedOpponent: string,
  fleet: readonly number[] = VALID_FLEET,
): Promise<ContractTransactionReceipt> {
  const input = await encryptFleetAs(creator, fleet)
  const receipt = await (await game.connect(creator).createWithFleet(invitedOpponent, input)).wait()
  return receipt!
}

/// Joins a match with the opponent's encrypted fleet attached in one
/// transaction (placement-first path).
export async function joinWithEncryptedFleet(
  game: GameContract,
  opponent: HardhatEthersSigner,
  matchId: bigint,
  fleet: readonly number[] = VALID_FLEET_ALT,
): Promise<ContractTransactionReceipt> {
  const input = await encryptFleetAs(opponent, fleet)
  const receipt = await (await game.connect(opponent).joinWithFleet(matchId, input)).wait()
  return receipt!
}

/// Creates an OPEN match with the creator's encrypted fleet attached in one
/// transaction (placement-first path, no invited opponent). Returns the receipt
/// so callers can read the assigned match id from MatchCreated.
export async function createOpenWithEncryptedFleet(
  game: GameContract,
  creator: HardhatEthersSigner,
  fleet: readonly number[] = VALID_FLEET,
): Promise<ContractTransactionReceipt> {
  const input = await encryptFleetAs(creator, fleet)
  const receipt = await (await game.connect(creator).createOpenWithFleet(input)).wait()
  return receipt!
}

/// Drives the full open-match placement-first flow: createOpenWithFleet (no
/// invitee), joinWithFleet by an arbitrary opponent, then finalizes both
/// validations, leaving the match InProgress with the joiner on turn. Mirrors
/// startAtomicMatch but for the open (random-matchmaking) entrypoints.
export async function startOpenMatch(
  game: GameContract,
  creator: HardhatEthersSigner,
  opponent: HardhatEthersSigner,
  matchId: bigint = 1n,
  creatorFleet: readonly number[] = VALID_FLEET,
  opponentFleet: readonly number[] = VALID_FLEET_ALT,
) {
  await createOpenWithEncryptedFleet(game, creator, creatorFleet)
  await joinWithEncryptedFleet(game, opponent, matchId, opponentFleet)

  await makeValidationReady(game, matchId, creator)
  await (await game.finalizeFleetValidation(matchId, creator.address)).wait()
  await makeValidationReady(game, matchId, opponent)
  await (await game.finalizeFleetValidation(matchId, opponent.address)).wait()
}

/// Drives the full placement-first flow: createWithFleet, joinWithFleet, then
/// finalizes both validations, leaving the match InProgress with the invited
/// opponent on turn. Mirrors startEncryptedMatch but for the atomic entrypoints.
export async function startAtomicMatch(
  game: GameContract,
  creator: HardhatEthersSigner,
  opponent: HardhatEthersSigner,
  matchId: bigint = 1n,
  creatorFleet: readonly number[] = VALID_FLEET,
  opponentFleet: readonly number[] = VALID_FLEET_ALT,
) {
  await createWithEncryptedFleet(game, creator, opponent.address, creatorFleet)
  await joinWithEncryptedFleet(game, opponent, matchId, opponentFleet)

  await makeValidationReady(game, matchId, creator)
  await (await game.finalizeFleetValidation(matchId, creator.address)).wait()
  await makeValidationReady(game, matchId, opponent)
  await (await game.finalizeFleetValidation(matchId, opponent.address)).wait()
}

/// Submits and finalizes both fleets, leaving the match InProgress with the
/// invited opponent on turn.
export async function startEncryptedMatch(
  game: GameContract,
  matchId: bigint,
  creator: HardhatEthersSigner,
  opponent: HardhatEthersSigner,
  creatorFleet: readonly number[] = VALID_FLEET,
  opponentFleet: readonly number[] = VALID_FLEET_ALT,
) {
  const creatorInput = await encryptFleetAs(creator, creatorFleet)
  await (await game.connect(creator).submitFleet(matchId, creatorInput)).wait()
  const opponentInput = await encryptFleetAs(opponent, opponentFleet)
  await (await game.connect(opponent).submitFleet(matchId, opponentInput)).wait()

  await makeValidationReady(game, matchId, creator)
  await (await game.finalizeFleetValidation(matchId, creator.address)).wait()
  await makeValidationReady(game, matchId, opponent)
  await (await game.finalizeFleetValidation(matchId, opponent.address)).wait()
}

export interface ShotRecord {
  cellIndex: number
  moveId: bigint
  result: bigint
  sunkShipId: bigint
  attackGas: bigint
  finalizeGas: bigint
}

/// Attacks one cell, publishes the decrypt proofs, and finalizes the shot,
/// returning the resolved public result from the ShotResolved event.
export async function playShot(
  game: GameContract,
  matchId: bigint,
  attacker: HardhatEthersSigner,
  cellIndex: number,
): Promise<ShotRecord> {
  const attackTx = await game.connect(attacker).attack(matchId, cellIndex)
  const attackReceipt = await attackTx.wait()

  const submitted = parseEvent(game, attackReceipt!, 'ShotSubmitted')
  const moveId = submitted.moveId as bigint

  await makeShotReady(game, matchId)

  const finalizeTx = await game.finalizeAttack(matchId, moveId)
  const finalizeReceipt = await finalizeTx.wait()
  const resolved = parseEvent(game, finalizeReceipt!, 'ShotResolved')

  return {
    cellIndex,
    moveId,
    result: resolved.result as bigint,
    sunkShipId: resolved.sunkShipId as bigint,
    attackGas: attackReceipt!.gasUsed,
    finalizeGas: finalizeReceipt!.gasUsed,
  }
}

export function parseEvent(
  game: BaseContract,
  receipt: ContractTransactionReceipt,
  eventName: string,
): Record<string, unknown> {
  for (const log of receipt.logs) {
    try {
      const parsed = game.interface.parseLog(log)
      if (parsed?.name === eventName) {
        return parsed.args.toObject()
      }
    } catch {
      // Logs from other contracts (mock task manager) are skipped.
    }
  }
  throw new Error(`event ${eventName} not found in receipt`)
}

export async function deployEncryptedMatchFixtureBase() {
  const [creator, opponent, outsider] = await ethers.getSigners()
  const factory = await ethers.getContractFactory('BattleshipGame')
  const game = await factory.deploy()
  await game.waitForDeployment()
  await (await game.connect(creator).createMatch(opponent.address)).wait()
  await (await game.connect(opponent).joinMatch(1n)).wait()
  return { game, creator, opponent, outsider, matchId: 1n }
}
