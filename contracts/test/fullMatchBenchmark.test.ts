import { expect } from 'chai'
import { ethers } from 'hardhat'
import {
  VALID_FLEET,
  VALID_FLEET_ALT,
  encryptFleetAs,
  advancePastDecryptDelay,
  playShot,
  type ShotRecord,
} from './helpers/encryptedFleet'

// GAME-411: drives one complete two-player match through the implemented
// contract in the mock CoFHE environment and records the gas of every
// operation. The resulting numbers are the testnet gas budget recorded in
// docs/cofhe-feasibility-results.md. Mock gas overstates real CoFHE task
// gas (every FHE op pays mock bookkeeping), so these are upper-bound
// budgets, re-validated on Arbitrum Sepolia in GAME-906.

const ShotResult = { None: 0n, Miss: 1n, Hit: 2n, Sunk: 3n, Win: 4n } as const

// Water cells on each board, used to exercise misses and turn changes.
const CREATOR_BOARD_MISSES = [9, 19, 29] // water in VALID_FLEET
const OPPONENT_BOARD_MISSES = [99, 97, 95] // water in VALID_FLEET_ALT

function stats(values: bigint[]) {
  const sum = values.reduce((acc, value) => acc + value, 0n)
  const min = values.reduce((acc, value) => (value < acc ? value : acc), values[0])
  const max = values.reduce((acc, value) => (value > acc ? value : acc), values[0])
  return { min, max, avg: sum / BigInt(values.length), sum }
}

describe('full match gas benchmark (GAME-411)', function () {
  this.timeout(600_000)

  it('plays a realistic full match and records the gas budget', async () => {
    const [creator, opponent] = await ethers.getSigners()
    const factory = await ethers.getContractFactory('BattleshipGame')
    const game = await factory.deploy()
    await game.waitForDeployment()

    const createReceipt = await (await game.connect(creator).createMatch(opponent.address)).wait()
    const joinReceipt = await (await game.connect(opponent).joinMatch(1n)).wait()
    const matchId = 1n

    const creatorInput = await encryptFleetAs(creator, VALID_FLEET)
    const submitCreator = await (await game.connect(creator).submitFleet(matchId, creatorInput)).wait()
    const opponentInput = await encryptFleetAs(opponent, VALID_FLEET_ALT)
    const submitOpponent = await (await game.connect(opponent).submitFleet(matchId, opponentInput)).wait()

    await advancePastDecryptDelay()
    const finalizeCreator = await (await game.finalizeFleetValidation(matchId, creator.address)).wait()
    const finalizeOpponent = await (await game.finalizeFleetValidation(matchId, opponent.address)).wait()

    // The opponent hunts the creator's fleet, deliberately missing after
    // every fifth hit; each miss hands the creator one (missed) shot back,
    // exercising both turn directions. 26 moves total.
    const shots: ShotRecord[] = []
    let missIndex = 0
    for (let i = 0; i < VALID_FLEET.length; i++) {
      shots.push(await playShot(game, matchId, opponent, VALID_FLEET[i]))
      if ((i + 1) % 5 === 0 && i + 1 < VALID_FLEET.length) {
        const opponentMiss = await playShot(
          game,
          matchId,
          opponent,
          CREATOR_BOARD_MISSES[missIndex],
        )
        expect(opponentMiss.result).to.equal(ShotResult.Miss)
        shots.push(opponentMiss)

        const creatorMiss = await playShot(
          game,
          matchId,
          creator,
          OPPONENT_BOARD_MISSES[missIndex],
        )
        expect(creatorMiss.result).to.equal(ShotResult.Miss)
        shots.push(creatorMiss)
        missIndex += 1
      }
    }

    const finalMatch = await game.getMatch(matchId)
    expect(finalMatch.status).to.equal(7n) // Finished
    expect(finalMatch.winner).to.equal(opponent.address)
    expect(finalMatch.moveCount).to.equal(BigInt(shots.length))

    const attackStats = stats(shots.map((shot) => shot.attackGas))
    const finalizeStats = stats(shots.map((shot) => shot.finalizeGas))
    const totalGas =
      createReceipt!.gasUsed +
      joinReceipt!.gasUsed +
      submitCreator!.gasUsed +
      submitOpponent!.gasUsed +
      finalizeCreator!.gasUsed +
      finalizeOpponent!.gasUsed +
      attackStats.sum +
      finalizeStats.sum

    // eslint-disable-next-line no-console
    console.table([
      { operation: 'createMatch', gas: createReceipt!.gasUsed.toString() },
      { operation: 'joinMatch', gas: joinReceipt!.gasUsed.toString() },
      { operation: 'submitFleet (creator)', gas: submitCreator!.gasUsed.toString() },
      { operation: 'submitFleet (opponent)', gas: submitOpponent!.gasUsed.toString() },
      { operation: 'finalizeFleetValidation (creator)', gas: finalizeCreator!.gasUsed.toString() },
      { operation: 'finalizeFleetValidation (opponent)', gas: finalizeOpponent!.gasUsed.toString() },
      {
        operation: `attack x${shots.length} (min/avg/max)`,
        gas: `${attackStats.min}/${attackStats.avg}/${attackStats.max}`,
      },
      {
        operation: `finalizeAttack x${shots.length} (min/avg/max)`,
        gas: `${finalizeStats.min}/${finalizeStats.avg}/${finalizeStats.max}`,
      },
      { operation: `whole ${shots.length}-move match`, gas: totalGas.toString() },
    ])
  })
})
