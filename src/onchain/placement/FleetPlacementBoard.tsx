/**
 * Shared fleet-placement surface (GAME-602).
 *
 * The interactive board a player uses to arrange their fleet before it is
 * encrypted and submitted: a DOM grid (which doubles as the no-WebGL fallback
 * and the 3D loading state) or the lazy three.js `PlacementCanvas`, plus the
 * ship tray and the rotate / auto-place / clear controls.
 *
 * It is purely presentational over `usePlacementStore`: it owns no encryption,
 * no contract calls, and no phase logic. The match-route `EncryptedFleetPanel`
 * and the placement-first create/join screens all render it, so the board
 * behaves identically everywhere.
 */

import { Suspense, lazy } from 'react'
import { FLEET, cellLabel } from '../../game/constants'
import { shipCells } from '../../game/board'
import { encryptedPlacementCopy } from '../../copy/en'
import { usePlacementStore } from './placementStore'

// The 3D board (three.js) loads as its own chunk so callers stay light; the
// DOM grid below doubles as the loading state and the no-WebGL fallback.
const PlacementCanvas = lazy(() =>
  import('../../three/PlacementCanvas').then((m) => ({ default: m.PlacementCanvas })),
)

let webglProbe: boolean | null = null
export function supportsWebgl(): boolean {
  if (webglProbe !== null) return webglProbe
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    webglProbe = Boolean(gl)
    // Contexts count against a per-page budget; don't let the probe hold one.
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webglProbe = false
  }
  return webglProbe
}

function occupiedSlots(
  placements: ReturnType<typeof usePlacementStore.getState>['placements'],
): Array<number | null> {
  const cells: Array<number | null> = Array.from({ length: 100 }, () => null)
  for (const placement of placements) {
    if (!placement) continue
    for (const cell of shipCells(placement, FLEET[placement.slot].length) ?? []) {
      cells[cell] = placement.slot
    }
  }
  return cells
}

export interface FleetPlacementBoardProps {
  /** Disables all interaction (e.g. while encrypting or a write is in flight). */
  busy: boolean
}

export function FleetPlacementBoard({ busy }: FleetPlacementBoardProps) {
  const placements = usePlacementStore((state) => state.placements)
  const selectedSlot = usePlacementStore((state) => state.selectedSlot)
  const orientation = usePlacementStore((state) => state.placeOrientation)
  const selectSlot = usePlacementStore((state) => state.selectSlot)
  const rotateSelected = usePlacementStore((state) => state.rotateSelected)
  const placeAt = usePlacementStore((state) => state.placeAt)
  const pickUpAt = usePlacementStore((state) => state.pickUpAt)
  const autoPlace = usePlacementStore((state) => state.autoPlace)
  const clearFleet = usePlacementStore((state) => state.clearFleet)

  const placedCount = placements.filter(Boolean).length
  const cells = occupiedSlots(placements)

  const grid = (
    <div className="placement-grid" role="grid" aria-label="Fleet placement grid">
      {cells.map((slot, cell) => (
        <button
          key={cell}
          type="button"
          role="gridcell"
          className={`placement-cell ${slot !== null ? 'occupied' : ''}`}
          aria-label={`${cellLabel(cell)}${slot !== null ? `, ${FLEET[slot].label}` : ''}`}
          onClick={() => {
            if (busy) return
            if (slot !== null) pickUpAt(cell)
            else placeAt(Math.floor(cell / 10), cell % 10)
          }}
        >
          {slot !== null ? slot + 1 : ''}
        </button>
      ))}
    </div>
  )

  return (
    <>
      {supportsWebgl() ? (
        <div className="placement-stage" data-testid="placement-stage">
          <Suspense fallback={grid}>
            <PlacementCanvas
              placements={placements}
              selectedSlot={selectedSlot}
              orientation={orientation}
              disabled={busy}
              onPlace={(row, col) => void placeAt(row, col)}
              onPickUp={(cell) => void pickUpAt(cell)}
            />
          </Suspense>
        </div>
      ) : (
        grid
      )}

      <div className="fleet-tray">
        {FLEET.map((ship) => {
          const placed = placements[ship.slot] !== null
          const active = selectedSlot === ship.slot
          return (
            <button
              type="button"
              key={ship.slot}
              className={`chip ${placed ? 'placed' : ''} ${active ? 'active' : ''}`}
              disabled={busy}
              onClick={() => selectSlot(active ? null : ship.slot)}
            >
              <span className="chip-cells">
                {Array.from({ length: ship.length }, (_, index) => (
                  <i key={index} />
                ))}
              </span>
              <span className="chip-label">{ship.label}</span>
            </button>
          )
        })}
      </div>

      <div className="button-row">
        <button
          className="btn small"
          disabled={busy || selectedSlot === null}
          onClick={rotateSelected}
        >
          {encryptedPlacementCopy.rotate}
        </button>
        <button className="btn small" disabled={busy} onClick={() => autoPlace()}>
          {encryptedPlacementCopy.autoPlace}
        </button>
        <button
          className="btn small"
          disabled={busy || placedCount === 0}
          onClick={clearFleet}
        >
          {encryptedPlacementCopy.clear}
        </button>
      </div>
    </>
  )
}
