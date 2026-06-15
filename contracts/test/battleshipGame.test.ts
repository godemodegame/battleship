import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'

// Mirrors of the Solidity enums. Keep in sync with BattleshipGame.sol.
const MatchStatus = {
  None: 0n,
  WaitingForOpponent: 1n,
  WaitingForPlacement: 2n,
  ValidatingPlacement: 3n,
  ReadyToStart: 4n,
  InProgress: 5n,
  ResolvingShot: 6n,
  Finished: 7n,
  Cancelled: 8n,
  Forfeited: 9n,
} as const

const MatchType = { Friend: 0n, Open: 1n, Bot: 2n } as const

const PlacementStatus = {
  None: 0n,
  NotSubmitted: 1n,
  Submitted: 2n,
  ResolvingValidation: 3n,
  Valid: 4n,
  Invalid: 5n,
} as const

const TimeoutReason = {
  None: 0n,
  PlacementTimeout: 1n,
  TurnTimeout: 2n,
  ResolvingTimeout: 3n,
} as const

const DAY = 24n * 60n * 60n
const ZERO_ADDRESS = ethers.ZeroAddress

async function deployGameFixture() {
  const [creator, friend, outsider] = await ethers.getSigners()
  const factory = await ethers.getContractFactory('BattleshipGame')
  const game = await factory.deploy()
  await game.waitForDeployment()
  return { game, creator, friend, outsider }
}

// Harness fixture: forces states that production code only reaches through
// Phase 4 fleet submission / Phase 7 battle, so the timeout-win transitions
// of claimTimeoutWin are exercised for real (GAME-306/309).
async function harnessJoinedFixture() {
  const [creator, friend, outsider] = await ethers.getSigners()
  const factory = await ethers.getContractFactory('BattleshipGameHarness')
  const game = await factory.deploy()
  await game.waitForDeployment()
  await game.connect(creator).createMatch(friend.address)
  await game.connect(friend).joinMatch(1n)
  return { game, creator, friend, outsider, matchId: 1n }
}

async function createdMatchFixture() {
  const base = await deployGameFixture()
  await base.game.connect(base.creator).createMatch(base.friend.address)
  return { ...base, matchId: 1n }
}

async function joinedMatchFixture() {
  const base = await createdMatchFixture()
  await base.game.connect(base.friend).joinMatch(base.matchId)
  return base
}

async function createdOpenMatchFixture() {
  const base = await deployGameFixture()
  await base.game.connect(base.creator).createOpenMatch()
  return { ...base, matchId: 1n }
}

describe('BattleshipGame public lifecycle', () => {
  describe('constants', () => {
    it('exposes the board and timeout configuration from the data model', async () => {
      const { game } = await loadFixture(deployGameFixture)
      expect(await game.BOARD_SIZE()).to.equal(10n)
      expect(await game.CELL_COUNT()).to.equal(100n)
      expect(await game.MAX_SHIPS()).to.equal(10n)
      expect(await game.TOTAL_SHIP_CELLS()).to.equal(20n)
      expect(await game.NO_CELL()).to.equal(255n)
      expect(await game.JOIN_TIMEOUT()).to.equal(DAY)
      expect(await game.PLACEMENT_TIMEOUT()).to.equal(DAY)
      expect(await game.TURN_TIMEOUT()).to.equal(DAY)
      expect(await game.RESOLVING_TIMEOUT()).to.equal(DAY)
      expect(await game.MAX_PAGE_LIMIT()).to.equal(50n)
    })
  })

  describe('createMatch', () => {
    it('creates a strict friend match waiting for the invited opponent', async () => {
      const { game, creator, friend } = await loadFixture(deployGameFixture)

      await expect(game.connect(creator).createMatch(friend.address))
        .to.emit(game, 'MatchCreated')
        .withArgs(1n, creator.address, friend.address)

      const createdAt = BigInt(await time.latest())
      const view = await game.getMatch(1n)
      expect(view.id).to.equal(1n)
      expect(view.matchType).to.equal(MatchType.Friend)
      expect(view.status).to.equal(MatchStatus.WaitingForOpponent)
      expect(view.creator).to.equal(creator.address)
      expect(view.opponent).to.equal(ZERO_ADDRESS)
      expect(view.invitedOpponent).to.equal(friend.address)
      expect(view.currentTurn).to.equal(ZERO_ADDRESS)
      expect(view.winner).to.equal(ZERO_ADDRESS)
      expect(view.createdAt).to.equal(createdAt)
      expect(view.lastActionAt).to.equal(createdAt)
      expect(view.joinedAt).to.equal(0n)
      expect(view.startedAt).to.equal(0n)
      expect(view.finishedAt).to.equal(0n)
      expect(view.moveCount).to.equal(0n)
      expect(view.pendingMoveId).to.equal(0n)
      expect(view.timeoutState.joinDeadline).to.equal(createdAt + DAY)
      expect(view.timeoutState.placementDeadline).to.equal(0n)
    })

    it('initializes the creator slot and leaves the opponent slot empty', async () => {
      const { game, creator, friend } = await loadFixture(deployGameFixture)
      await game.connect(creator).createMatch(friend.address)

      const [creatorView, opponentView] = await game.getPlayers(1n)
      expect(creatorView.player).to.equal(creator.address)
      expect(creatorView.joined).to.equal(true)
      expect(creatorView.placementStatus).to.equal(PlacementStatus.NotSubmitted)
      expect(creatorView.fleetSubmitted).to.equal(false)
      expect(creatorView.fleetValid).to.equal(false)
      expect(creatorView.publicBoard.attackedMask).to.equal(0n)
      expect(creatorView.publicBoard.missMask).to.equal(0n)
      expect(creatorView.publicBoard.hitMask).to.equal(0n)
      expect(creatorView.publicBoard.sunkMask).to.equal(0n)

      expect(opponentView.player).to.equal(ZERO_ADDRESS)
      expect(opponentView.joined).to.equal(false)
      expect(opponentView.placementStatus).to.equal(PlacementStatus.None)
    })

    it('assigns sequential match ids starting at 1', async () => {
      const { game, creator, friend, outsider } = await loadFixture(deployGameFixture)
      await game.connect(creator).createMatch(friend.address)
      await game.connect(creator).createMatch(outsider.address)
      expect(await game.nextMatchId()).to.equal(3n)
      expect((await game.getMatch(2n)).invitedOpponent).to.equal(outsider.address)
    })

    it('records the match in the creator history', async () => {
      const { game, creator, friend } = await loadFixture(deployGameFixture)
      await game.connect(creator).createMatch(friend.address)
      expect(await game.getPlayerMatchCount(creator.address)).to.equal(1n)
      expect(await game.getPlayerMatches(creator.address, 0, 10)).to.deep.equal([1n])
      expect(await game.getPlayerMatchCount(friend.address)).to.equal(0n)
    })

    it('rejects the zero address as invited opponent', async () => {
      const { game, creator } = await loadFixture(deployGameFixture)
      await expect(
        game.connect(creator).createMatch(ZERO_ADDRESS),
      ).to.be.revertedWithCustomError(game, 'InvalidInvitedOpponent')
    })

    it('rejects self-invites', async () => {
      const { game, creator } = await loadFixture(deployGameFixture)
      await expect(
        game.connect(creator).createMatch(creator.address),
      ).to.be.revertedWithCustomError(game, 'SelfInviteNotAllowed')
    })
  })

  describe('joinMatch', () => {
    it('lets the invited opponent join and moves to WaitingForPlacement', async () => {
      const { game, friend, matchId } = await loadFixture(createdMatchFixture)

      await expect(game.connect(friend).joinMatch(matchId))
        .to.emit(game, 'MatchJoined')
        .withArgs(matchId, friend.address)

      const joinedAt = BigInt(await time.latest())
      const view = await game.getMatch(matchId)
      expect(view.status).to.equal(MatchStatus.WaitingForPlacement)
      expect(view.opponent).to.equal(friend.address)
      expect(view.joinedAt).to.equal(joinedAt)
      expect(view.lastActionAt).to.equal(joinedAt)
      expect(view.timeoutState.placementDeadline).to.equal(joinedAt + DAY)

      const [, opponentView] = await game.getPlayers(matchId)
      expect(opponentView.player).to.equal(friend.address)
      expect(opponentView.joined).to.equal(true)
      expect(opponentView.placementStatus).to.equal(PlacementStatus.NotSubmitted)

      expect(await game.getPlayerMatches(friend.address, 0, 10)).to.deep.equal([matchId])
    })

    it('rejects joining a match that does not exist', async () => {
      const { game, friend } = await loadFixture(deployGameFixture)
      await expect(game.connect(friend).joinMatch(42n)).to.be.revertedWithCustomError(
        game,
        'MatchNotFound',
      )
    })

    it('rejects a wallet that was not invited', async () => {
      const { game, outsider, matchId } = await loadFixture(createdMatchFixture)
      await expect(game.connect(outsider).joinMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'NotInvitedOpponent',
      )
    })

    it('rejects the creator joining their own match', async () => {
      const { game, creator, matchId } = await loadFixture(createdMatchFixture)
      await expect(game.connect(creator).joinMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'CreatorCannotJoinOwnMatch',
      )
    })

    it('rejects a second join after the opponent slot is filled', async () => {
      const { game, friend, matchId } = await loadFixture(joinedMatchFixture)
      await expect(game.connect(friend).joinMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'OpponentAlreadyJoined',
      )
    })

    it('rejects joining after the join deadline expired', async () => {
      const { game, friend, matchId } = await loadFixture(createdMatchFixture)
      await time.increase(DAY + 1n)
      await expect(game.connect(friend).joinMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'JoinDeadlineExpired',
      )
    })

    it('rejects joining a cancelled match', async () => {
      const { game, creator, friend, matchId } = await loadFixture(createdMatchFixture)
      await game.connect(creator).cancelMatch(matchId)
      await expect(game.connect(friend).joinMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'InvalidMatchStatus',
      )
    })
  })

  describe('open matchmaking', () => {
    it('creates an open match joinable by anyone, with no invited opponent', async () => {
      const { game, creator } = await loadFixture(deployGameFixture)

      await expect(game.connect(creator).createOpenMatch())
        .to.emit(game, 'MatchCreated')
        .withArgs(1n, creator.address, ZERO_ADDRESS)

      const createdAt = BigInt(await time.latest())
      const view = await game.getMatch(1n)
      expect(view.id).to.equal(1n)
      expect(view.matchType).to.equal(MatchType.Open)
      expect(view.status).to.equal(MatchStatus.WaitingForOpponent)
      expect(view.creator).to.equal(creator.address)
      expect(view.opponent).to.equal(ZERO_ADDRESS)
      expect(view.invitedOpponent).to.equal(ZERO_ADDRESS)
      expect(view.timeoutState.joinDeadline).to.equal(createdAt + DAY)

      const [creatorView] = await game.getPlayers(1n)
      expect(creatorView.player).to.equal(creator.address)
      expect(creatorView.joined).to.equal(true)
      expect(creatorView.placementStatus).to.equal(PlacementStatus.NotSubmitted)
    })

    it('indexes a new open match in the lobby view', async () => {
      const { game, matchId } = await loadFixture(createdOpenMatchFixture)
      expect(await game.getOpenMatchCount()).to.equal(1n)
      expect(await game.getOpenMatches(0, 50)).to.deep.equal([matchId])
    })

    it('does not index strict friend matches in the lobby view', async () => {
      const { game, creator, friend } = await loadFixture(deployGameFixture)
      await game.connect(creator).createMatch(friend.address)
      expect(await game.getOpenMatchCount()).to.equal(0n)
      expect(await game.getOpenMatches(0, 50)).to.deep.equal([])
    })

    it('lets any non-invited wallet join an open match', async () => {
      const { game, outsider, matchId } = await loadFixture(createdOpenMatchFixture)

      await expect(game.connect(outsider).joinMatch(matchId))
        .to.emit(game, 'MatchJoined')
        .withArgs(matchId, outsider.address)

      const view = await game.getMatch(matchId)
      expect(view.status).to.equal(MatchStatus.WaitingForPlacement)
      expect(view.opponent).to.equal(outsider.address)

      // The match has left WaitingForOpponent and is dropped from the lobby.
      expect(await game.getOpenMatchCount()).to.equal(0n)
      expect(await game.getOpenMatches(0, 50)).to.deep.equal([])
    })

    it('rejects the creator joining their own open match', async () => {
      const { game, creator, matchId } = await loadFixture(createdOpenMatchFixture)
      await expect(game.connect(creator).joinMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'CreatorCannotJoinOwnMatch',
      )
    })

    it('rejects a second join after an open match is filled', async () => {
      const { game, friend, outsider, matchId } = await loadFixture(createdOpenMatchFixture)
      await game.connect(friend).joinMatch(matchId)
      await expect(game.connect(outsider).joinMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'OpponentAlreadyJoined',
      )
    })

    it('tracks two independent open matches and keeps both joinable', async () => {
      const { game, creator, friend, outsider } = await loadFixture(deployGameFixture)
      await game.connect(creator).createOpenMatch()
      await game.connect(friend).createOpenMatch()

      expect(await game.getOpenMatchCount()).to.equal(2n)
      expect(await game.getOpenMatches(0, 50)).to.deep.equal([1n, 2n])

      // A stranger joins the first; only the second remains joinable.
      await game.connect(outsider).joinMatch(1n)
      expect(await game.getOpenMatchCount()).to.equal(1n)
      expect(await game.getOpenMatches(0, 50)).to.deep.equal([2n])
    })

    it('lets the creator cancel an open match and drops it from the lobby', async () => {
      const { game, creator, matchId } = await loadFixture(createdOpenMatchFixture)
      await expect(game.connect(creator).cancelMatch(matchId))
        .to.emit(game, 'MatchCancelled')
        .withArgs(matchId)
      expect(await game.getOpenMatchCount()).to.equal(0n)
      expect(await game.getOpenMatches(0, 50)).to.deep.equal([])
    })

    it('rejects a non-creator cancelling an open match', async () => {
      const { game, outsider, matchId } = await loadFixture(createdOpenMatchFixture)
      await expect(game.connect(outsider).cancelMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'OnlyCreator',
      )
    })

    it('rejects joining an open match after the join deadline, leaving cancel as recovery', async () => {
      const { game, creator, outsider, matchId } = await loadFixture(createdOpenMatchFixture)
      await time.increase(DAY + 1n)
      await expect(game.connect(outsider).joinMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'JoinDeadlineExpired',
      )
      // The creator can still reclaim the expired open match.
      await expect(game.connect(creator).cancelMatch(matchId)).to.emit(game, 'MatchCancelled')
      expect(await game.getOpenMatchCount()).to.equal(0n)
    })

    it('removes the middle of three open matches without corrupting the index', async () => {
      const { game, creator, friend, outsider } = await loadFixture(deployGameFixture)
      await game.connect(creator).createOpenMatch() // id 1
      await game.connect(friend).createOpenMatch() // id 2
      await game.connect(outsider).createOpenMatch() // id 3

      // Cancel the middle entry; swap-pop moves id 3 into its slot.
      await game.connect(friend).cancelMatch(2n)
      expect(await game.getOpenMatchCount()).to.equal(2n)
      expect(await game.getOpenMatches(0, 50)).to.deep.equal([1n, 3n])

      // The surviving ids stay independently joinable.
      await game.connect(friend).joinMatch(3n)
      expect(await game.getOpenMatches(0, 50)).to.deep.equal([1n])
    })

    it('paginates the open-match lobby and enforces the page cap', async () => {
      const { game, creator } = await loadFixture(deployGameFixture)
      await game.connect(creator).createOpenMatch()
      await game.connect(creator).createOpenMatch()
      await game.connect(creator).createOpenMatch()

      expect(await game.getOpenMatchCount()).to.equal(3n)
      expect(await game.getOpenMatches(0, 2)).to.deep.equal([1n, 2n])
      expect(await game.getOpenMatches(2, 2)).to.deep.equal([3n])
      expect(await game.getOpenMatches(3, 2)).to.deep.equal([])
      await expect(game.getOpenMatches(0, 0)).to.be.revertedWithCustomError(
        game,
        'InvalidPaginationLimit',
      )
      await expect(game.getOpenMatches(0, 51)).to.be.revertedWithCustomError(
        game,
        'InvalidPaginationLimit',
      )
    })
  })

  describe('cancelMatch', () => {
    it('lets the creator cancel while waiting for the opponent', async () => {
      const { game, creator, matchId } = await loadFixture(createdMatchFixture)

      await expect(game.connect(creator).cancelMatch(matchId))
        .to.emit(game, 'MatchCancelled')
        .withArgs(matchId)

      const finishedAt = BigInt(await time.latest())
      const view = await game.getMatch(matchId)
      expect(view.status).to.equal(MatchStatus.Cancelled)
      expect(view.finishedAt).to.equal(finishedAt)
      expect(view.winner).to.equal(ZERO_ADDRESS)
      expect(view.currentTurn).to.equal(ZERO_ADDRESS)
    })

    it('lets the creator cancel after the join deadline expired (join timeout recovery)', async () => {
      const { game, creator, matchId } = await loadFixture(createdMatchFixture)
      await time.increase(DAY + 1n)
      await expect(game.connect(creator).cancelMatch(matchId))
        .to.emit(game, 'MatchCancelled')
        .withArgs(matchId)
      expect((await game.getMatch(matchId)).status).to.equal(MatchStatus.Cancelled)
    })

    it('lets the creator cancel after the opponent joined but before start', async () => {
      const { game, creator, matchId } = await loadFixture(joinedMatchFixture)
      await game.connect(creator).cancelMatch(matchId)
      expect((await game.getMatch(matchId)).status).to.equal(MatchStatus.Cancelled)
    })

    it('rejects cancellation from anyone but the creator', async () => {
      const { game, friend, outsider, matchId } = await loadFixture(createdMatchFixture)
      await expect(game.connect(friend).cancelMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'OnlyCreator',
      )
      await expect(game.connect(outsider).cancelMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'OnlyCreator',
      )
    })

    it('rejects cancelling a match twice', async () => {
      const { game, creator, matchId } = await loadFixture(createdMatchFixture)
      await game.connect(creator).cancelMatch(matchId)
      await expect(game.connect(creator).cancelMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'MatchAlreadyFinished',
      )
    })

    it('rejects cancelling a forfeited match', async () => {
      const { game, creator, matchId } = await loadFixture(joinedMatchFixture)
      await game.connect(creator).forfeit(matchId)
      await expect(game.connect(creator).cancelMatch(matchId)).to.be.revertedWithCustomError(
        game,
        'MatchAlreadyFinished',
      )
    })

    it('rejects cancelling a match that does not exist', async () => {
      const { game, creator } = await loadFixture(deployGameFixture)
      await expect(game.connect(creator).cancelMatch(7n)).to.be.revertedWithCustomError(
        game,
        'MatchNotFound',
      )
    })
  })

  describe('forfeit', () => {
    it('awards the win to the opponent when the creator forfeits', async () => {
      const { game, creator, friend, matchId } = await loadFixture(joinedMatchFixture)

      await expect(game.connect(creator).forfeit(matchId))
        .to.emit(game, 'MatchForfeited')
        .withArgs(matchId, creator.address, friend.address)

      const finishedAt = BigInt(await time.latest())
      const view = await game.getMatch(matchId)
      expect(view.status).to.equal(MatchStatus.Forfeited)
      expect(view.winner).to.equal(friend.address)
      expect(view.finishedAt).to.equal(finishedAt)
      expect(view.currentTurn).to.equal(ZERO_ADDRESS)
    })

    it('awards the win to the creator when the opponent forfeits', async () => {
      const { game, creator, friend, matchId } = await loadFixture(joinedMatchFixture)
      await expect(game.connect(friend).forfeit(matchId))
        .to.emit(game, 'MatchForfeited')
        .withArgs(matchId, friend.address, creator.address)
      expect((await game.getMatch(matchId)).winner).to.equal(creator.address)
    })

    it('rejects forfeiting before an opponent joined (cancel is the exit)', async () => {
      const { game, creator, matchId } = await loadFixture(createdMatchFixture)
      await expect(game.connect(creator).forfeit(matchId)).to.be.revertedWithCustomError(
        game,
        'InvalidMatchStatus',
      )
    })

    it('rejects forfeit from a wallet that is not a match player', async () => {
      const { game, outsider, matchId } = await loadFixture(joinedMatchFixture)
      await expect(game.connect(outsider).forfeit(matchId)).to.be.revertedWithCustomError(
        game,
        'NotMatchPlayer',
      )
    })

    it('rejects forfeiting an already finished match', async () => {
      const { game, creator, friend, matchId } = await loadFixture(joinedMatchFixture)
      await game.connect(creator).forfeit(matchId)
      await expect(game.connect(friend).forfeit(matchId)).to.be.revertedWithCustomError(
        game,
        'MatchAlreadyFinished',
      )
    })

    it('rejects forfeiting a cancelled match', async () => {
      const { game, creator, friend, matchId } = await loadFixture(joinedMatchFixture)
      await game.connect(creator).cancelMatch(matchId)
      await expect(game.connect(friend).forfeit(matchId)).to.be.revertedWithCustomError(
        game,
        'MatchAlreadyFinished',
      )
    })

    it('rejects forfeiting a match that does not exist', async () => {
      const { game, creator } = await loadFixture(deployGameFixture)
      await expect(game.connect(creator).forfeit(7n)).to.be.revertedWithCustomError(
        game,
        'MatchNotFound',
      )
    })
  })

  describe('claimTimeoutWin', () => {
    it('rejects claims from a wallet that is not a match player', async () => {
      const { game, outsider, matchId } = await loadFixture(joinedMatchFixture)
      await expect(
        game.connect(outsider).claimTimeoutWin(matchId),
      ).to.be.revertedWithCustomError(game, 'NotMatchPlayer')
    })

    it('rejects claims while waiting for the opponent (cancel is the exit)', async () => {
      const { game, creator, matchId } = await loadFixture(createdMatchFixture)
      await time.increase(DAY + 1n)
      await expect(
        game.connect(creator).claimTimeoutWin(matchId),
      ).to.be.revertedWithCustomError(game, 'NoTimeoutAvailable')
    })

    it('rejects claims before the placement deadline expired', async () => {
      const { game, creator, matchId } = await loadFixture(joinedMatchFixture)
      await expect(
        game.connect(creator).claimTimeoutWin(matchId),
      ).to.be.revertedWithCustomError(game, 'NoTimeoutAvailable')
    })

    it('rejects placement-timeout claims while no fleet was submitted', async () => {
      // Fleet submission ships with Phase 4; until then neither player can be
      // the eligible claimant, and the claim must fail closed.
      const { game, creator, friend, matchId } = await loadFixture(joinedMatchFixture)
      await time.increase(DAY + 1n)
      await expect(
        game.connect(creator).claimTimeoutWin(matchId),
      ).to.be.revertedWithCustomError(game, 'NotTimeoutClaimant')
      await expect(
        game.connect(friend).claimTimeoutWin(matchId),
      ).to.be.revertedWithCustomError(game, 'NotTimeoutClaimant')
    })

    it('rejects claims on a finished match', async () => {
      const { game, creator, friend, matchId } = await loadFixture(joinedMatchFixture)
      await game.connect(friend).forfeit(matchId)
      await expect(
        game.connect(creator).claimTimeoutWin(matchId),
      ).to.be.revertedWithCustomError(game, 'MatchAlreadyFinished')
    })

    it('rejects claims on a match that does not exist', async () => {
      const { game, creator } = await loadFixture(deployGameFixture)
      await expect(game.connect(creator).claimTimeoutWin(7n)).to.be.revertedWithCustomError(
        game,
        'MatchNotFound',
      )
    })

    describe('with harness-forced states', () => {
      it('awards a placement-timeout win to the only player who submitted', async () => {
        const { game, creator, friend, matchId } = await loadFixture(harnessJoinedFixture)
        await game.harnessSetFleetSubmitted(matchId, creator.address, true)
        await time.increase(DAY + 1n)

        await expect(game.connect(creator).claimTimeoutWin(matchId))
          .to.emit(game, 'TimeoutWinClaimed')
          .withArgs(matchId, creator.address, TimeoutReason.PlacementTimeout)

        const view = await game.getMatch(matchId)
        expect(view.status).to.equal(MatchStatus.Forfeited)
        expect(view.winner).to.equal(creator.address)
        expect(view.finishedAt).to.equal(BigInt(await time.latest()))
        expect(view.currentTurn).to.equal(ZERO_ADDRESS)
        // friend lost the claim window entirely
        await expect(
          game.connect(friend).claimTimeoutWin(matchId),
        ).to.be.revertedWithCustomError(game, 'MatchAlreadyFinished')
      })

      it('rejects a placement-timeout claim from the player who did not submit', async () => {
        const { game, creator, friend, matchId } = await loadFixture(harnessJoinedFixture)
        await game.harnessSetFleetSubmitted(matchId, creator.address, true)
        await time.increase(DAY + 1n)
        await expect(
          game.connect(friend).claimTimeoutWin(matchId),
        ).to.be.revertedWithCustomError(game, 'NotTimeoutClaimant')
      })

      it('rejects placement-timeout claims when both players submitted', async () => {
        const { game, creator, friend, matchId } = await loadFixture(harnessJoinedFixture)
        await game.harnessSetFleetSubmitted(matchId, creator.address, true)
        await game.harnessSetFleetSubmitted(matchId, friend.address, true)
        await time.increase(DAY + 1n)
        await expect(
          game.connect(creator).claimTimeoutWin(matchId),
        ).to.be.revertedWithCustomError(game, 'NotTimeoutClaimant')
      })

      it('awards a turn-timeout win to the player who is not on turn', async () => {
        const { game, creator, friend, matchId } = await loadFixture(harnessJoinedFixture)
        await game.harnessStartMatch(matchId)
        // invited friend is on turn first and stalls
        await time.increase(DAY + 1n)

        await expect(game.connect(creator).claimTimeoutWin(matchId))
          .to.emit(game, 'TimeoutWinClaimed')
          .withArgs(matchId, creator.address, TimeoutReason.TurnTimeout)

        const view = await game.getMatch(matchId)
        expect(view.status).to.equal(MatchStatus.Forfeited)
        expect(view.winner).to.equal(creator.address)
      })

      it('rejects a turn-timeout claim from the stalled player on turn', async () => {
        const { game, friend, matchId } = await loadFixture(harnessJoinedFixture)
        await game.harnessStartMatch(matchId)
        await time.increase(DAY + 1n)
        await expect(
          game.connect(friend).claimTimeoutWin(matchId),
        ).to.be.revertedWithCustomError(game, 'NotTimeoutClaimant')
      })

      it('rejects turn-timeout claims before the turn deadline', async () => {
        const { game, creator, matchId } = await loadFixture(harnessJoinedFixture)
        await game.harnessStartMatch(matchId)
        await expect(
          game.connect(creator).claimTimeoutWin(matchId),
        ).to.be.revertedWithCustomError(game, 'NoTimeoutAvailable')
      })

      it('rejects cancellation once the match is in progress', async () => {
        const { game, creator, matchId } = await loadFixture(harnessJoinedFixture)
        await game.harnessStartMatch(matchId)
        await expect(game.connect(creator).cancelMatch(matchId)).to.be.revertedWithCustomError(
          game,
          'CannotCancelStartedMatch',
        )
      })

      it('still allows forfeiting a match in progress', async () => {
        const { game, creator, friend, matchId } = await loadFixture(harnessJoinedFixture)
        await game.harnessStartMatch(matchId)
        await expect(game.connect(creator).forfeit(matchId))
          .to.emit(game, 'MatchForfeited')
          .withArgs(matchId, creator.address, friend.address)
        expect((await game.getMatch(matchId)).status).to.equal(MatchStatus.Forfeited)
      })
    })
  })

  describe('reads', () => {
    it('rejects reads for a match that does not exist', async () => {
      const { game } = await loadFixture(deployGameFixture)
      await expect(game.getMatch(1n)).to.be.revertedWithCustomError(game, 'MatchNotFound')
      await expect(game.getPlayers(1n)).to.be.revertedWithCustomError(game, 'MatchNotFound')
    })

    it('paginates player match history oldest first', async () => {
      const { game, creator, friend, outsider } = await loadFixture(deployGameFixture)
      await game.connect(creator).createMatch(friend.address)
      await game.connect(creator).createMatch(outsider.address)
      await game.connect(creator).createMatch(friend.address)

      expect(await game.getPlayerMatchCount(creator.address)).to.equal(3n)
      expect(await game.getPlayerMatches(creator.address, 0, 2)).to.deep.equal([1n, 2n])
      expect(await game.getPlayerMatches(creator.address, 2, 2)).to.deep.equal([3n])
      expect(await game.getPlayerMatches(creator.address, 3, 2)).to.deep.equal([])
      expect(await game.getPlayerMatches(creator.address, 0, 50)).to.deep.equal([1n, 2n, 3n])
    })

    it('tracks joined matches in the opponent history too', async () => {
      const { game, friend, matchId } = await loadFixture(joinedMatchFixture)
      expect(await game.getPlayerMatches(friend.address, 0, 10)).to.deep.equal([matchId])
    })

    it('returns an empty history for an unknown player', async () => {
      const { game, outsider } = await loadFixture(deployGameFixture)
      expect(await game.getPlayerMatchCount(outsider.address)).to.equal(0n)
      expect(await game.getPlayerMatches(outsider.address, 0, 10)).to.deep.equal([])
    })

    it('rejects pagination limits of zero or above the cap', async () => {
      const { game, creator } = await loadFixture(deployGameFixture)
      await expect(
        game.getPlayerMatches(creator.address, 0, 0),
      ).to.be.revertedWithCustomError(game, 'InvalidPaginationLimit')
      await expect(
        game.getPlayerMatches(creator.address, 0, 51),
      ).to.be.revertedWithCustomError(game, 'InvalidPaginationLimit')
    })
  })
})
