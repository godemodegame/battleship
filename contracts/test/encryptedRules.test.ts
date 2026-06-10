import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers'
import {
  VALID_FLEET,
  VALID_FLEET_ALT,
  FLEET_WITH_GAP,
  FLEET_OUT_OF_RANGE,
  FLEET_DIAGONAL,
  FLEET_ROW_WRAP,
  encryptFleetAs,
  advancePastDecryptDelay,
  pinNextDecryptDelay,
  startEncryptedMatch,
  playShot,
  parseEvent,
  deployEncryptedMatchFixtureBase,
} from './helpers/encryptedFleet'

// Phase 4 encrypted rules (GAME-406..410): placement validation, the
// encrypted shot pipeline, asynchronous finalization, and the adversarial
// paths around it. Runs against the mock CoFHE environment.

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

const PlacementStatus = {
  None: 0n,
  NotSubmitted: 1n,
  Submitted: 2n,
  ResolvingValidation: 3n,
  Valid: 4n,
  Invalid: 5n,
} as const

const ShotResult = {
  None: 0n,
  Miss: 1n,
  Hit: 2n,
  Sunk: 3n,
  Win: 4n,
} as const

const TimeoutReason = { PlacementTimeout: 1n } as const

const DAY = 24n * 60n * 60n

// The mock task manager address where the CoFHE network would post decrypt
// results; used to prove the result channel rejects unauthorized writers.
const TASK_MANAGER_ADDRESS = '0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9'

async function joinedFixture() {
  return deployEncryptedMatchFixtureBase()
}

async function bothSubmittedFixture() {
  const base = await deployEncryptedMatchFixtureBase()
  const creatorInput = await encryptFleetAs(base.creator, VALID_FLEET)
  await (await base.game.connect(base.creator).submitFleet(base.matchId, creatorInput)).wait()
  const opponentInput = await encryptFleetAs(base.opponent, VALID_FLEET_ALT)
  await (await base.game.connect(base.opponent).submitFleet(base.matchId, opponentInput)).wait()
  return base
}

async function activeMatchFixture() {
  const base = await deployEncryptedMatchFixtureBase()
  await startEncryptedMatch(base.game, base.matchId, base.creator, base.opponent)
  return base
}

describe('BattleshipGame encrypted rules (Phase 4)', () => {
  describe('fleet submission', () => {
    it('publishes ship lengths matching the frozen 20-cell fleet', async () => {
      const { game } = await loadFixture(joinedFixture)
      const lengths = (await game.getShipLengths()).map((value: bigint) => Number(value))
      expect(lengths).to.deep.equal([4, 3, 3, 2, 2, 2, 1, 1, 1, 1])
      expect(lengths.reduce((sum: number, len: number) => sum + len, 0)).to.equal(20)
    })

    it('accepts a fleet, requests validation, and moves to ValidatingPlacement', async () => {
      const { game, creator, matchId } = await loadFixture(joinedFixture)
      const input = await encryptFleetAs(creator, VALID_FLEET)

      const tx = await game.connect(creator).submitFleet(matchId, input)
      await expect(tx).to.emit(game, 'FleetSubmitted').withArgs(matchId, creator.address)
      await expect(tx).to.emit(game, 'FleetValidationRequested')

      const match = await game.getMatch(matchId)
      expect(match.status).to.equal(MatchStatus.ValidatingPlacement)

      const [creatorView] = await game.getPlayers(matchId)
      expect(creatorView.placementStatus).to.equal(PlacementStatus.ResolvingValidation)
      expect(creatorView.fleetSubmitted).to.equal(true)
      expect(creatorView.fleetValid).to.equal(false)
    })

    it('rejects submission from a non-player', async () => {
      const { game, outsider, matchId } = await loadFixture(joinedFixture)
      const input = await encryptFleetAs(outsider, VALID_FLEET)
      await expect(game.connect(outsider).submitFleet(matchId, input))
        .to.be.revertedWithCustomError(game, 'NotMatchPlayer')
    })

    it('rejects submission before the opponent joins', async () => {
      const [creator, opponent] = await ethers.getSigners()
      const factory = await ethers.getContractFactory('BattleshipGame')
      const game = await factory.deploy()
      await (await game.connect(creator).createMatch(opponent.address)).wait()

      const input = await encryptFleetAs(creator, VALID_FLEET)
      await expect(game.connect(creator).submitFleet(1n, input))
        .to.be.revertedWithCustomError(game, 'InvalidMatchStatus')
    })

    it('rejects resubmission while validation is pending', async () => {
      const { game, creator, matchId } = await loadFixture(joinedFixture)
      const input = await encryptFleetAs(creator, VALID_FLEET)
      await (await game.connect(creator).submitFleet(matchId, input)).wait()

      const second = await encryptFleetAs(creator, VALID_FLEET)
      await expect(game.connect(creator).submitFleet(matchId, second))
        .to.be.revertedWithCustomError(game, 'PlacementValidationPending')
    })

    it('rejects resubmission after the fleet was validated', async () => {
      const { game, creator, matchId } = await loadFixture(joinedFixture)
      const input = await encryptFleetAs(creator, VALID_FLEET)
      await (await game.connect(creator).submitFleet(matchId, input)).wait()
      await advancePastDecryptDelay()
      await (await game.finalizeFleetValidation(matchId, creator.address)).wait()

      const second = await encryptFleetAs(creator, VALID_FLEET)
      await expect(game.connect(creator).submitFleet(matchId, second))
        .to.be.revertedWithCustomError(game, 'FleetAlreadySubmitted')
    })

    // Cross-account encrypted-input replay (submitting ciphertexts encrypted
    // for another wallet) is rejected by the CoFHE zk verifier on real
    // networks: the input proof binds the ciphertext to the sender account
    // and chain id. The mock environment deploys with input verification
    // explicitly disabled (MockTaskManager.initialize sets verifierSigner to
    // zero, and the cofhejs mock signature format does not match the
    // verifier's raw-ECDSA recovery), so this protocol guarantee cannot be
    // exercised under mocks and is covered by the Arbitrum Sepolia testnet
    // regression (GAME-906) instead. docs/cofhe-feasibility-results.md
    // records this mock limitation.
  })

  describe('fleet validation finalization', () => {
    it('validates two encrypted fleets and starts the match with the invited opponent first', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(bothSubmittedFixture)
      await advancePastDecryptDelay()

      await expect(game.finalizeFleetValidation(matchId, creator.address))
        .to.emit(game, 'FleetValidated')
        .withArgs(matchId, creator.address, true)

      const startTx = game.finalizeFleetValidation(matchId, opponent.address)
      await expect(startTx).to.emit(game, 'FleetValidated').withArgs(matchId, opponent.address, true)
      await expect(startTx).to.emit(game, 'MatchStarted').withArgs(matchId, opponent.address)
      await expect(startTx).to.emit(game, 'TurnChanged').withArgs(matchId, opponent.address)

      const match = await game.getMatch(matchId)
      expect(match.status).to.equal(MatchStatus.InProgress)
      expect(match.currentTurn).to.equal(opponent.address)
      expect(match.startedAt).to.be.greaterThan(0n)
      expect(match.timeoutState.placementDeadline).to.equal(0n)
      expect(match.timeoutState.turnDeadline).to.be.greaterThan(0n)
    })

    it('reverts when the decrypt result is not ready yet', async () => {
      const { game, creator, matchId } = await loadFixture(joinedFixture)
      const input = await encryptFleetAs(creator, VALID_FLEET)
      await pinNextDecryptDelay()
      await (await game.connect(creator).submitFleet(matchId, input)).wait()

      await expect(game.finalizeFleetValidation(matchId, creator.address))
        .to.be.revertedWithCustomError(game, 'DecryptionResultNotReady')
    })

    it('reverts without a pending validation', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(joinedFixture)
      const input = await encryptFleetAs(creator, VALID_FLEET)
      await (await game.connect(creator).submitFleet(matchId, input)).wait()

      await expect(game.finalizeFleetValidation(matchId, opponent.address))
        .to.be.revertedWithCustomError(game, 'NoPendingPlacementValidation')
    })

    it('reverts for an address that is not a match player', async () => {
      const { game, creator, outsider, matchId } = await loadFixture(joinedFixture)
      const input = await encryptFleetAs(creator, VALID_FLEET)
      await (await game.connect(creator).submitFleet(matchId, input)).wait()

      await expect(game.finalizeFleetValidation(matchId, outsider.address))
        .to.be.revertedWithCustomError(game, 'NotMatchPlayerAddress')
    })

    const invalidFleets: Array<[string, readonly number[]]> = [
      ['a non-contiguous ship', FLEET_WITH_GAP],
      ['an out-of-range cell', FLEET_OUT_OF_RANGE],
      ['a diagonal ship', FLEET_DIAGONAL],
      ['a horizontal ship wrapping across rows', FLEET_ROW_WRAP],
    ]

    for (const [label, fleet] of invalidFleets) {
      it(`rejects ${label} through encrypted validation`, async () => {
        const { game, creator, matchId } = await loadFixture(joinedFixture)
        const input = await encryptFleetAs(creator, fleet)
        await (await game.connect(creator).submitFleet(matchId, input)).wait()
        await advancePastDecryptDelay()

        await expect(game.finalizeFleetValidation(matchId, creator.address))
          .to.emit(game, 'FleetValidated')
          .withArgs(matchId, creator.address, false)

        const [creatorView] = await game.getPlayers(matchId)
        expect(creatorView.placementStatus).to.equal(PlacementStatus.Invalid)
        expect(creatorView.fleetValid).to.equal(false)
        expect(creatorView.fleetSubmitted).to.equal(false)
      })
    }

    it('lets an invalid fleet be resubmitted, with a fresh validity handle (stale results cannot finalize)', async () => {
      const { game, creator, matchId } = await loadFixture(joinedFixture)

      const badInput = await encryptFleetAs(creator, FLEET_WITH_GAP)
      const badTx = await game.connect(creator).submitFleet(matchId, badInput)
      const badReceipt = await badTx.wait()
      const firstRequest = parseEvent(game, badReceipt!, 'FleetValidationRequested')

      await advancePastDecryptDelay()
      await (await game.finalizeFleetValidation(matchId, creator.address)).wait()

      const goodInput = await encryptFleetAs(creator, VALID_FLEET)
      await pinNextDecryptDelay()
      const goodTx = await game.connect(creator).submitFleet(matchId, goodInput)
      const goodReceipt = await goodTx.wait()
      const secondRequest = parseEvent(game, goodReceipt!, 'FleetValidationRequested')

      // The resubmission gets a fresh ciphertext handle: the already-decrypted
      // result of the first (invalid) submission cannot finalize it.
      expect(secondRequest.ctHash).to.not.equal(firstRequest.ctHash)
      await expect(game.finalizeFleetValidation(matchId, creator.address))
        .to.be.revertedWithCustomError(game, 'DecryptionResultNotReady')

      await advancePastDecryptDelay()
      await expect(game.finalizeFleetValidation(matchId, creator.address))
        .to.emit(game, 'FleetValidated')
        .withArgs(matchId, creator.address, true)
    })

    it('reverts duplicate finalization', async () => {
      const { game, creator, matchId } = await loadFixture(joinedFixture)
      const input = await encryptFleetAs(creator, VALID_FLEET)
      await (await game.connect(creator).submitFleet(matchId, input)).wait()
      await advancePastDecryptDelay()
      await (await game.finalizeFleetValidation(matchId, creator.address)).wait()

      await expect(game.finalizeFleetValidation(matchId, creator.address))
        .to.be.revertedWithCustomError(game, 'NoPendingPlacementValidation')
    })

    it('supports a permissionless validation retry that re-requests the same handle', async () => {
      const { game, creator, outsider, matchId } = await loadFixture(joinedFixture)
      const input = await encryptFleetAs(creator, VALID_FLEET)
      const submitReceipt = await (await game.connect(creator).submitFleet(matchId, input)).wait()
      const requested = parseEvent(game, submitReceipt!, 'FleetValidationRequested')

      await expect(game.connect(outsider).retryFleetValidation(matchId, creator.address))
        .to.emit(game, 'FleetValidationRequested')
        .withArgs(matchId, creator.address, requested.ctHash)

      await advancePastDecryptDelay()
      await expect(game.finalizeFleetValidation(matchId, creator.address))
        .to.emit(game, 'FleetValidated')
        .withArgs(matchId, creator.address, true)
    })

    it('keeps cancelMatch available during validation', async () => {
      const { game, creator, matchId } = await loadFixture(bothSubmittedFixture)
      await expect(game.connect(creator).cancelMatch(matchId))
        .to.emit(game, 'MatchCancelled')
        .withArgs(matchId)

      await advancePastDecryptDelay()
      await expect(game.finalizeFleetValidation(matchId, creator.address))
        .to.be.revertedWithCustomError(game, 'InvalidMatchStatus')
    })

    it('supports a placement timeout claim against an absent opponent with the real fleet flow', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(joinedFixture)
      const input = await encryptFleetAs(creator, VALID_FLEET)
      await (await game.connect(creator).submitFleet(matchId, input)).wait()
      await advancePastDecryptDelay()
      await (await game.finalizeFleetValidation(matchId, creator.address)).wait()

      await time.increase(DAY + 1n)
      await expect(game.connect(creator).claimTimeoutWin(matchId))
        .to.emit(game, 'TimeoutWinClaimed')
        .withArgs(matchId, creator.address, TimeoutReason.PlacementTimeout)

      const match = await game.getMatch(matchId)
      expect(match.status).to.equal(MatchStatus.Forfeited)
      expect(match.winner).to.equal(creator.address)
      void opponent
    })
  })

  describe('attack and shot finalization', () => {
    it('resolves a miss, reveals it publicly, and passes the turn', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(activeMatchFixture)

      // Cell 99 is water in VALID_FLEET (the creator defends).
      const attackTx = await game.connect(opponent).attack(matchId, 99)
      await expect(attackTx)
        .to.emit(game, 'ShotSubmitted')
        .withArgs(matchId, 1n, opponent.address, creator.address, 99)
      await expect(attackTx).to.emit(game, 'ShotResolutionRequested')

      let match = await game.getMatch(matchId)
      expect(match.status).to.equal(MatchStatus.ResolvingShot)
      expect(match.pendingMoveId).to.equal(1n)

      const pending = await game.getPendingShot(matchId)
      expect(pending.exists).to.equal(true)
      expect(pending.moveId).to.equal(1n)
      expect(pending.attacker).to.equal(opponent.address)
      expect(pending.cellIndex).to.equal(99)

      await advancePastDecryptDelay()
      const finalizeTx = game.finalizeAttack(matchId, 1n)
      await expect(finalizeTx)
        .to.emit(game, 'ShotResolved')
        .withArgs(matchId, 1n, ShotResult.Miss, 0)
      await expect(finalizeTx).to.emit(game, 'TurnChanged').withArgs(matchId, creator.address)

      match = await game.getMatch(matchId)
      expect(match.status).to.equal(MatchStatus.InProgress)
      expect(match.currentTurn).to.equal(creator.address)
      expect(match.pendingMoveId).to.equal(0n)

      const [creatorView] = await game.getPlayers(matchId)
      expect(creatorView.publicBoard.attackedMask).to.equal(1n << 99n)
      expect(creatorView.publicBoard.missMask).to.equal(1n << 99n)
      expect(creatorView.publicBoard.hitMask).to.equal(0n)

      const move = await game.getMove(matchId, 1n)
      expect(move.result).to.equal(ShotResult.Miss)
      expect(move.finalized).to.equal(true)
      expect(move.sunkShipId).to.equal(0)
    })

    it('keeps the attacker on turn after a hit and marks the hit mask', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(activeMatchFixture)

      // Cell 0 is the creator's carrier bow.
      const shot = await playShot(game, matchId, opponent, 0)
      expect(shot.result).to.equal(ShotResult.Hit)
      expect(shot.sunkShipId).to.equal(0n)

      const match = await game.getMatch(matchId)
      expect(match.currentTurn).to.equal(opponent.address)

      const [creatorView] = await game.getPlayers(matchId)
      expect(creatorView.publicBoard.hitMask).to.equal(1n)
      expect(creatorView.publicBoard.missMask).to.equal(0n)
      expect(creatorView.publicBoard.sunkMask).to.equal(0n)
      void creator
    })

    it('reports Sunk with the public ship id on the final segment of a ship', async () => {
      const { game, opponent, matchId } = await loadFixture(activeMatchFixture)

      // Patrol C of VALID_FLEET is the single cell 65 (ship id 9).
      const shot = await playShot(game, matchId, opponent, 65)
      expect(shot.result).to.equal(ShotResult.Sunk)
      expect(shot.sunkShipId).to.equal(9n)

      const [creatorView] = await game.getPlayers(matchId)
      expect(creatorView.publicBoard.sunkMask).to.equal(1n << 65n)
      expect(creatorView.publicBoard.hitMask).to.equal(1n << 65n)
    })

    it('enforces turn order, cell bounds, and single-attack-per-cell', async () => {
      const { game, creator, opponent, outsider, matchId } = await loadFixture(activeMatchFixture)

      await expect(game.connect(creator).attack(matchId, 0))
        .to.be.revertedWithCustomError(game, 'NotYourTurn')
      await expect(game.connect(outsider).attack(matchId, 0))
        .to.be.revertedWithCustomError(game, 'NotYourTurn')
      await expect(game.connect(opponent).attack(matchId, 100))
        .to.be.revertedWithCustomError(game, 'InvalidCellIndex')

      await playShot(game, matchId, opponent, 0)
      await expect(game.connect(opponent).attack(matchId, 0))
        .to.be.revertedWithCustomError(game, 'CellAlreadyAttacked')
    })

    it('blocks a second attack while a shot is resolving', async () => {
      const { game, opponent, matchId } = await loadFixture(activeMatchFixture)
      await (await game.connect(opponent).attack(matchId, 0)).wait()

      await expect(game.connect(opponent).attack(matchId, 1))
        .to.be.revertedWithCustomError(game, 'InvalidMatchStatus')
    })

    it('reverts finalization before the decrypt results are ready', async () => {
      const { game, opponent, matchId } = await loadFixture(activeMatchFixture)
      await pinNextDecryptDelay()
      await (await game.connect(opponent).attack(matchId, 0)).wait()

      await expect(game.finalizeAttack(matchId, 1n))
        .to.be.revertedWithCustomError(game, 'DecryptionResultNotReady')
    })

    it('rejects a stale or wrong move id during finalization', async () => {
      const { game, opponent, matchId } = await loadFixture(activeMatchFixture)
      await (await game.connect(opponent).attack(matchId, 0)).wait()
      await advancePastDecryptDelay()

      await expect(game.finalizeAttack(matchId, 0n))
        .to.be.revertedWithCustomError(game, 'InvalidMoveId')
      await expect(game.finalizeAttack(matchId, 2n))
        .to.be.revertedWithCustomError(game, 'InvalidMoveId')
    })

    it('rejects duplicate finalization of the same move (replay)', async () => {
      const { game, opponent, matchId } = await loadFixture(activeMatchFixture)
      const shot = await playShot(game, matchId, opponent, 0)

      await expect(game.finalizeAttack(matchId, shot.moveId))
        .to.be.revertedWithCustomError(game, 'InvalidMatchStatus')
    })

    it('rejects forged decrypt results: only the network aggregator can post plaintexts', async () => {
      const { game, opponent, outsider, matchId } = await loadFixture(activeMatchFixture)
      const attackReceipt = await (await game.connect(opponent).attack(matchId, 0)).wait()
      const requested = parseEvent(game, attackReceipt!, 'ShotResolutionRequested')

      const taskManager = new ethers.Contract(
        TASK_MANAGER_ADDRESS,
        ['function handleDecryptResult(uint256 ctHash, uint256 result, address[] requestors)'],
        outsider,
      )
      await expect(
        taskManager.handleDecryptResult(requested.resultCtHash, ShotResult.Win, []),
      ).to.be.reverted
    })

    it('supports a permissionless shot-resolution retry', async () => {
      const { game, opponent, outsider, matchId } = await loadFixture(activeMatchFixture)
      const attackReceipt = await (await game.connect(opponent).attack(matchId, 0)).wait()
      const requested = parseEvent(game, attackReceipt!, 'ShotResolutionRequested')

      await expect(game.connect(outsider).retryShotResolution(matchId))
        .to.emit(game, 'ShotResolutionRequested')
        .withArgs(matchId, 1n, requested.resultCtHash, requested.sunkShipCtHash)

      await advancePastDecryptDelay()
      await expect(game.finalizeAttack(matchId, 1n))
        .to.emit(game, 'ShotResolved')
        .withArgs(matchId, 1n, ShotResult.Hit, 0)
    })

    it('lets a player forfeit during shot resolution, closing finalization', async () => {
      const { game, creator, opponent, matchId } = await loadFixture(activeMatchFixture)
      await (await game.connect(opponent).attack(matchId, 0)).wait()

      await expect(game.connect(creator).forfeit(matchId))
        .to.emit(game, 'MatchForfeited')
        .withArgs(matchId, creator.address, opponent.address)

      await advancePastDecryptDelay()
      await expect(game.finalizeAttack(matchId, 1n))
        .to.be.revertedWithCustomError(game, 'InvalidMatchStatus')
    })

    it('reverts attacks and reads for moves that do not exist', async () => {
      const { game, matchId } = await loadFixture(activeMatchFixture)
      await expect(game.getMove(matchId, 1n)).to.be.revertedWithCustomError(game, 'MoveNotFound')
      await expect(game.getMove(matchId, 0n)).to.be.revertedWithCustomError(game, 'MoveNotFound')
    })

    it('exposes no fleet data through public reads while a match runs', async () => {
      const { game, opponent, matchId } = await loadFixture(activeMatchFixture)
      await playShot(game, matchId, opponent, 0)

      // Every public read surface: match metadata, player views, moves,
      // pending shot. None of them carries fleet segments or health; the
      // pending shot exposes only result handles, never fleet handles.
      const match = await game.getMatch(matchId)
      expect(Object.keys(match.toObject())).to.deep.equal([
        'id', 'matchType', 'status', 'creator', 'opponent', 'invitedOpponent',
        'currentTurn', 'winner', 'createdAt', 'joinedAt', 'startedAt',
        'finishedAt', 'lastActionAt', 'moveCount', 'pendingMoveId', 'timeoutState',
      ])
      const [creatorView, opponentView] = await game.getPlayers(matchId)
      for (const view of [creatorView, opponentView]) {
        expect(Object.keys(view.toObject())).to.deep.equal([
          'player', 'joined', 'placementStatus', 'fleetSubmitted', 'fleetValid', 'publicBoard',
        ])
      }
      const move = await game.getMove(matchId, 1n)
      expect(Object.keys(move.toObject())).to.deep.equal([
        'moveId', 'attacker', 'defender', 'cellIndex', 'result', 'sunkShipId',
        'submittedAt', 'resolvedAt', 'finalized',
      ])
    })
  })

  describe('full match (Miss, Hit, Sunk, Win equivalence with the plaintext rules)', () => {
    it('plays a complete match where every result matches the public rules', async function () {
      this.timeout(600_000)
      const { game, creator, opponent, matchId } = await loadFixture(activeMatchFixture)

      // The opponent (first turn) sinks the creator's whole fleet. Hits keep
      // the turn, so the defender never moves. Expected per-cell results are
      // derived from VALID_FLEET's public layout.
      const expected: Array<[number, bigint, bigint]> = [
        [0, ShotResult.Hit, 0n],
        [1, ShotResult.Hit, 0n],
        [2, ShotResult.Hit, 0n],
        [3, ShotResult.Sunk, 1n],
        [20, ShotResult.Hit, 0n],
        [21, ShotResult.Hit, 0n],
        [22, ShotResult.Sunk, 2n],
        [40, ShotResult.Hit, 0n],
        [41, ShotResult.Hit, 0n],
        [42, ShotResult.Sunk, 3n],
        [60, ShotResult.Hit, 0n],
        [61, ShotResult.Sunk, 4n],
        [80, ShotResult.Hit, 0n],
        [81, ShotResult.Sunk, 5n],
        [5, ShotResult.Hit, 0n],
        [6, ShotResult.Sunk, 6n],
        [25, ShotResult.Sunk, 7n],
        [45, ShotResult.Sunk, 8n],
        [65, ShotResult.Sunk, 9n],
        [85, ShotResult.Win, 10n],
      ]

      for (const [cell, expectedResult, expectedSunkShip] of expected) {
        const shot = await playShot(game, matchId, opponent, cell)
        expect(shot.result, `cell ${cell}`).to.equal(expectedResult)
        expect(shot.sunkShipId, `cell ${cell} sunk ship`).to.equal(expectedSunkShip)
      }

      const match = await game.getMatch(matchId)
      expect(match.status).to.equal(MatchStatus.Finished)
      expect(match.winner).to.equal(opponent.address)
      expect(match.currentTurn).to.equal(ethers.ZeroAddress)
      expect(match.moveCount).to.equal(20n)

      const [creatorView] = await game.getPlayers(matchId)
      const fleetMask = VALID_FLEET.reduce((mask, cell) => mask | (1n << BigInt(cell)), 0n)
      expect(creatorView.publicBoard.hitMask).to.equal(fleetMask)
      expect(creatorView.publicBoard.missMask).to.equal(0n)

      // Move history reconstructs the whole match.
      const history = await game.getMoveHistory(matchId, 0, 50)
      expect(history).to.have.length(20)
      expect(history[19].result).to.equal(ShotResult.Win)
      expect(history[19].finalized).to.equal(true)

      // No further play after the terminal state.
      await expect(game.connect(creator).attack(matchId, 99))
        .to.be.revertedWithCustomError(game, 'InvalidMatchStatus')
    })
  })
})
