import { useNavigate } from 'react-router-dom'
import { useStore } from '../practice/practiceStore'
import type { Difficulty } from '../game/types'
import { MuteButton } from './common'
import { haptics } from '../lib/haptics'
import { useWalletSession } from '../onchain/wallet/WalletSessionContext'
import { WalletSessionBar } from '../onchain/wallet/WalletSessionBar'
import {
  useSettingsStore,
  type MotionSetting,
  type QualitySetting,
} from './settingsStore'

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
]

const MOTION_OPTIONS: { id: MotionSetting; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'reduced', label: 'Reduced' },
  { id: 'full', label: 'Full' },
]

const QUALITY_OPTIONS: { id: QualitySetting; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
]

/** Display settings (GAME-807): reduced motion + graphics quality. */
function DisplaySettings() {
  const motion = useSettingsStore((s) => s.motion)
  const quality = useSettingsStore((s) => s.quality)
  const setMotion = useSettingsStore((s) => s.setMotion)
  const setQuality = useSettingsStore((s) => s.setQuality)

  return (
    <>
      <div className="difficulty-row" role="radiogroup" aria-label="Motion">
        <span className="difficulty-label">Motion</span>
        <div className="segmented">
          {MOTION_OPTIONS.map((option) => (
            <button
              key={option.id}
              role="radio"
              aria-checked={motion === option.id}
              data-testid={`motion-${option.id}`}
              className={motion === option.id ? 'on' : ''}
              onClick={() => setMotion(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="difficulty-row" role="radiogroup" aria-label="Graphics Quality">
        <span className="difficulty-label">Graphics</span>
        <div className="segmented">
          {QUALITY_OPTIONS.map((option) => (
            <button
              key={option.id}
              role="radio"
              aria-checked={quality === option.id}
              data-testid={`quality-${option.id}`}
              className={quality === option.id ? 'on' : ''}
              onClick={() => setQuality(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

export function HomeScreen() {
  const navigate = useNavigate()
  const wallet = useWalletSession()
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

      {/* Practice is the hub: surface the connected wallet so disconnect stays
          reachable here. A disconnected player connects through the friend-match
          flow, so no connect button clutters the pure-practice menu. */}
      {wallet.session.isConnected && (
        <WalletSessionBar
          session={wallet.session}
          onConnect={wallet.actions.connect}
          onDisconnect={wallet.actions.disconnect}
          configMissing={wallet.configMissing}
        />
      )}
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
                onClick={() => setDifficulty(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn primary"
          onClick={() => {
            haptics.prime()
            startPlacement()
          }}
        >
          Practice vs Bot
        </button>
        <button className="btn" onClick={() => navigate('/match/new')}>
          Play Against Friend
        </button>
        <button className="btn" onClick={() => navigate('/matches')}>
          My Battles
        </button>
        <button className="btn" disabled title="Open matchmaking coming soon">
          Open Match
        </button>
        <DisplaySettings />
        <button className="btn ghost" onClick={() => setHowItWorksOpen(true)}>
          How It Works
        </button>
        <p className="footnote">On-chain friend matches run on Arbitrum Sepolia.</p>
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
            <button className="btn primary" onClick={() => setHowItWorksOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
