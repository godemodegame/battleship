import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import {
  VALID_FLEET,
  VALID_FLEET_ALT,
  advancePastDecryptDelay,
  deployEncryptedMatchFixtureBase,
  encryptFleetAs,
  parseEvent,
  playShot,
  startEncryptedMatch,
} from './helpers/encryptedFleet'

// GAME-901: release-QA coverage for every public read surface and the exact
// field/deadline bookkeeping of each lifecycle transition. The earlier suites
// prove the rules; this one pins the full observable state so a regression in
// any public field or boundary condition fails a test by name.

const MatchStatus = {
  WaitingForOpponent: 1n,
  WaitingForPlacement: 2n,
  ValidatingPlacement: 3n,
  InProgress: 5n,
  ResolvingShot: 6n,
  Finished: 7n,
} as const

const ShotResult = { None: 0n, Miss: 1n, Hit: 2n, Sunk: 3n, Win: 4n } as const

const DAY = 24n * 60n * 60n
const ZERO = ethers.ZeroAddress

async function joinedFixture() {
  return deployEncryptedMatchFixtureBase()
}

async function activeMatchFixture() {
  const base = await deployEncryptedMatchFixtureBase()
  await startEncryptedMatch(base.game, base.matchId, base.creator, base.opponent)
  return base
}

describe('BattleshipGame lifecycle coverage (GAME-901)', () => {
  describe('view fields across transitions', () => {
    it('records creation fields and only the join deadline', async () => {
      const [creator, opponent] = await ethers.getSigners()
      const factory = await ethers.getContractFactory('BattleshipGame')
      const game = await factory.deploy()
      await game.waitForDeployment()
      await (await game.connect(creator).createMatch(opponent.address)).wait()

      const m = await game.getMatch(1n)
      expect(m.id).to.equal(1n)
      expect(m.matchType).to.equal(0n) // Friend
      expect(m.status).to.equal(MatchStatus.WaitingForOpponent)
      expect(m.creator).to.equal(creator.address)
      expect(m.opponent).to.equal(ZERO)
      expect(m.invitedOpponent).to.equal(opponent.address)
      expect(m.currentTurn).to.equal(ZERO)
      expect(m.winner).to.equal(ZERO)
      expect(m.createdAt).to.be.greaterThan(0n)
      expect(m.lastActionAt).to.equal(m.createdAt)
      expect(m.joinedAt).to.equal(0n)
      expect(m.startedAt).to.equal(0n)
      expect(m.finishedAt).to.equal(0n)
      expect(m.moveCount).to.equal(0n)
      expect(m.pendingMoveId).to.equal(0n)
      expect(m.timeoutState.joinDeadline).to.equal(m.createdAt + DAY)
      expect(m.timeoutState.placementDeadline).to.equal(0n)
      expect(m.timeoutState.turnDeadline).to.equal(0n)
      expect(m.timeoutState.resolvingDeadline).to.equal(0n)
    })

    it('records join fields and arms the placement deadline', async () => {
      const { game, opponent, matchId } = await loadFixture(joinedFixture)
      const m = await game.getMatch(matchId)
      expect(m.status).to.equal(MatchStatus.WaitingForPlacement)
      expect(m.opponent).to.equal(opponent.address)
      expect(m.joinedAt).to.be.greaterThan(0n)
      expect(m.lastActionAt).to.equal(m.joinedAt)
      expect(m.timeoutState.placementDeadline).to.equal(m.joinedAt + DAY)
      expect(m.timeoutState.turnDeadline).to.equal(0n)
    })

    it('on start: invited opponent on turn, turn deadline armed, placement deadline cleared', async () => {
      const { game, opponent, matchId } = await loadFixture(activeMatchFixture)
      const m = await game.getMatch(matchId)
      expect(m.status).to.equal(MatchStatus.InProgress)
      expect(m.currentTurn).to.equal(opponent.address)
      expect(m.startedAt).to.be.greaterThan(0n)
      expect(m.timeoutState.turnDeadline).to.equal(m.startedAt + DAY)
      expect(m.timeoutState.placementDeadline).to.equal(0n)
      expect(m.winner).to.equal(ZERO)
    })

    it('attack arms the resolving deadline and exposes the pending shot view', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(activeMatchFixture)

      const before = await game.getPendingShot(matchId)
      expect(before.exists).to.equal(false)

      const cell = VALID_FLEET[0]
      await (await game.connect(opponent).attack(matchId, cell)).wait()

      const m = await game.getMatch(matchId)
      expect(m.status).to.equal(MatchStatus.ResolvingShot)
      expect(m.moveCount).to.equal(1n)
      expect(m.pendingMoveId).to.equal(1n)
      expect(m.timeoutState.resolvingDeadline).to.equal(m.lastActionAt + DAY)

      const pending = await game.getPendingShot(matchId)
      expect(pending.exists).to.equal(true)
      expect(pending.moveId).to.equal(1n)
      expect(pending.attacker).to.equal(opponent.address)
      expect(pending.defender).to.equal(creator.address)
      expect(pending.cellIndex).to.equal(BigInt(cell))
      expect(pending.resultCtHash).to.not.equal(0n)
      expect(pending.sunkShipCtHash).to.not.equal(0n)
      expect(pending.submittedAt).to.be.greaterThan(0n)

      const move = await game.getMove(matchId, 1n)
      expect(move.result).to.equal(ShotResult.None)
      expect(move.finalized).to.equal(false)
      expect(move.submittedAt).to.equal(pending.submittedAt)
    })

    it('finalize clears the pending shot, the resolving deadline, and stamps the move', async () => {
      const { game, opponent, matchId } = await loadFixture(activeMatchFixture)
      const shot = await playShot(game, matchId, opponent, VALID_FLEET[0])
      expect(shot.result).to.equal(ShotResult.Hit)

      const m = await game.getMatch(matchId)
      expect(m.status).to.equal(MatchStatus.InProgress)
      expect(m.pendingMoveId).to.equal(0n)
      expect(m.timeoutState.resolvingDeadline).to.equal(0n)
      // Hit keeps the attacker on turn with a fresh turn deadline.
      expect(m.currentTurn).to.equal(opponent.address)
      expect(m.timeoutState.turnDeadline).to.equal(m.lastActionAt + DAY)

      const pending = await game.getPendingShot(matchId)
      expect(pending.exists).to.equal(false)

      const move = await game.getMove(matchId, 1n)
      expect(move.finalized).to.equal(true)
      expect(move.result).to.equal(ShotResult.Hit)
      expect(move.resolvedAt).to.be.greaterThanOrEqual(move.submittedAt)
    })
  })

  describe('deadline boundaries (inclusive deadlines)', () => {
    it('allows joining exactly at the join deadline', async () => {
      const [creator, opponent] = await ethers.getSigners()
      const factory = await ethers.getContractFactory('BattleshipGame')
      const game = await factory.deploy()
      await game.waitForDeployment()
      await (await game.connect(creator).createMatch(opponent.address)).wait()

      const m = await game.getMatch(1n)
      await time.setNextBlockTimestamp(m.timeoutState.joinDeadline)
      await expect(game.connect(opponent).joinMatch(1n)).to.emit(game, 'MatchJoined')
    })

    it('rejects a placement-timeout claim exactly at the deadline', async () => {
      const { game, creator, matchId } = await loadFixture(joinedFixture)
      const input = await encryptFleetAs(creator, VALID_FLEET)
      await (await game.connect(creator).submitFleet(matchId, input)).wait()

      const m = await game.getMatch(matchId)
      await time.setNextBlockTimestamp(m.timeoutState.placementDeadline)
      await expect(
        game.connect(creator).claimTimeoutWin(matchId),
      ).to.be.revertedWithCustomError(game, 'NoTimeoutAvailable')
    })

    it('rejects a turn-timeout claim exactly at the deadline and accepts one second after', async () => {
      const { game, creator, matchId } = await loadFixture(activeMatchFixture)
      const m = await game.getMatch(matchId)

      await time.setNextBlockTimestamp(m.timeoutState.turnDeadline)
      await expect(
        game.connect(creator).claimTimeoutWin(matchId),
      ).to.be.revertedWithCustomError(game, 'NoTimeoutAvailable')

      await time.setNextBlockTimestamp(m.timeoutState.turnDeadline + 1n)
      await expect(game.connect(creator).claimTimeoutWin(matchId))
        .to.emit(game, 'TimeoutWinClaimed')
        .withArgs(matchId, creator.address, 2n) // TurnTimeout
    })
  })

  describe('move reads and pagination', () => {
    it('rejects move id 0 and ids beyond the move count', async () => {
      const { game, opponent, matchId } = await loadFixture(activeMatchFixture)
      await playShot(game, matchId, opponent, 99)

      await expect(game.getMove(matchId, 0n)).to.be.revertedWithCustomError(
        game,
        'MoveNotFound',
      )
      await expect(game.getMove(matchId, 2n)).to.be.revertedWithCustomError(
        game,
        'MoveNotFound',
      )
    })

    it('paginates move history with offset and limit clamping', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(activeMatchFixture)
      // Miss passes the turn, so alternate misses build a 3-move history.
      await playShot(game, matchId, opponent, 9) // water in VALID_FLEET
      await playShot(game, matchId, creator, 99) // water in VALID_FLEET_ALT
      await playShot(game, matchId, opponent, 19)

      const all = await game.getMoveHistory(matchId, 0, 50)
      expect(all.length).to.equal(3)
      expect(all.map((move: { moveId: bigint }) => move.moveId)).to.deep.equal([1n, 2n, 3n])
      expect(all[0].cellIndex).to.equal(9n)
      expect(all[1].cellIndex).to.equal(99n)
      expect(all[2].cellIndex).to.equal(19n)

      const middle = await game.getMoveHistory(matchId, 1, 1)
      expect(middle.length).to.equal(1)
      expect(middle[0].moveId).to.equal(2n)
      expect(middle[0].attacker).to.equal(creator.address)

      const tail = await game.getMoveHistory(matchId, 2, 50)
      expect(tail.length).to.equal(1)

      const past = await game.getMoveHistory(matchId, 3, 50)
      expect(past.length).to.equal(0)
    })

    it('returns an empty page when the player-match offset reaches the total', async () => {
      const { game, creator } = await loadFixture(joinedFixture)
      expect(await game.getPlayerMatchCount(creator.address)).to.equal(1n)
      const page = await game.getPlayerMatches(creator.address, 1, 10)
      expect(page.length).to.equal(0)
    })
  })

  describe('terminal state bookkeeping', () => {
    it('a win clears the turn and stamps finishedAt, winner, and the finished event', async () => {
      const { game, opponent, matchId } = await loadFixture(activeMatchFixture)

      let lastReceipt
      for (const cell of VALID_FLEET) {
        const tx = await game.connect(opponent).attack(matchId, cell)
        const receipt = await tx.wait()
        const submitted = parseEvent(game, receipt!, 'ShotSubmitted')
        await advancePastDecryptDelay()
        lastReceipt = await (await game.finalizeAttack(matchId, submitted.moveId)).wait()
      }

      const finished = parseEvent(game, lastReceipt!, 'MatchFinished')
      expect(finished.winner).to.equal(opponent.address)
      expect(finished.moveCount).to.equal(BigInt(VALID_FLEET.length))

      const m = await game.getMatch(matchId)
      expect(m.status).to.equal(MatchStatus.Finished)
      expect(m.winner).to.equal(opponent.address)
      expect(m.currentTurn).to.equal(ZERO)
      expect(m.finishedAt).to.be.greaterThan(0n)
      expect(m.pendingMoveId).to.equal(0n)
    })

    it('forfeit clears the turn and stamps the winner and finishedAt', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(activeMatchFixture)
      await (await game.connect(creator).forfeit(matchId)).wait()

      const m = await game.getMatch(matchId)
      expect(m.status).to.equal(9n) // Forfeited
      expect(m.winner).to.equal(opponent.address)
      expect(m.currentTurn).to.equal(ZERO)
      expect(m.finishedAt).to.be.greaterThan(0n)
    })
  })

  describe('validation lifecycle details', () => {
    it('keeps the match in ValidatingPlacement until both fleets finalize valid', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(joinedFixture)
      const creatorInput = await encryptFleetAs(creator, VALID_FLEET)
      await (await game.connect(creator).submitFleet(matchId, creatorInput)).wait()
      const opponentInput = await encryptFleetAs(opponent, VALID_FLEET_ALT)
      await (await game.connect(opponent).submitFleet(matchId, opponentInput)).wait()

      await advancePastDecryptDelay()
      await (await game.finalizeFleetValidation(matchId, creator.address)).wait()

      // One valid fleet is not enough to start.
      let m = await game.getMatch(matchId)
      expect(m.status).to.equal(MatchStatus.ValidatingPlacement)
      expect(m.currentTurn).to.equal(ZERO)

      await expect(game.finalizeFleetValidation(matchId, opponent.address)).to.emit(
        game,
        'MatchStarted',
      )
      m = await game.getMatch(matchId)
      expect(m.status).to.equal(MatchStatus.InProgress)
    })

    it('stamps fleetValidatedAt and the player flags on both outcomes', async () => {
      const { game, creator, matchId } = await loadFixture(joinedFixture)
      const input = await encryptFleetAs(creator, VALID_FLEET)
      await (await game.connect(creator).submitFleet(matchId, input)).wait()
      await advancePastDecryptDelay()
      await (await game.finalizeFleetValidation(matchId, creator.address)).wait()

      const [creatorView, opponentView] = await game.getPlayers(matchId)
      expect(creatorView.placementStatus).to.equal(4n) // Valid
      expect(creatorView.fleetSubmitted).to.equal(true)
      expect(creatorView.fleetValid).to.equal(true)
      expect(opponentView.placementStatus).to.equal(1n) // NotSubmitted
      expect(opponentView.fleetSubmitted).to.equal(false)
    })
  })
})
