import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import {
  VALID_FLEET,
  VALID_FLEET_ALT,
  deployEncryptedMatchFixtureBase,
  encryptFleetAs,
  makeShotReady,
  makeValidationReady,
  parseEvent,
  playShot,
  startEncryptedMatch,
} from './helpers/encryptedFleet'

// GAME-903: adversarial release QA. Every test here is an attack attempt:
// acting in someone else's match, acting out of turn, replaying a finalized
// step, stealing a timeout claim, or abusing the permissionless finalizers.
// The earlier suites cover the per-function reverts; this suite covers the
// attacker's viewpoint across matches and phases, including the release
// blockers "act for another wallet", "attack twice / outside the active
// turn", and "result supplied by the frontend".

const MatchStatus = {
  ValidatingPlacement: 3n,
  InProgress: 5n,
  ResolvingShot: 6n,
  Forfeited: 9n,
} as const

const ShotResult = { Miss: 1n, Hit: 2n } as const

async function activeMatchFixture() {
  const base = await deployEncryptedMatchFixtureBase()
  await startEncryptedMatch(base.game, base.matchId, base.creator, base.opponent)
  return base
}

async function resolvingShotFixture() {
  const base = await activeMatchFixture()
  // No proof is published, so the shot stays unresolvable until someone
  // publishes the threshold-network result.
  await (await base.game.connect(base.opponent).attack(base.matchId, VALID_FLEET[0])).wait()
  return base
}

/// Two independent matches on one deployment: (creator, opponent) play match
/// 1, (thirdParty, fourthParty) play match 2; both battles are in progress.
async function twoMatchFixture() {
  const [creator, opponent, thirdParty, fourthParty] = await ethers.getSigners()
  const factory = await ethers.getContractFactory('BattleshipGame')
  const game = await factory.deploy()
  await game.waitForDeployment()

  await (await game.connect(creator).createMatch(opponent.address)).wait()
  await (await game.connect(opponent).joinMatch(1n)).wait()
  await startEncryptedMatch(game, 1n, creator, opponent)

  await (await game.connect(thirdParty).createMatch(fourthParty.address)).wait()
  await (await game.connect(fourthParty).joinMatch(2n)).wait()
  await startEncryptedMatch(game, 2n, thirdParty, fourthParty)

  return { game, creator, opponent, thirdParty, fourthParty }
}

describe('BattleshipGame adversarial security (GAME-903)', () => {
  describe('unauthorized writes by outsiders', () => {
    it('an outsider cannot attack: turn ownership gates every shot', async () => {
      const { game, outsider, matchId } = await loadFixture(activeMatchFixture)
      await expect(
        game.connect(outsider).attack(matchId, 0),
      ).to.be.revertedWithCustomError(game, 'NotYourTurn')
    })

    it('an outsider cannot forfeit or claim a timeout in someone else\'s match', async () => {
      const { game, outsider, matchId } = await loadFixture(activeMatchFixture)
      await expect(game.connect(outsider).forfeit(matchId)).to.be.revertedWithCustomError(
        game,
        'NotMatchPlayer',
      )
      await time.increase(25 * 60 * 60)
      await expect(
        game.connect(outsider).claimTimeoutWin(matchId),
      ).to.be.revertedWithCustomError(game, 'NotMatchPlayer')
    })

    it('an outsider cannot cancel a match they did not create', async () => {
      const { game, outsider, matchId } = await loadFixture(deployEncryptedMatchFixtureBase)
      await expect(
        game.connect(outsider).cancelMatch(matchId),
      ).to.be.revertedWithCustomError(game, 'OnlyCreator')
    })
  })

  describe('phase abuse', () => {
    it('rejects fleet submission once the battle started', async () => {
      const { game, creator, matchId } = await loadFixture(activeMatchFixture)
      const input = await encryptFleetAs(creator, VALID_FLEET)
      await expect(
        game.connect(creator).submitFleet(matchId, input),
      ).to.be.revertedWithCustomError(game, 'InvalidMatchStatus')
    })

    it('rejects replaying fleet validation once the battle started', async () => {
      const { game, creator, matchId } = await loadFixture(activeMatchFixture)
      await expect(
        game.finalizeFleetValidation(matchId, creator.address),
      ).to.be.revertedWithCustomError(game, 'InvalidMatchStatus')
      await expect(
        game.finalizeFleetValidationWithProof(matchId, creator.address, 1n, '0x'),
      ).to.be.revertedWithCustomError(game, 'InvalidMatchStatus')
    })

    it('rejects attacks before the match started', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(
        deployEncryptedMatchFixtureBase,
      )
      await expect(
        game.connect(creator).attack(matchId, 0),
      ).to.be.revertedWithCustomError(game, 'InvalidMatchStatus')
      await expect(
        game.connect(opponent).attack(matchId, 0),
      ).to.be.revertedWithCustomError(game, 'InvalidMatchStatus')
    })

    it('rejects cancellation during shot resolution', async () => {
      const { game, creator, matchId } = await loadFixture(resolvingShotFixture)
      await expect(
        game.connect(creator).cancelMatch(matchId),
      ).to.be.revertedWithCustomError(game, 'CannotCancelStartedMatch')
    })

    it('rejects proof finalization once no shot is pending', async () => {
      const { game, opponent, matchId } = await loadFixture(activeMatchFixture)
      await playShot(game, matchId, opponent, 9) // miss, resolved
      await expect(
        game.finalizeAttackWithProof(matchId, 1n, 1n, '0x', 0n, '0x'),
      ).to.be.revertedWithCustomError(game, 'InvalidMatchStatus')
    })
  })

  describe('timeout-claim abuse', () => {
    it('shot resolution is never claimable as a timeout win, even past the resolving deadline', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(resolvingShotFixture)
      const m = await game.getMatch(matchId)
      await time.setNextBlockTimestamp(m.timeoutState.resolvingDeadline + 1000n)
      await ethers.provider.send('evm_mine', [])

      // Neither the attacker nor the defender can convert a stuck resolution
      // into a win; publishing the proof and forfeit are the only exits.
      await expect(
        game.connect(creator).claimTimeoutWin(matchId),
      ).to.be.revertedWithCustomError(game, 'NoTimeoutAvailable')
      await expect(
        game.connect(opponent).claimTimeoutWin(matchId),
      ).to.be.revertedWithCustomError(game, 'NoTimeoutAvailable')
    })

    it('the stalled player on turn cannot claim their own turn timeout', async () => {
      const { game, opponent, matchId } = await loadFixture(activeMatchFixture)
      // The invited opponent is on turn after start and lets the clock expire.
      await time.increase(25 * 60 * 60)
      await expect(
        game.connect(opponent).claimTimeoutWin(matchId),
      ).to.be.revertedWithCustomError(game, 'NotTimeoutClaimant')
    })

    it('awards the real-flow turn timeout only to the waiting player', async () => {
      const { game, creator, matchId } = await loadFixture(activeMatchFixture)
      await time.increase(25 * 60 * 60)
      await expect(game.connect(creator).claimTimeoutWin(matchId))
        .to.emit(game, 'TimeoutWinClaimed')
        .withArgs(matchId, creator.address, 2n) // TurnTimeout

      const m = await game.getMatch(matchId)
      expect(m.status).to.equal(MatchStatus.Forfeited)
      expect(m.winner).to.equal(creator.address)
    })
  })

  describe('replay protection', () => {
    it('a finalized move cannot be finalized again under a fresh pending shot', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(activeMatchFixture)
      const first = await playShot(game, matchId, opponent, 9) // miss: turn passes
      expect(first.result).to.equal(ShotResult.Miss)

      // Second shot pending; replaying move 1 must not resolve it.
      await (await game.connect(creator).attack(matchId, 99)).wait()
      await makeShotReady(game, matchId)
      await expect(game.finalizeAttack(matchId, first.moveId)).to.be.revertedWithCustomError(
        game,
        'InvalidMoveId',
      )
    })

    it('an attacked cell stays closed across turns', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(activeMatchFixture)
      await playShot(game, matchId, opponent, 9) // miss on creator board
      await playShot(game, matchId, creator, 99) // miss on opponent board
      // Back on turn, the opponent replays the same cell.
      await expect(
        game.connect(opponent).attack(matchId, 9),
      ).to.be.revertedWithCustomError(game, 'CellAlreadyAttacked')
    })

    it('a second join attempt by the legitimate opponent is rejected', async () => {
      const { game, opponent, matchId } = await loadFixture(deployEncryptedMatchFixtureBase)
      await expect(game.connect(opponent).joinMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'OpponentAlreadyJoined',
      )
    })
  })

  describe('permissionless finalizers stay result-neutral', () => {
    it('an outsider may finalize a shot but the result still comes from the decrypt channel', async () => {
      const { game, creator, opponent, outsider, matchId } = await loadFixture(
        activeMatchFixture,
      )
      const cell = VALID_FLEET[0] // a real creator ship segment
      const receipt = await (await game.connect(opponent).attack(matchId, cell)).wait()
      const submitted = parseEvent(game, receipt!, 'ShotSubmitted')
      await makeShotReady(game, matchId)

      const finalizeReceipt = await (
        await game.connect(outsider).finalizeAttack(matchId, submitted.moveId)
      ).wait()
      const resolved = parseEvent(game, finalizeReceipt!, 'ShotResolved')
      // The outsider could not influence the outcome: the cell is a hit
      // because the fleet says so, and the attacker keeps the turn.
      expect(resolved.result).to.equal(ShotResult.Hit)
      const m = await game.getMatch(matchId)
      expect(m.currentTurn).to.equal(opponent.address)
      expect(m.creator).to.equal(creator.address)
    })

    it('an outsider may finalize fleet validation but cannot pick the player or the verdict', async () => {
      const { game, creator, outsider, matchId } = await loadFixture(
        deployEncryptedMatchFixtureBase,
      )
      const input = await encryptFleetAs(creator, VALID_FLEET)
      await (await game.connect(creator).submitFleet(matchId, input)).wait()
      await makeValidationReady(game, matchId, creator)

      // Self-referencing call: the caller check fires for msg.sender.
      await expect(
        game.connect(outsider).finalizeFleetValidation(matchId, outsider.address),
      ).to.be.revertedWithCustomError(game, 'NotMatchPlayer')
      // Address-argument check for a non-player target.
      await expect(
        game.connect(creator).finalizeFleetValidation(matchId, outsider.address),
      ).to.be.revertedWithCustomError(game, 'NotMatchPlayerAddress')

      await expect(game.connect(outsider).finalizeFleetValidation(matchId, creator.address))
        .to.emit(game, 'FleetValidated')
        .withArgs(matchId, creator.address, true)
    })
  })

  describe('cross-match isolation', () => {
    it('players of one match cannot write into another match', async () => {
      const { game, creator, opponent } = await loadFixture(twoMatchFixture)

      // Match 2 belongs to thirdParty/fourthParty. Match-1 players bounce off
      // every write, even when match 2 is mid-battle.
      await expect(game.connect(opponent).attack(2n, 0)).to.be.revertedWithCustomError(
        game,
        'NotYourTurn',
      )
      await expect(game.connect(creator).forfeit(2n)).to.be.revertedWithCustomError(
        game,
        'NotMatchPlayer',
      )
      await expect(game.connect(creator).cancelMatch(2n)).to.be.revertedWithCustomError(
        game,
        'OnlyCreator',
      )
      const input = await encryptFleetAs(creator, VALID_FLEET)
      await expect(game.connect(creator).submitFleet(2n, input)).to.be.revertedWithCustomError(
        game,
        'InvalidMatchStatus', // match 2 is InProgress; non-players never reach state
      )
    })

    it('shots in one match never touch the boards or moves of another', async () => {
      const { game, opponent, fourthParty } = await loadFixture(twoMatchFixture)

      await playShot(game, 1n, opponent, 9) // miss in match 1
      await playShot(game, 2n, fourthParty, VALID_FLEET[0]) // hit in match 2

      const [match1Creator] = await game.getPlayers(1n)
      const [match2Creator] = await game.getPlayers(2n)
      expect(match1Creator.publicBoard.attackedMask).to.equal(1n << 9n)
      expect(match1Creator.publicBoard.hitMask).to.equal(0n)
      expect(match2Creator.publicBoard.attackedMask).to.equal(1n << BigInt(VALID_FLEET[0]))
      expect(match2Creator.publicBoard.hitMask).to.equal(1n << BigInt(VALID_FLEET[0]))

      expect((await game.getMatch(1n)).moveCount).to.equal(1n)
      expect((await game.getMatch(2n)).moveCount).to.equal(1n)
      await expect(game.getMove(1n, 2n)).to.be.revertedWithCustomError(game, 'MoveNotFound')
    })
  })

  describe('msg.sender is the only acting identity', () => {
    it('forfeit always records the caller as the loser', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(activeMatchFixture)
      // The opponent "helpfully" forfeits hoping to assign the loss to the
      // creator; the contract books the caller as loser and the creator wins.
      await expect(game.connect(opponent).forfeit(matchId))
        .to.emit(game, 'MatchForfeited')
        .withArgs(matchId, opponent.address, creator.address)
    })

    it('createMatch books msg.sender as creator; the invitee cannot be impersonated', async () => {
      const [, , thirdParty, fourthParty] = await ethers.getSigners()
      const { game } = await loadFixture(deployEncryptedMatchFixtureBase)
      await (await game.connect(thirdParty).createMatch(fourthParty.address)).wait()
      const m = await game.getMatch(2n)
      expect(m.creator).to.equal(thirdParty.address)
      // Only the named invitee can occupy the opponent slot.
      await expect(game.connect(thirdParty).joinMatch(2n)).to.be.revertedWithCustomError(
        game,
        'CreatorCannotJoinOwnMatch',
      )
    })
  })
})
