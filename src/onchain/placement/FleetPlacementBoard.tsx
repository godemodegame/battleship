/**
 * Shared fleet-placement surface (GAME-602).
 *
 * The interactive board a player uses to arrange their fleet before it is
 * encrypted and submitted: the lazy three.js `PlacementCanvas`, the ship tray,
 * and the rotate / auto-place / clear controls.
 *
 * The board is 3D everywhere — the game has no flat grid, in placement or in
 * battle. While the scene chunk streams the player sees a status line, and a
 * device without WebGL is told so plainly instead of being handed a DOM board
 * that leads to an unplayable battle. The tray controls (auto-place, rotate,
 * clear) stay usable in both cases.
 *
 * It is purely presentational over `usePlacementStore`: it owns no encryption,
 * no contract calls, and no phase logic. The match-route `EncryptedFleetPanel`
 * and the placement-first create/join screens all render it, so the board
 * behaves identically everywhere.
 */

import { Suspense, lazy } from 'react'
import { FLEET } from '../../game/constants'
import { encryptedPlacementCopy } from '../../copy/en'
import { usePlacementStore } from './placementStore'

// The 3D board (three.js) loads as its own chunk so callers stay light.
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

  return (
    <>
      {supportsWebgl() ? (
        <div className="placement-stage" data-testid="placement-stage">
          <Suspense
            fallback={
              <p className="status-sub" data-testid="placement-board-loading">
                {encryptedPlacementCopy.boardLoading}
              </p>
            }
          >
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
        <p className="error-note" role="alert" data-testid="placement-webgl-required">
          {encryptedPlacementCopy.webglRequired}
        </p>
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
