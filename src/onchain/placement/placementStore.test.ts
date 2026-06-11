import { beforeEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { FLEET, cellIndex } from '../../game/constants'
import { isFleetComplete } from '../../game/board'
import { COMPLETE_FLEET, seededRandom } from '../../test/gameFixtures'
import {
  completedFleet,
  placementScopeKey,
  usePlacementStore,
  type PlacementScope,
} from './placementStore'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SCOPE: PlacementScope = {
  address: '0xAbC0000000000000000000000000000000000001',
  chainId: 421614,
  deploymentId: 'dev-1',
  matchId: 7n,
}

function placeCompleteFleet() {
  const store = usePlacementStore.getState()
  for (const p of COMPLETE_FLEET) {
    store.selectSlot(p.slot)
    while (usePlacementStore.getState().placeOrientation !== p.orientation) {
      store.rotateSelected()
    }
    expect(store.placeAt(p.row, p.col)).toBe(true)
  }
}

beforeEach(() => {
  usePlacementStore.getState().bindScope(null)
})

describe('placement store scope binding (GAME-601)', () => {
  it('starts unbound with no plaintext and no selection', () => {
    const s = usePlacementStore.getState()
    expect(s.scopeKey).toBeNull()
    expect(s.placements.every((p) => p === null)).toBe(true)
    expect(s.selectedSlot).toBeNull()
  })

  it('ignores placement input while unbound', () => {
    const store = usePlacementStore.getState()
    store.selectSlot(0)
    expect(store.placeAt(0, 0)).toBe(false)
    store.autoPlace(seededRandom(1))
    expect(usePlacementStore.getState().placements.every((p) => p === null)).toBe(true)
  })

  it('binding selects the first ship and re-binding the same scope keeps progress', () => {
    usePlacementStore.getState().bindScope(SCOPE)
    expect(usePlacementStore.getState().selectedSlot).toBe(0)
    expect(usePlacementStore.getState().placeAt(0, 0)).toBe(true)

    // Same identity, different bigint/string and address casing.
    usePlacementStore.getState().bindScope({
      ...SCOPE,
      address: SCOPE.address.toUpperCase().replace('0X', '0x'),
      matchId: '7',
    })
    expect(usePlacementStore.getState().placements[0]).not.toBeNull()
  })

  it.each([
    ['account change', { ...SCOPE, address: '0xabc0000000000000000000000000000000000002' }],
    ['chain change', { ...SCOPE, chainId: 1 }],
    ['deployment change', { ...SCOPE, deploymentId: 'dev-2' }],
    ['match change', { ...SCOPE, matchId: 8n }],
  ] as const)('%s wipes the plaintext fleet', (_label, nextScope) => {
    usePlacementStore.getState().bindScope(SCOPE)
    expect(usePlacementStore.getState().placeAt(0, 0)).toBe(true)

    usePlacementStore.getState().bindScope(nextScope)
    const s = usePlacementStore.getState()
    expect(s.scopeKey).toBe(placementScopeKey(nextScope))
    expect(s.placements.every((p) => p === null)).toBe(true)
    expect(s.selectedSlot).toBe(0)
  })

  it('disconnect (bindScope null) wipes and unbinds', () => {
    usePlacementStore.getState().bindScope(SCOPE)
    expect(usePlacementStore.getState().placeAt(0, 0)).toBe(true)

    usePlacementStore.getState().bindScope(null)
    const s = usePlacementStore.getState()
    expect(s.scopeKey).toBeNull()
    expect(s.placements.every((p) => p === null)).toBe(true)
    expect(s.selectedSlot).toBeNull()
  })
})

describe('placement store fleet editing (GAME-601)', () => {
  beforeEach(() => {
    usePlacementStore.getState().bindScope(SCOPE)
  })

  it('places a complete valid fleet and reports completion', () => {
    placeCompleteFleet()
    const s = usePlacementStore.getState()
    expect(isFleetComplete(s.placements)).toBe(true)
    expect(completedFleet(s)).toEqual(COMPLETE_FLEET)
    expect(s.selectedSlot).toBeNull()
  })

  it('rejects an off-board or touching placement without mutating state', () => {
    const store = usePlacementStore.getState()
    expect(store.placeAt(0, 0)).toBe(true) // carrier h at A1..D1
    store.selectSlot(1)
    expect(store.placeAt(0, 8)).toBe(false) // battleship h runs off the board
    expect(store.placeAt(1, 0)).toBe(false) // touches the carrier diagonally
    const s = usePlacementStore.getState()
    expect(s.placements[1]).toBeNull()
    expect(s.selectedSlot).toBe(1)
  })

  it('advances selection to the next empty slot after a placement', () => {
    const store = usePlacementStore.getState()
    expect(store.placeAt(0, 0)).toBe(true)
    expect(usePlacementStore.getState().selectedSlot).toBe(1)
  })

  it('rotates the pending orientation', () => {
    usePlacementStore.getState().rotateSelected()
    expect(usePlacementStore.getState().placeOrientation).toBe('v')
    usePlacementStore.getState().rotateSelected()
    expect(usePlacementStore.getState().placeOrientation).toBe('h')
  })

  it('picks a placed ship back up with its slot and orientation', () => {
    const store = usePlacementStore.getState()
    store.rotateSelected()
    expect(store.placeAt(2, 2)).toBe(true) // carrier v at C3..C6
    expect(store.pickUpAt(cellIndex(4, 2))).toBe(true)
    const s = usePlacementStore.getState()
    expect(s.placements[0]).toBeNull()
    expect(s.selectedSlot).toBe(0)
    expect(s.placeOrientation).toBe('v')
    expect(store.pickUpAt(cellIndex(9, 9))).toBe(false)
  })

  it('auto-places a complete valid fleet deterministically', () => {
    usePlacementStore.getState().autoPlace(seededRandom(42))
    const s = usePlacementStore.getState()
    expect(isFleetComplete(s.placements)).toBe(true)
    expect(s.selectedSlot).toBeNull()
  })

  it('clearFleet wipes plaintext but keeps the scope binding', () => {
    placeCompleteFleet()
    usePlacementStore.getState().clearFleet()
    const s = usePlacementStore.getState()
    expect(s.scopeKey).toBe(placementScopeKey(SCOPE))
    expect(s.placements.every((p) => p === null)).toBe(true)
    expect(s.selectedSlot).toBe(0)
  })
})

describe('placement store privacy and isolation (GAME-601)', () => {
  const source = () =>
    readFile(resolve(__dirname, './placementStore.ts'), 'utf8')

  it('never imports the practice store, attack engine, or bot', async () => {
    const src = await source()
    const bad =
      /(?:from\s+['"]|import\s*\(\s*['"]|require\s*\(\s*['"]|export[^;]+from\s+['"])[^'"]*\b(engine|bot|practiceStore|practice)\b/i
    expect(src).not.toMatch(bad)
  })

  it('never persists or exposes plaintext (no storage APIs, no window global)', async () => {
    const src = await source()
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/)
    expect(src).not.toMatch(/\bwindow\b/)
    expect(src).not.toMatch(/zustand\/middleware/) // no persist() wrapper
  })

  it('the practice store never imports the on-chain placement store', async () => {
    const src = await readFile(
      resolve(__dirname, '../../practice/practiceStore.ts'),
      'utf8',
    )
    expect(src).not.toMatch(/placementStore|onchain/)
  })

  it('is a distinct store instance from the practice store', async () => {
    const practice = await import('../../practice/practiceStore')
    expect(usePlacementStore).not.toBe(practice.useStore)
    // Editing the on-chain fleet must not leak into practice placements.
    usePlacementStore.getState().bindScope(SCOPE)
    expect(usePlacementStore.getState().placeAt(0, 0)).toBe(true)
    expect(practice.useStore.getState().placements.every((p) => p === null)).toBe(true)
  })

  it('covers every fleet slot exactly once', () => {
    usePlacementStore.getState().bindScope(SCOPE)
    expect(usePlacementStore.getState().placements).toHaveLength(FLEET.length)
  })
})
