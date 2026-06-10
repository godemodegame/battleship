import { useState } from 'react'
import { useStore } from '../practice/practiceStore'
import { cellLabel } from '../game/constants'
import type { BoardState, Side } from '../game/types'
import { MuteButton } from './common'
import { haptics } from '../lib/haptics'

function FleetStrip({ board, label, enemy }: { board: BoardState; label: string; enemy?: boolean }) {
  return (
    <div className={`fleet-strip ${enemy ? 'enemy' : ''}`}>
      <span className="strip-label">{label}</span>
      <div className="strip-ships">
        {board.ships.map((ship) => (
          <span key={ship.slot} className={`strip-ship ${ship.sunk ? 'sunk' : ''}`}>
            {Array.from({ length: ship.length }, (_, i) => (
              <i key={i} />
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}

export function BattleHUD() {
  const match = useStore((s) => s.match)
  const busy = useStore((s) => s.busy)
  const selectedCell = useStore((s) => s.selectedCell)
  const fire = useStore((s) => s.fire)
  const forfeit = useStore((s) => s.forfeit)
  const toast = useStore((s) => s.toast)
  const [confirmForfeit, setConfirmForfeit] = useState(false)
  if (!match) return null

  const yourTurn = match.turn === 'player' && !busy && !match.winner
  const status: { text: string; tone: string } = match.winner
    ? { text: 'Match Over', tone: 'amber' }
    : busy
      ? match.turn === 'player'
        ? { text: 'Resolving Shot', tone: 'amber' }
        : { text: 'Opponent Turn', tone: 'red' }
      : { text: 'Your Turn', tone: 'cyan' }

  const canFire = yourTurn && selectedCell !== null

  return (
    <div className="hud">
      <div className="topbar">
        <button className="icon-btn danger" aria-label="Forfeit" onClick={() => setConfirmForfeit(true)}>
          ⚑
        </button>
        <div className="topbar-status">
          <span className={`status-label pulse-${status.tone}`}>{status.text}</span>
          <span className="status-sub">Move {match.moves.length + 1}</span>
        </div>
        <MuteButton />
      </div>

      <div className="strips">
        <FleetStrip board={match.boards.bot} label="Enemy fleet" enemy />
        <FleetStrip board={match.boards.player} label="Your fleet" />
      </div>

      {toast && (
        <div key={toast.id} className={`toast tone-${toast.tone}`}>
          {toast.text}
        </div>
      )}

      <div className="bottom-stack battle">
        <button
          className="btn fire wide"
          onClick={() => {
            void fire()
            if (canFire) haptics.fire()
          }}
          disabled={!canFire}
        >
          {canFire ? `Fire at ${cellLabel(selectedCell)}` : yourTurn ? 'Select a target cell' : status.text}
        </button>
      </div>

      {confirmForfeit && (
        <div className="modal-backdrop" onClick={() => setConfirmForfeit(false)}>
          <div className="panel modal" onClick={(e) => e.stopPropagation()}>
            <h2>Forfeit Match</h2>
            <p>Abandon ship? The match counts as a defeat.</p>
            <div className="button-row">
              <button
                className="btn small"
                onClick={() => {
                  setConfirmForfeit(false)
                  haptics.tap()
                }}
              >
                Cancel
              </button>
              <button
                className="btn small danger"
                onClick={() => {
                  setConfirmForfeit(false)
                  forfeit()
                  haptics.lose()
                }}
              >
                Forfeit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function sideName(side: Side) {
  return side === 'player' ? 'You' : 'Bot'
}
