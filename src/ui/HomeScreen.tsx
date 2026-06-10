import { useNavigate } from 'react-router-dom'
import { useStore } from '../practice/practiceStore'
import type { Difficulty } from '../game/types'
import { MuteButton } from './common'
import { haptics } from '../lib/haptics'

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
]

/**
 * Temporary bridge to the on-chain match route so the wallet connection flow is
 * reachable from the menu before the real friend-match menu lands (Phase 5,
 * GAME-504/505). Mirrors `getActiveDeploymentId()` in
 * `src/onchain/deployments.ts` (the canonical source) but is inlined here to keep
 * the on-chain/viem bundle out of the practice chunk. Replace this handler when
 * GAME-505 (`Play Against Friend` address input) is built.
 */
function _onchainLobbyPath(): string {
  const deploymentId = import.meta.env.VITE_ACTIVE_DEPLOYMENT_ID || 'arb-sepolia-v1'
  return `/match/${deploymentId}/lobby`
}
void _onchainLobbyPath;

export function HomeScreen() {
  const _navigate = useNavigate()
  void _navigate;
  const difficulty = useStore((s) => s.difficulty)
  const setDifficulty = useStore((s) => s.setDifficulty)
  const startPlacement = useStore((s) => s.startPlacement)
  const howItWorksOpen = useStore((s) => s.howItWorksOpen)
  const setHowItWorksOpen = useStore((s) => s.setHowItWorksOpen)

  return (
    <div className="overlay home">
      <div className="home-top">
        <MuteButton />
      </div>
      <div className="title-lockup">
        <span className="title-kicker">Tactical FHE Naval Ops</span>
        <h1>
          Encrypted
          <br />
          Battleship
        </h1>
        <p className="tagline">Hide your fleet. Sink theirs first.</p>
      </div>

      <div className="home-actions">
        <div className="difficulty-row" role="radiogroup" aria-label="Bot Difficulty">
          <span className="difficulty-label">Bot Difficulty</span>
          <div className="segmented">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                role="radio"
                aria-checked={difficulty === d.id}
                className={difficulty === d.id ? 'on' : ''}
                onClick={() => {
                  setDifficulty(d.id)
                  haptics.tap()
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn primary"
          onClick={() => {
            startPlacement()
            haptics.confirm()
          }}
        >
          Practice vs Bot
        </button>
        <button className="btn" disabled title="On-chain PvP coming soon">
          Play Against Friend
        </button>
        <button className="btn" disabled title="On-chain PvP coming soon">
          Open Match
        </button>
        <button className="btn ghost" onClick={() => setHowItWorksOpen(true)}>
          How It Works
        </button>
        <p className="footnote">Local practice build — on-chain PvP on Arbitrum Sepolia coming soon.</p>
      </div>

      {howItWorksOpen && (
        <div className="modal-backdrop" onClick={() => setHowItWorksOpen(false)}>
          <div className="panel modal" onClick={(e) => e.stopPropagation()}>
            <h2>How It Works</h2>
            <ul>
              <li>Place your fleet in secret on a 10×10 grid. Ships never touch, even diagonally.</li>
              <li>Fire at the enemy grid. Hit or sink to shoot again; a miss passes the turn.</li>
              <li>Sink the entire enemy fleet before the bot finds yours.</li>
              <li>In the on-chain version, fleets stay encrypted with Fhenix and every move is a transaction. This build plays the same rules locally.</li>
            </ul>
            <button
              className="btn primary"
              onClick={() => {
                setHowItWorksOpen(false)
                haptics.tap()
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
