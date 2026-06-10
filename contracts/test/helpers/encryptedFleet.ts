import hre, { ethers } from 'hardhat'
import { cofhejs, Encryptable } from 'cofhejs/node'
import { cofhejs_initializeWithHardhatSigner } from 'cofhe-hardhat-plugin'
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import type { BaseContract, ContractTransactionReceipt } from 'ethers'

// Shared Phase 4 test utilities: fleet fixtures in the frozen ship-segment
// encoding, per-signer encryption, and drivers for the asynchronous CoFHE
// decrypt flow in the mock environment.

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

export function unwrapCofhejs<T>(result: {
  success: boolean
  data: T
  error: unknown
}): T {
  if (!result.success) {
    throw new Error(`cofhejs call failed: ${JSON.stringify(result.error)}`)
  }
  return result.data
}

/// Initializes the cofhejs singleton for `signer` and encrypts a fleet in
/// the frozen InEuint8[20] shape. Inputs are signature-bound to the signer.
export async function encryptFleetAs(
  signer: HardhatEthersSigner,
  segments: readonly number[],
) {
  unwrapCofhejs(
    await cofhejs_initializeWithHardhatSigner(hre, signer, {
      environment: 'MOCK',
      generatePermit: false,
    }),
  )
  return unwrapCofhejs(
    await cofhejs.encrypt(segments.map((segment) => Encryptable.uint8(BigInt(segment)))),
  )
}

/// The mock task manager marks decrypt results ready after a simulated async
/// offset of (timestamp % 10) + 1 seconds; 11 seconds always passes it.
export async function advancePastDecryptDelay() {
  await hre.network.provider.send('evm_increaseTime', [11])
  await hre.network.provider.send('evm_mine')
}

/// Pins the next block's timestamp so the mock decrypt delay is at least 6
/// seconds. Hardhat advances ~1 second per mined transaction, so without
/// this a request made at a timestamp ending in 0 (delay of exactly 1s) can
/// already be decryptable one transaction later, making not-ready assertions
/// flaky.
export async function pinNextDecryptDelay() {
  const latest = await hre.ethers.provider.getBlock('latest')
  const current = BigInt(latest!.timestamp)
  const next = current + 10n - (current % 10n) + 5n
  await hre.network.provider.send('evm_setNextBlockTimestamp', [`0x${next.toString(16)}`])
}

// Hardhat's ethers v6 contract instances expose methods through a proxy, so
// helpers take them loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GameContract = any

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

  await advancePastDecryptDelay()
  await (await game.finalizeFleetValidation(matchId, creator.address)).wait()
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

/// Attacks one cell and finalizes the shot, returning the resolved public
/// result from the ShotResolved event.
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

  await advancePastDecryptDelay()

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
