import { useEffect } from 'react'
import { GameCanvas } from '../three/Scene'
import { resetPracticeState, useStore } from '../state/store'
import { HomeScreen } from '../ui/HomeScreen'
import { PlacementScreen } from '../ui/PlacementScreen'
import { BattleHUD } from '../ui/BattleHUD'
import { GameOverScreen } from '../ui/GameOverScreen'
import { LoadingOverlay } from '../ui/common'

export function PracticeApp() {
  const screen = useStore((s) => s.screen)

  useEffect(() => () => resetPracticeState(), [])

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