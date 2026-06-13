import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { FunctionFragment } from 'ethers'
import {
  VALID_FLEET,
  makeValidationReady,
  makeShotReady,
  deployEncryptedMatchFixtureBase,
  parseEvent,
  encryptFleetAs,
  startEncryptedMatch,
} from './helpers/encryptedFleet'

// GAME-904 (contract surfaces): no plaintext fleet data and no encrypted
// fleet handle can leave the contract through any read function, public
// storage getter, or event. The ABI surface is pinned to an allowlist so any
// future function or event that widens the surface fails here by name.

/** Every externally callable function the release ABI is allowed to have. */
const ALLOWED_FUNCTIONS = [
  // constants
  'BOARD_SIZE',
  'CELL_COUNT',
  'MAX_SHIPS',
  'TOTAL_SHIP_CELLS',
  'NO_CELL',
  'JOIN_TIMEOUT',
  'PLACEMENT_TIMEOUT',
  'TURN_TIMEOUT',
  'RESOLVING_TIMEOUT',
  'MAX_PAGE_LIMIT',
  'getShipLengths',
  // lifecycle writes
  'createMatch',
  'createWithFleet',
  'createOpenMatch',
  'createOpenWithFleet',
  'joinMatch',
  'joinWithFleet',
  'cancelMatch',
  'forfeit',
  'claimTimeoutWin',
  'submitFleet',
  'finalizeFleetValidation',
  'finalizeFleetValidationWithProof',
  'attack',
  'finalizeAttack',
  'finalizeAttackWithProof',
  // reads
  'nextMatchId',
  'getMatch',
  'getPlayers',
  'getPlayerMatches',
  'getPlayerMatchCount',
  'getOpenMatches',
  'getOpenMatchCount',
  'getMove',
  'getMoveHistory',
  'getPendingShot',
  'getPendingPlacementValidation',
] as const

const ALLOWED_EVENTS = [
  'MatchCreated',
  'MatchJoined',
  'MatchCancelled',
  'MatchForfeited',
  'TimeoutWinClaimed',
  'FleetSubmitted',
  'FleetValidationRequested',
  'FleetValidated',
  'MatchStarted',
  'ShotSubmitted',
  'ShotResolutionRequested',
  'ShotResolved',
  'TurnChanged',
  'MatchFinished',
] as const

/**
 * Output components that may never appear on a read function: anything that
 * names the encrypted fleet internals. The public `fleetSubmitted` /
 * `fleetValid` booleans are lifecycle flags, not fleet data, and stay allowed.
 */
const FORBIDDEN_OUTPUT_NAMES = /segment|shiphealth|euint|ebool/i

async function activeMatchFixture() {
  const base = await deployEncryptedMatchFixtureBase()
  await startEncryptedMatch(base.game, base.matchId, base.creator, base.opponent)
  return base
}

function componentNames(fragment: FunctionFragment): string[] {
  const names: string[] = []
  const walk = (paramType: { name: string; components?: readonly unknown[] }) => {
    if (paramType.name) names.push(paramType.name)
    for (const component of paramType.components ?? []) {
      walk(component as { name: string; components?: readonly unknown[] })
    }
  }
  for (const output of fragment.outputs ?? []) walk(output)
  return names
}

describe('BattleshipGame fleet privacy surfaces (GAME-904)', () => {
  it('the ABI exposes exactly the allowlisted functions and events', async () => {
    const { game } = await loadFixture(deployEncryptedMatchFixtureBase)
    const functions: string[] = []
    const events: string[] = []
    game.interface.forEachFunction((fragment) => functions.push(fragment.name))
    game.interface.forEachEvent((fragment) => events.push(fragment.name))

    expect(functions.sort()).to.deep.equal([...ALLOWED_FUNCTIONS].sort())
    expect(events.sort()).to.deep.equal([...ALLOWED_EVENTS].sort())
  })

  it('no read output names any fleet, segment, or encrypted-handle field', async () => {
    const { game } = await loadFixture(deployEncryptedMatchFixtureBase)
    game.interface.forEachFunction((fragment) => {
      if (fragment.stateMutability !== 'view' && fragment.stateMutability !== 'pure') return
      for (const name of componentNames(fragment)) {
        // The pending-shot ct hashes are public decrypt-request identifiers
        // by design (docs/contract-api.md); everything else is forbidden.
        if (name === 'resultCtHash' || name === 'sunkShipCtHash') continue
        expect(name, `${fragment.name} output field ${name}`).to.not.match(
          FORBIDDEN_OUTPUT_NAMES,
        )
      }
    })
  })

  it('the encrypted fleets mapping has no public getter', async () => {
    const { game } = await loadFixture(deployEncryptedMatchFixtureBase)
    expect(game.interface.getFunction('fleets')).to.equal(null)
    expect(game.interface.getFunction('pendingValidations')).to.equal(null)
    expect(game.interface.getFunction('pendingShots')).to.equal(null)
    expect(game.interface.getFunction('moves')).to.equal(null)
    expect(game.interface.getFunction('matches')).to.equal(null)
  })

  it('validity and shot handles are opaque ciphertext ids, never plaintext-sized values', async () => {
    const { game, creator, opponent, matchId } = await loadFixture(
      deployEncryptedMatchFixtureBase,
    )
    const input = await encryptFleetAs(creator, VALID_FLEET)
    const submitReceipt = await (
      await game.connect(creator).submitFleet(matchId, input)
    ).wait()
    const requested = parseEvent(game, submitReceipt!, 'FleetValidationRequested')
    // An euint/ebool handle is a 256-bit hash-domain identifier. A plaintext
    // leak (cell index 0..99 or bool 0/1) would be a tiny integer.
    expect(requested.ctHash as bigint).to.be.greaterThan(2n ** 64n)

    await makeValidationReady(game, matchId, creator)
    await (await game.finalizeFleetValidation(matchId, creator.address)).wait()
    const opponentInput = await encryptFleetAs(opponent, VALID_FLEET)
    await (await game.connect(opponent).submitFleet(matchId, opponentInput)).wait()
    await makeValidationReady(game, matchId, opponent)
    await (await game.finalizeFleetValidation(matchId, opponent.address)).wait()

    const attackReceipt = await (await game.connect(opponent).attack(matchId, 50)).wait()
    const resolutionRequested = parseEvent(game, attackReceipt!, 'ShotResolutionRequested')
    expect(resolutionRequested.resultCtHash as bigint).to.be.greaterThan(2n ** 64n)
    expect(resolutionRequested.sunkShipCtHash as bigint).to.be.greaterThan(2n ** 64n)

    const pending = await game.getPendingShot(matchId)
    expect(pending.resultCtHash).to.be.greaterThan(2n ** 64n)
    expect(pending.sunkShipCtHash).to.be.greaterThan(2n ** 64n)
  })

  it('a full battle emits only allowlisted events from the game contract', async () => {
    const { game, opponent, matchId } = await loadFixture(activeMatchFixture)
    const gameAddress = await game.getAddress()

    // Hit, then miss: both result paths emit.
    for (const cell of [VALID_FLEET[0], 9]) {
      const attackReceipt = await (await game.connect(opponent).attack(matchId, cell)).wait()
      const submitted = parseEvent(game, attackReceipt!, 'ShotSubmitted')
      await makeShotReady(game, matchId)
      const finalizeReceipt = await (
        await game.finalizeAttack(matchId, submitted.moveId)
      ).wait()

      for (const receipt of [attackReceipt!, finalizeReceipt!]) {
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== gameAddress.toLowerCase()) continue
          const parsed = game.interface.parseLog(log)
          expect(parsed, 'unparseable log from the game contract').to.not.equal(null)
          expect([...ALLOWED_EVENTS]).to.include(parsed!.name)
        }
      }
    }
  })

  it('player views expose masks and flags only — never positions that were not publicly attacked', async () => {
    const { game, opponent, matchId } = await loadFixture(activeMatchFixture)
    // One hit on a known creator ship cell.
    const attackReceipt = await (
      await game.connect(opponent).attack(matchId, VALID_FLEET[0])
    ).wait()
    const submitted = parseEvent(game, attackReceipt!, 'ShotSubmitted')
    await makeShotReady(game, matchId)
    await (await game.finalizeAttack(matchId, submitted.moveId)).wait()

    const [creatorView] = await game.getPlayers(matchId)
    // Exactly the attacked bit is revealed; the 19 other ship cells stay dark.
    expect(creatorView.publicBoard.attackedMask).to.equal(1n << BigInt(VALID_FLEET[0]))
    expect(creatorView.publicBoard.hitMask).to.equal(1n << BigInt(VALID_FLEET[0]))
    const revealedBits = creatorView.publicBoard.attackedMask
    for (const shipCell of VALID_FLEET.slice(1)) {
      expect(revealedBits & (1n << BigInt(shipCell))).to.equal(0n)
    }
  })
})
