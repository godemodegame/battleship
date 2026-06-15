import { expect } from 'chai'
import { ethers } from 'hardhat'
import {
  VALID_FLEET,
  VALID_FLEET_ALT,
  encryptFleetAs,
  makeValidationReady,
  makeShotReady,
  playShot,
  startAtomicMatch,
} from './helpers/encryptedFleet'
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

// Bot (single-player practice) match coverage. The bot occupies the opponent
// slot under the BOT_OPPONENT sentinel; the player submits both encrypted
// fleets, the player moves first, and the bot's turn is advanced by the
// permissionless executeBotMove, which chooses its own target on-chain.

const MatchStatus = {
  ValidatingPlacement: 3n,
  InProgress: 5n,
  ResolvingShot: 6n,
  Finished: 7n,
  Forfeited: 9n,
} as const

const MatchType = { Friend: 0n, Open: 1n, Bot: 2n } as const

const ShotResult = { None: 0n, Miss: 1n, Hit: 2n, Sunk: 3n, Win: 4n } as const

// Water cell on the bot board (VALID_FLEET_ALT) — used to force a player miss
// so the turn passes to the bot.
const BOT_WATER_CELL = 99

async function deploy() {
  const [player, other] = await ethers.getSigners()
  const game = await (await ethers.getContractFactory('BattleshipGame')).deploy()
  await game.waitForDeployment()
  return { game, player, other }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GameContract = any

/// Create a bot match (player supplies both encrypted fleets) and start it by
/// finalizing the player's validation; the bot fleet is valid on creation.
async function startBotMatch(
  game: GameContract,
  player: HardhatEthersSigner,
  playerFleet: readonly number[] = VALID_FLEET,
  botFleet: readonly number[] = VALID_FLEET_ALT,
  matchId: bigint = 1n,
) {
  const playerInput = await encryptFleetAs(player, playerFleet)
  const botInput = await encryptFleetAs(player, botFleet)
  await (await game.connect(player).createBotMatch(playerInput, botInput)).wait()
  await makeValidationReady(game, matchId, player)
  await (await game.finalizeFleetValidation(matchId, player.address)).wait()
}

/// Advance the bot's turn end-to-end: executeBotMove, publish the decrypt
/// proofs, finalize. Returns the resolved move.
async function advanceBotTurn(game: GameContract, matchId: bigint) {
  await (await game.executeBotMove(matchId)).wait()
  const pending = await game.getPendingShot(matchId)
  await makeShotReady(game, matchId)
  await (await game.finalizeAttack(matchId, pending.moveId)).wait()
  return game.getMove(matchId, pending.moveId)
}

describe('bot match (single-player, on-chain)', function () {
  this.timeout(600_000)

  it('creates a bot match with the player first and the bot fleet valid', async () => {
    const { game, player } = await deploy()
    const playerInput = await encryptFleetAs(player, VALID_FLEET)
    const botInput = await encryptFleetAs(player, VALID_FLEET_ALT)
    await expect(game.connect(player).createBotMatch(playerInput, botInput))
      .to.emit(game, 'BotMatchCreated')
      .withArgs(1n, player.address)

    const BOT = await game.BOT_OPPONENT()
    let match = await game.getMatch(1n)
    expect(match.matchType).to.equal(MatchType.Bot)
    expect(match.status).to.equal(MatchStatus.ValidatingPlacement)
    expect(match.opponent).to.equal(BOT)

    const [, botView] = await game.getPlayers(1n)
    expect(botView.player).to.equal(BOT)
    expect(botView.fleetValid).to.equal(true) // valid on creation, no async wait

    await makeValidationReady(game, 1n, player)
    await (await game.finalizeFleetValidation(1n, player.address)).wait()

    match = await game.getMatch(1n)
    expect(match.status).to.equal(MatchStatus.InProgress)
    expect(match.currentTurn).to.equal(player.address) // human moves first
  })

  it('lets the player attack and sink the entire bot fleet to win', async () => {
    const { game, player } = await deploy()
    await startBotMatch(game, player)

    // Attack every cell of the known bot fleet; hits keep the turn, the last
    // shot sinks the final ship and wins.
    let last
    for (const cell of VALID_FLEET_ALT) {
      last = await playShot(game, 1n, player, cell)
      expect([ShotResult.Hit, ShotResult.Sunk, ShotResult.Win]).to.include(last.result)
    }
    expect(last!.result).to.equal(ShotResult.Win)

    const match = await game.getMatch(1n)
    expect(match.status).to.equal(MatchStatus.Finished)
    expect(match.winner).to.equal(player.address)
  })

  it('advances the bot turn with a contract-chosen target attributed to the bot', async () => {
    const { game, player } = await deploy()
    await startBotMatch(game, player)
    const BOT = await game.BOT_OPPONENT()

    // Player misses on purpose so the turn passes to the bot.
    const miss = await playShot(game, 1n, player, BOT_WATER_CELL)
    expect(miss.result).to.equal(ShotResult.Miss)
    expect((await game.getMatch(1n)).currentTurn).to.equal(BOT)

    await expect(game.executeBotMove(1n)).to.emit(game, 'BotMoveTriggered')
    const pending = await game.getPendingShot(1n)
    expect(pending.attacker).to.equal(BOT)
    expect(pending.defender).to.equal(player.address)
    expect(Number(pending.cellIndex)).to.be.greaterThanOrEqual(0)
    expect(Number(pending.cellIndex)).to.be.lessThan(100)

    await makeShotReady(game, 1n)
    await (await game.finalizeAttack(1n, pending.moveId)).wait()
    const move = await game.getMove(1n, pending.moveId)
    expect(move.attacker).to.equal(BOT)
    expect(move.finalized).to.equal(true)
    expect([ShotResult.Miss, ShotResult.Hit, ShotResult.Sunk, ShotResult.Win]).to.include(
      move.result,
    )
  })

  it('reverts executeBotMove when it is not the bot turn or not a bot match', async () => {
    const { game, player, other } = await deploy()

    // Fresh bot match: it is the player's turn, so the bot cannot move.
    await startBotMatch(game, player)
    await expect(game.executeBotMove(1n)).to.be.revertedWithCustomError(game, 'NotYourTurn')

    // A friend match is not a bot match.
    await startAtomicMatch(game, player, other, 2n)
    await expect(game.executeBotMove(2n)).to.be.revertedWithCustomError(game, 'NotBotMatch')
  })

  it('rejects joining or claiming a timeout win against the bot', async () => {
    const { game, player, other } = await deploy()
    await startBotMatch(game, player)

    await expect(game.connect(other).joinMatch(1n)).to.be.revertedWithCustomError(
      game,
      'BotMatchCannotBeJoined',
    )
    await expect(game.connect(player).claimTimeoutWin(1n)).to.be.revertedWithCustomError(
      game,
      'NoTimeoutAvailable',
    )
  })

  it('lets the bot make progress over several advanced turns', async () => {
    const { game, player } = await deploy()
    await startBotMatch(game, player)

    // Alternate: player misses (passes turn to the bot), then advance the bot
    // until it misses back. Cap the loop; assert the bot recorded real moves
    // against the player and never repeated a cell.
    const seen = new Set<number>()
    let botMoves = 0
    for (let round = 0; round < 6 && botMoves < 12; round++) {
      const match = await game.getMatch(1n)
      if (match.status !== MatchStatus.InProgress) break
      const BOT = await game.BOT_OPPONENT()
      if (match.currentTurn === player.address) {
        // Miss on a water cell that has not been used yet.
        const water = [99, 97, 95, 93, 91, 89][round]
        await playShot(game, 1n, player, water)
      } else if (match.currentTurn === BOT) {
        const move = await advanceBotTurn(game, 1n)
        const cell = Number(move.cellIndex)
        expect(seen.has(cell), `bot repeated cell ${cell}`).to.equal(false)
        seen.add(cell)
        botMoves++
      }
    }
    expect(botMoves).to.be.greaterThan(0)
  })
})

describe('bot hard heatmap target selection', function () {
  const bit = (cell: number) => 1n << BigInt(cell)

  async function deployHarness() {
    const harness = await (await ethers.getContractFactory('BattleshipGameHarness')).deploy()
    await harness.waitForDeployment()
    return harness
  }

  it('reconstructs the full sunk hull from the finishing cell and the hit run', async () => {
    const harness = await deployHarness()
    // Horizontal 3-ship at 44,45,46; only 46 is publicly marked sunk.
    const hull = bit(44) | bit(45) | bit(46)
    expect(await harness.exposeExpandSunk(bit(46), hull)).to.equal(hull)

    // An unrelated, non-contiguous hit at 60 must not be absorbed.
    expect(await harness.exposeExpandSunk(bit(46), hull | bit(60))).to.equal(hull)

    // Vertical 2-ship at 13,23; finishing cell 23.
    const vhull = bit(13) | bit(23)
    expect(await harness.exposeExpandSunk(bit(23), vhull)).to.equal(vhull)
  })

  it('does not keep targeting around an already-sunk ship', async () => {
    const harness = await deployHarness()
    // A sunk 3-ship at 44,45,46 (finishing cell 46), rest of the board untried.
    const hull = bit(44) | bit(45) | bit(46)
    const sunkShips = 0b10 // one length-3 ship sunk
    const [target, found] = await harness.exposeChooseBotTarget(
      hull, // attacked
      0n, // miss
      hull, // hit
      bit(46), // sunkMask (finishing cell only, as the contract records it)
      sunkShips,
      12345n,
    )
    expect(found).to.equal(true)
    // The whole hull is haloed, so the target must avoid the corpse and its
    // border — pre-fix, the stale open hits at 44/45 would have pulled the bot
    // straight back onto these cells.
    const haloAndHull = [33, 34, 35, 36, 37, 43, 44, 45, 46, 47, 53, 54, 55, 56, 57]
    expect(haloAndHull, `target ${target} hammered the corpse`).to.not.include(Number(target))
  })

  it('returns a valid target early game and none on a full board', async () => {
    const harness = await deployHarness()
    const [t, found] = await harness.exposeChooseBotTarget(0n, 0n, 0n, 0n, 0, 1n)
    expect(found).to.equal(true)
    expect(Number(t)).to.be.greaterThanOrEqual(0)
    expect(Number(t)).to.be.lessThan(100)

    const full = (1n << 100n) - 1n
    const [, none] = await harness.exposeChooseBotTarget(full, 0n, 0n, 0n, 0, 1n)
    expect(none).to.equal(false)
  })
})
