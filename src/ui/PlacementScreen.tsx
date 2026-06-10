import { useStore } from '../practice/practiceStore'
import { FLEET } from '../game/constants'
import { isFleetComplete } from '../game/board'
import { MuteButton } from './common'
import { haptics } from '../lib/haptics'

export function PlacementScreen() {
  const placements = useStore((s) => s.placements)
  const selectedSlot = useStore((s) => s.selectedSlot)
  const selectSlot = useStore((s) => s.selectSlot)
  const orientation = useStore((s) => s.placeOrientation)
  const rotateSelected = useStore((s) => s.rotateSelected)
  const autoPlace = useStore((s) => s.autoPlace)
  const clearPlacement = useStore((s) => s.clearPlacement)
  const confirmFleet = useStore((s) => s.confirmFleet)
  const toHome = useStore((s) => s.toHome)

  const complete = isFleetComplete(placements)
  const placedCount = placements.filter(Boolean).length

  return (
    <div className="hud">
      <div className="topbar">
        <button
          className="icon-btn"
          aria-label="Back"
          onClick={() => {
            toHome()
            haptics.tap()
          }}
        >
          ‹
        </button>
        <div className="topbar-status">
          <span className="status-label">Deploy Fleet</span>
          <span className="status-sub">
            {placedCount}/{FLEET.length} placed · tap a ship chip, then the board
          </span>
        </div>
        <MuteButton />
      </div>

      <div className="bottom-stack">
        <div className="fleet-tray">
          {FLEET.map((def) => {
            const placed = placements[def.slot] !== null
            const active = selectedSlot === def.slot
            return (
              <button
                key={def.slot}
                className={`chip ${placed ? 'placed' : ''} ${active ? 'active' : ''}`}
                onClick={() => selectSlot(active ? null : def.slot)}
              >
                <span className="chip-cells">
                  {Array.from({ length: def.length }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
                <span className="chip-label">{def.label}</span>
              </button>
            )
          })}
        </div>

        <div className="button-row">
          <button
            className="btn small"
            onClick={rotateSelected}
            disabled={selectedSlot === null}
          >
            Rotate · {orientation === 'h' ? 'Horizontal' : 'Vertical'}
          </button>
          <button className="btn small" onClick={autoPlace}>
            Auto Place
          </button>
          <button className="btn small" onClick={clearPlacement} disabled={placedCount === 0}>
            Clear
          </button>
        </div>
        <button className="btn primary wide" onClick={confirmFleet} disabled={!complete}>
          Confirm Fleet
        </button>
      </div>
    </div>
  )
}
