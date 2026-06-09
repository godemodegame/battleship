import { Scene } from "../three/Scene";
import { useGame } from "../game/store";
import { LoadingGate } from "./screens/LoadingGate";
import { PlacementHUD } from "./screens/PlacementHUD";
import { BattleHUD } from "./screens/BattleHUD";
import { GameOverScreen } from "./screens/GameOverScreen";

// Mounts the 3D field once and overlays the phase-appropriate HUD. The 3D
// scene stays alive across placement → battle → game over (interface guide:
// the game over screen preserves the 3D scene).
export function GameShell() {
  const phase = useGame((s) => s.phase);
  return (
    <div className="app">
      <div className="scene-wrap">
        <Scene />
      </div>
      <LoadingGate />
      {phase === "placement" && <PlacementHUD />}
      {phase === "battle" && <BattleHUD />}
      {phase === "gameover" && <GameOverScreen />}
    </div>
  );
}
