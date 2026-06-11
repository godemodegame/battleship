/**
 * Transient on-chain placement store (GAME-601).
 *
 * Holds the plaintext fleet a player arranges for an on-chain match before it
 * is encrypted and submitted. It is strictly separate from the practice store:
 * practice keeps its plaintext fleet for the whole match, while this store
 * exists only between entering placement and a successful `submitFleet`, after
 * which the fleet is wiped (GAME-607 calls `clearFleet`).
 *
 * Privacy rules (docs/frontend-architecture.md, "Placement Store"):
 * - in-memory only: never persisted to storage and never exposed as a browser
 *   global (unlike the practice store's E2E debug handle);
 * - bound to exactly one (address, chainId, deploymentId, matchId) scope; any
 *   scope change — account switch, chain switch, another match, disconnect —
 *   wipes the plaintext fleet before the new scope can read anything;
 * - `clearFleet` wipes placements without unbinding, for the placement-screen
 *   Clear action and for plaintext clearing after encrypted submission.
 *
 * The mutation actions reuse the pure practice-mode placement helpers from
 * `src/game/board.ts` (bounds + classic no-touch rule) so on-chain placement
 * behaves exactly like practice placement. The store never imports the attack
 * engine or the bot, and it plays no sounds: UX feedback belongs to the
 * placement screen (GAME-602), which uses the boolean results of `placeAt`.
 */

import { create } from 'zustand'
import { FLEET } from '../../game/constants'
import { autoPlaceFleet, canPlace, isFleetComplete, rotated, shipCells } from '../../game/board'
import type { Orientation, Placement } from '../../game/types'

/** Identity a placement session is bound to. Any change wipes the fleet. */
export interface PlacementScope {
  address: string
  chainId: number
  deploymentId: string
  matchId: bigint | string
}

/** Canonical scope identity; addresses compare case-insensitively. */
export function placementScopeKey(scope: PlacementScope): string {
  return [
    scope.address.toLowerCase(),
    String(scope.chainId),
    scope.deploymentId,
    String(scope.matchId),
  ].join('|')
}

export interface PlacementState {
  /** Scope the current plaintext belongs to; null when unbound (no plaintext). */
  scopeKey: string | null
  placements: (Placement | null)[]
  selectedSlot: number | null
  placeOrientation: Orientation

  /**
   * Bind the store to a scope, wiping all placement state when the scope
   * differs from the current one. Re-binding the identical scope is a no-op so
   * render-time syncing cannot destroy in-progress placement. `null` unbinds
   * and wipes (disconnect / leaving the match route).
   */
  bindScope: (scope: PlacementScope | null) => void
  selectSlot: (slot: number | null) => void
  rotateSelected: () => void
  /** Place the selected ship at row/col. False when the no-touch rule rejects it. */
  placeAt: (row: number, col: number) => boolean
  /** Pick up the ship covering `cell` for re-placement. False when the cell is empty. */
  pickUpAt: (cell: number) => boolean
  autoPlace: (rnd?: () => number) => void
  /** Wipe placements and selection but keep the scope binding. */
  clearFleet: () => void
}

const emptyPlacement = () => ({
  placements: FLEET.map(() => null) as (Placement | null)[],
  selectedSlot: 0,
  placeOrientation: 'h' as Orientation,
})

export const usePlacementStore = create<PlacementState>((set, get) => ({
  scopeKey: null,
  ...emptyPlacement(),
  selectedSlot: null,

  bindScope: (scope) => {
    const nextKey = scope ? placementScopeKey(scope) : null
    if (nextKey === get().scopeKey) return
    set({ scopeKey: nextKey, ...emptyPlacement(), selectedSlot: nextKey ? 0 : null })
  },

  selectSlot: (selectedSlot) => set({ selectedSlot }),

  rotateSelected: () => set((s) => ({ placeOrientation: rotated(s.placeOrientation) })),

  placeAt: (row, col) => {
    const { scopeKey, placements, selectedSlot, placeOrientation } = get()
    if (scopeKey === null || selectedSlot === null) return false
    const candidate: Placement = { slot: selectedSlot, row, col, orientation: placeOrientation }
    if (!canPlace(placements, candidate)) return false
    const next = placements.slice()
    next[selectedSlot] = candidate
    const nextEmpty = next.findIndex((p) => p === null)
    set({ placements: next, selectedSlot: nextEmpty === -1 ? null : nextEmpty })
    return true
  },

  pickUpAt: (cell) => {
    const { placements } = get()
    for (const p of placements) {
      if (!p) continue
      const cells = shipCells(p, FLEET[p.slot].length)
      if (cells?.includes(cell)) {
        const next = placements.slice()
        next[p.slot] = null
        set({ placements: next, selectedSlot: p.slot, placeOrientation: p.orientation })
        return true
      }
    }
    return false
  },

  autoPlace: (rnd = Math.random) => {
    if (get().scopeKey === null) return
    set({ placements: autoPlaceFleet(rnd), selectedSlot: null })
  },

  clearFleet: () => set({ ...emptyPlacement() }),
}))

/** The completed fleet, or null while any ship is missing or misplaced. */
export function completedFleet(state: Pick<PlacementState, 'placements'>): Placement[] | null {
  return isFleetComplete(state.placements) ? state.placements : null
}
