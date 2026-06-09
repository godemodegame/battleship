import { EN } from "../../copy/en";
import { useGame } from "../../game/store";
import { Button } from "../components/Buttons";

export function GameOverScreen() {
  const winner = useGame((s) => s.winner);
  const enemyBoard = useGame((s) => s.enemyBoard);
  const playerBoard = useGame((s) => s.playerBoard);
  const moves = useGame((s) => s.moves);
  const playAgain = useGame((s) => s.playAgain);
  const toMenu = useGame((s) => s.toMenu);

  const won = winner === "you";
  // Your offensive stats are recorded on the enemy board (you attacked it).
  const yourShots = enemyBoard?.shotCount ?? 0;
  const yourHits = enemyBoard?.hitCount ?? 0;
  const yourMisses = enemyBoard?.missCount ?? 0;
  const accuracy = yourShots ? Math.round((yourHits / yourShots) * 100) : 0;
  const yourTurns = moves.filter((m) => m.by === "you").length;
  const enemyShipsLeft = enemyBoard?.shipsRemaining() ?? 0;
  const yourShipsLeft = playerBoard?.shipsRemaining() ?? 0;

  return (
    <div className={`gameover ${won ? "win" : "lose"}`}>
      <h1 className={`result-title ${won ? "win" : "lose"}`}>
        {won ? EN.victory : EN.defeat}
      </h1>

      <div className="stats">
        <div className="panel stat">
          <div className="num">{yourTurns}</div>
          <div className="lbl">{EN.turns}</div>
        </div>
        <div className="panel stat">
          <div className="num">{yourHits}</div>
          <div className="lbl">{EN.hits}</div>
        </div>
        <div className="panel stat">
          <div className="num">{yourMisses}</div>
          <div className="lbl">{EN.misses}</div>
        </div>
        <div className="panel stat">
          <div className="num">{accuracy}%</div>
          <div className="lbl">{EN.accuracy}</div>
        </div>
        <div className="panel stat">
          <div className="num">{won ? yourShipsLeft : enemyShipsLeft}</div>
          <div className="lbl">{EN.shipsLeft}</div>
        </div>
        <div className="panel stat">
          <div className="num">{yourShots}</div>
          <div className="lbl">Shots</div>
        </div>
      </div>

      <div className="menu-stack">
        <Button variant="primary" block onClick={playAgain}>
          ↻ {EN.playAgain}
        </Button>
        <Button variant="secondary" block onClick={toMenu}>
          {EN.backToMenu}
        </Button>
      </div>
    </div>
  );
}
