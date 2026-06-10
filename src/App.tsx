import { GameCanvas } from './three/Scene'
import { useStore } from './state/store'
import { HomeScreen } from './ui/HomeScreen'
import { PlacementScreen } from './ui/PlacementScreen'
import { BattleHUD } from './ui/BattleHUD'
import { GameOverScreen } from './ui/GameOverScreen'
import { LoadingOverlay } from './ui/common'

export default function App() {
  const screen = useStore((s) => s.screen)
  return (
    <div className="app">
      <GameCanvas />
      {screen === 'home' && <HomeScreen />}
      {screen === 'placement' && <PlacementScreen />}
      {screen === 'battle' && <BattleHUD />}
      {screen === 'gameover' && <GameOverScreen />}
      <LoadingOverlay />
    </div>
  )
}
