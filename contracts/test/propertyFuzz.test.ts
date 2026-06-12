import { expect } from 'chai'
import { ethers } from 'hardhat'
import {
  SHIP_LENGTHS,
  encryptFleetAs,
  makeShotReady,
  makeValidationReady,
  parseEvent,
} from './helpers/encryptedFleet'

// GAME-902: property/fuzz tests. A seeded PRNG generates random fleets and
// random battles; every contract observation is checked against an
// independent plaintext model of the rules:
//   - random structurally-valid fleets must validate as valid;
//   - random fleets broken by one mutation class (range, gap, diagonal,
//     row wrap, descending order, duplicate cell) must validate as invalid;
//   - a random full match must agree with the plaintext model on every shot
//     result, sunk ship id, turn handover, and public mask, and on the
//     terminal win.
// The seed is fixed for reproducibility and printed on failure.

const SEED = 0x9_0_2

const ShotResult = { None: 0n, Miss: 1n, Hit: 2n, Sunk: 3n, Win: 4n } as const
const MatchStatus = { InProgress: 5n, Finished: 7n } as const

/** Deterministic 32-bit PRNG (mulberry32). */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rng = () => number

function randInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive)
}

function pick<T>(rng: Rng, values: readonly T[]): T {
  return values[randInt(rng, values.length)]
}

/**
 * Random non-overlapping fleet in the frozen submission order. Cells per ship
 * are ascending (+1 horizontal, +10 vertical), which is the contract's
 * contiguity requirement.
 */
function randomValidFleet(rng: Rng): number[] {
  const occupied = new Set<number>()
  const segments: number[] = []
  for (const length of SHIP_LENGTHS) {
    for (;;) {
      const horizontal = length === 1 || rng() < 0.5
      const row = randInt(rng, horizontal ? 10 : 11 - length)
      const col = randInt(rng, horizontal ? 11 - length : 10)
      const step = horizontal ? 1 : 10
      const start = row * 10 + col
      const cells = Array.from({ length }, (_, i) => start + i * step)
      if (cells.some((cell) => occupied.has(cell))) continue
      cells.forEach((cell) => occupied.add(cell))
      segments.push(...cells)
      break
    }
  }
  return segments
}

/** Offsets of each ship's segment block in the flat 20-cell array. */
const SHIP_OFFSETS = SHIP_LENGTHS.reduce<number[]>((offsets, _, index) => {
  offsets.push(index === 0 ? 0 : offsets[index - 1] + SHIP_LENGTHS[index - 1])
  return offsets
}, [])

const MULTI_CELL_SHIPS = SHIP_LENGTHS.map((length, ship) => ({ ship, length })).filter(
  ({ length }) => length > 1,
)

/** One mutation class applied to a fresh random valid fleet. */
const MUTATIONS: Array<{ label: string; mutate(rng: Rng, fleet: number[]): void }> = [
  {
    label: 'segment out of board range',
    mutate(rng, fleet) {
      fleet[randInt(rng, fleet.length)] = 100 + randInt(rng, 156)
    },
  },
  {
    label: 'gap inside a ship',
    mutate(rng, fleet) {
      // Push a multi-cell ship's last segment one step further out, creating
      // a delta of 2 (or 20) that fails both straightness equalities.
      const { ship, length } = pick(rng, MULTI_CELL_SHIPS)
      const last = SHIP_OFFSETS[ship] + length - 1
      const step = fleet[last] - fleet[last - 1] // 1 or 10
      fleet[last] = (fleet[last] + step) % 256
    },
  },
  {
    label: 'diagonal ship',
    mutate(rng, fleet) {
      const { ship, length } = pick(rng, MULTI_CELL_SHIPS)
      const start = randInt(rng, 10 - length) * 10 + randInt(rng, 10 - length)
      for (let i = 0; i < length; i++) {
        fleet[SHIP_OFFSETS[ship] + i] = start + i * 11
      }
    },
  },
  {
    label: 'horizontal ship wrapping across a row',
    mutate(rng, fleet) {
      const { ship, length } = pick(rng, MULTI_CELL_SHIPS)
      // First column too far right for the length: cells stay contiguous
      // (+1) but cross the row edge, which the column bound must reject.
      const row = randInt(rng, 9)
      const col = 10 - length + 1 + randInt(rng, length - 1)
      for (let i = 0; i < length; i++) {
        fleet[SHIP_OFFSETS[ship] + i] = row * 10 + col + i
      }
    },
  },
  {
    label: 'descending segment order',
    mutate(rng, fleet) {
      const { ship, length } = pick(rng, MULTI_CELL_SHIPS)
      const block = fleet.slice(SHIP_OFFSETS[ship], SHIP_OFFSETS[ship] + length).reverse()
      block.forEach((cell, i) => {
        fleet[SHIP_OFFSETS[ship] + i] = cell
      })
    },
  },
  {
    label: 'duplicate cell inside a ship',
    mutate(rng, fleet) {
      const { ship } = pick(rng, MULTI_CELL_SHIPS)
      fleet[SHIP_OFFSETS[ship] + 1] = fleet[SHIP_OFFSETS[ship]]
    },
  },
]

function popcount(mask: bigint): number {
  let count = 0
  for (let m = mask; m !== 0n; m >>= 1n) {
    if (m & 1n) count += 1
  }
  return count
}

/** Plaintext rules model used as the oracle for the random match. */
class FleetModel {
  readonly ships: number[][]
  readonly cellToShip = new Map<number, number>()
  readonly health: number[]

  constructor(segments: readonly number[]) {
    this.ships = SHIP_LENGTHS.map((length, ship) =>
      segments.slice(SHIP_OFFSETS[ship], SHIP_OFFSETS[ship] + length),
    )
    this.ships.forEach((cells, ship) =>
      cells.forEach((cell) => this.cellToShip.set(cell, ship)),
    )
    this.health = SHIP_LENGTHS.map((length) => length)
  }

  shoot(cell: number): { result: bigint; sunkShipId: bigint } {
    const ship = this.cellToShip.get(cell)
    if (ship === undefined) return { result: ShotResult.Miss, sunkShipId: 0n }
    this.health[ship] -= 1
    if (this.health[ship] > 0) return { result: ShotResult.Hit, sunkShipId: 0n }
    const allDead = this.health.every((h) => h === 0)
    return {
      result: allDead ? ShotResult.Win : ShotResult.Sunk,
      sunkShipId: BigInt(ship + 1),
    }
  }

  remainingCells(attacked: Set<number>): number[] {
    return [...this.cellToShip.keys()].filter((cell) => !attacked.has(cell))
  }
}

describe('BattleshipGame property fuzz (GAME-902)', function () {
  this.timeout(900_000)

  it(`accepts randomly generated valid fleets (seed ${SEED})`, async () => {
    const rng = mulberry32(SEED)
    const [creator, opponent] = await ethers.getSigners()
    const factory = await ethers.getContractFactory('BattleshipGame')
    const game = await factory.deploy()
    await game.waitForDeployment()

    for (let round = 0; round < 4; round++) {
      const fleet = randomValidFleet(rng)
      const matchId = BigInt(round + 1)
      await (await game.connect(creator).createMatch(opponent.address)).wait()
      await (await game.connect(opponent).joinMatch(matchId)).wait()
      const input = await encryptFleetAs(creator, fleet)
      await (await game.connect(creator).submitFleet(matchId, input)).wait()
      await makeValidationReady(game, matchId, creator)
      await expect(
        game.finalizeFleetValidation(matchId, creator.address),
        `random valid fleet round ${round}: [${fleet.join(',')}]`,
      )
        .to.emit(game, 'FleetValidated')
        .withArgs(matchId, creator.address, true)
    }
  })

  it(`rejects every mutation class applied to random fleets (seed ${SEED})`, async () => {
    const rng = mulberry32(SEED + 1)
    const [creator, opponent] = await ethers.getSigners()
    const factory = await ethers.getContractFactory('BattleshipGame')
    const game = await factory.deploy()
    await game.waitForDeployment()

    for (let round = 0; round < MUTATIONS.length; round++) {
      const mutation = MUTATIONS[round]
      const fleet = randomValidFleet(rng)
      mutation.mutate(rng, fleet)

      const matchId = BigInt(round + 1)
      await (await game.connect(creator).createMatch(opponent.address)).wait()
      await (await game.connect(opponent).joinMatch(matchId)).wait()
      const input = await encryptFleetAs(creator, fleet)
      await (await game.connect(creator).submitFleet(matchId, input)).wait()
      await makeValidationReady(game, matchId, creator)
      await expect(
        game.finalizeFleetValidation(matchId, creator.address),
        `${mutation.label}: [${fleet.join(',')}]`,
      )
        .to.emit(game, 'FleetValidated')
        .withArgs(matchId, creator.address, false)
    }
  })

  it(`plays a random match that agrees with the plaintext model on every observation (seed ${SEED})`, async () => {
    const rng = mulberry32(SEED + 2)
    const [creator, opponent] = await ethers.getSigners()
    const factory = await ethers.getContractFactory('BattleshipGame')
    const game = await factory.deploy()
    await game.waitForDeployment()
    const matchId = 1n

    const creatorFleet = randomValidFleet(rng)
    const opponentFleet = randomValidFleet(rng)
    await (await game.connect(creator).createMatch(opponent.address)).wait()
    await (await game.connect(opponent).joinMatch(matchId)).wait()
    const creatorInput = await encryptFleetAs(creator, creatorFleet)
    await (await game.connect(creator).submitFleet(matchId, creatorInput)).wait()
    const opponentInput = await encryptFleetAs(opponent, opponentFleet)
    await (await game.connect(opponent).submitFleet(matchId, opponentInput)).wait()
    await makeValidationReady(game, matchId, creator)
    await (await game.finalizeFleetValidation(matchId, creator.address)).wait()
    await makeValidationReady(game, matchId, opponent)
    await (await game.finalizeFleetValidation(matchId, opponent.address)).wait()

    const signers = { [creator.address]: creator, [opponent.address]: opponent }
    const models = {
      [creator.address]: new FleetModel(creatorFleet),
      [opponent.address]: new FleetModel(opponentFleet),
    }
    const attacked = {
      [creator.address]: new Set<number>(),
      [opponent.address]: new Set<number>(),
    }
    const expectedMasks = {
      [creator.address]: { miss: 0n, hit: 0n, sunk: 0n },
      [opponent.address]: { miss: 0n, hit: 0n, sunk: 0n },
    }

    // The invited opponent moves first.
    let expectedTurn = opponent.address
    let moveCount = 0

    for (;;) {
      const attacker = expectedTurn
      const defender = attacker === creator.address ? opponent.address : creator.address
      const defenderModel = models[defender]
      const defenderAttacked = attacked[defender]

      // Biased random targeting keeps the match length reasonable while
      // still exercising misses and both turn directions.
      const shipCells = defenderModel.remainingCells(defenderAttacked)
      const allCells = Array.from({ length: 100 }, (_, i) => i).filter(
        (cell) => !defenderAttacked.has(cell),
      )
      const cell = rng() < 0.7 || allCells.length === shipCells.length
        ? pick(rng, shipCells)
        : pick(rng, allCells)

      const expected = defenderModel.shoot(cell)
      defenderAttacked.add(cell)
      const bit = 1n << BigInt(cell)
      if (expected.result === ShotResult.Miss) {
        expectedMasks[defender].miss |= bit
      } else {
        expectedMasks[defender].hit |= bit
        if (expected.result !== ShotResult.Hit) expectedMasks[defender].sunk |= bit
      }

      const attackReceipt = await (
        await game.connect(signers[attacker]).attack(matchId, cell)
      ).wait()
      const submitted = parseEvent(game, attackReceipt!, 'ShotSubmitted')
      moveCount += 1
      expect(submitted.moveId).to.equal(BigInt(moveCount))

      await makeShotReady(game, matchId)
      const finalizeReceipt = await (await game.finalizeAttack(matchId, moveCount)).wait()
      const resolved = parseEvent(game, finalizeReceipt!, 'ShotResolved')

      const context = `move ${moveCount}: ${attacker} shot cell ${cell}`
      expect(resolved.result, context).to.equal(expected.result)
      expect(resolved.sunkShipId, context).to.equal(expected.sunkShipId)

      // Public mask invariants against the model after every resolution.
      const [creatorView, opponentView] = await game.getPlayers(matchId)
      for (const [player, view] of [
        [creator.address, creatorView],
        [opponent.address, opponentView],
      ] as const) {
        const board = view.publicBoard
        const masks = expectedMasks[player]
        expect(board.missMask, `${context}: ${player} missMask`).to.equal(masks.miss)
        expect(board.hitMask, `${context}: ${player} hitMask`).to.equal(masks.hit)
        expect(board.sunkMask, `${context}: ${player} sunkMask`).to.equal(masks.sunk)
        expect(board.attackedMask, context).to.equal(board.missMask | board.hitMask)
        expect(board.missMask & board.hitMask, context).to.equal(0n)
        expect(board.sunkMask & ~board.hitMask, context).to.equal(0n)
        expect(popcount(board.hitMask), context).to.be.lessThanOrEqual(20)
      }

      const m = await game.getMatch(matchId)
      if (expected.result === ShotResult.Win) {
        expect(m.status, context).to.equal(MatchStatus.Finished)
        expect(m.winner, context).to.equal(attacker)
        expect(m.currentTurn, context).to.equal(ethers.ZeroAddress)
        break
      }

      expect(m.status, context).to.equal(MatchStatus.InProgress)
      expectedTurn = expected.result === ShotResult.Miss ? defender : attacker
      expect(m.currentTurn, context).to.equal(expectedTurn)
    }

    // Terminal facts: the loser's 20 ship cells are all hit and all 10 ships
    // are marked sunk (one revealed cell per ship).
    const finalMatch = await game.getMatch(matchId)
    const loser =
      finalMatch.winner === creator.address ? opponent.address : creator.address
    const [creatorView, opponentView] = await game.getPlayers(matchId)
    const loserBoard =
      loser === creator.address ? creatorView.publicBoard : opponentView.publicBoard
    expect(popcount(loserBoard.hitMask)).to.equal(20)
    expect(popcount(loserBoard.sunkMask)).to.equal(10)
    expect(finalMatch.moveCount).to.equal(BigInt(moveCount))

    // The public move history replays the whole match consistently.
    const history = [
      ...(await game.getMoveHistory(matchId, 0, 50)),
      ...(await game.getMoveHistory(matchId, 50, 50)),
      ...(await game.getMoveHistory(matchId, 100, 50)),
    ].slice(0, moveCount)
    expect(history.length).to.equal(moveCount)
    history.forEach((move, index) => {
      expect(move.moveId).to.equal(BigInt(index + 1))
      expect(move.finalized).to.equal(true)
      expect(move.result).to.not.equal(ShotResult.None)
    })
  })
})
