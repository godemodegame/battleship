import { useEffect, useState } from "react";
import { EN } from "../../copy/en";
import { useGame } from "../../game/store";
import { BOARD_SIZE } from "../../game/types";
import { Button, IconButton, Pill } from "../components/Buttons";

const COLS = "ABCDEFGHIJ";
const label = (index: number) =>
  `${COLS[index % BOARD_SIZE]}${Math.floor(index / BOARD_SIZE) + 1}`;

function ResultBanner() {
  const banner = useGame((s) => s.banner);
  const clear = useGame((s) => s.clearBanner);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(clear, 1150);
    return () => clearTimeout(t);
  }, [banner, clear]);
  if (!banner) return null;
  const main =
    banner.result === "miss" ? EN.miss : banner.result === "sunk" ? EN.sunk : EN.hit;
  return (
    <div className={`banner ${banner.result}`} key={banner.text + Math.random()}>
      {main}
      {banner.result === "sunk" && <span className="sub">{banner.text}</span>}
    </div>
  );
}

function History({ onClose }: { onClose: () => void }) {
  const moves = useGame((s) => s.moves);
  return (
    <div className="history">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>{EN.moveHistory}</h3>
        <IconButton label={EN.backToMenu} onClick={onClose}>
          ✕
        </IconButton>
      </div>
      <div className="rows">
        {moves.length === 0 && <div style={{ opacity: 0.5, fontSize: 13 }}>No shots yet.</div>}
        {moves.map((m, i) => (
          <div className="panel hrow" key={i}>
            <span className={`who ${m.by}`}>{m.by === "you" ? "You" : "Enemy"}</span>
            <span>{label(m.index)}</span>
            <span className={`res ${m.result}`}>
              {m.result === "miss" ? EN.miss : m.result === "sunk" ? `${EN.sunk}${m.ship ? ` · ${m.ship}` : ""}` : EN.hit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BattleHUD() {
  const view = useGame((s) => s.view);
  const setView = useGame((s) => s.setView);
  const turn = useGame((s) => s.turn);
  const resolving = useGame((s) => s.resolving);
  const difficulty = useGame((s) => s.difficulty);
  const selected = useGame((s) => s.selectedTarget);
  const selectTarget = useGame((s) => s.selectTarget);
  const fire = useGame((s) => s.fire);
  const toMenu = useGame((s) => s.toMenu);
  const enemyBoard = useGame((s) => s.enemyBoard);

  const [showHistory, setShowHistory] = useState(false);

  const turnLabel = resolving
    ? EN.resolvingShot
    : turn === "you"
    ? EN.yourTurn
    : EN.opponentTurn;

  const shipsLeft = enemyBoard?.shipsRemaining() ?? 0;
  const canFire = turn === "you" && !resolving && selected !== null && view === "target";

  return (
    <>
      <div className="overlay">
        <div className="topbar">
          <div className="left">
            <Pill warn={turn === "enemy" || resolving}>
              <span className={turn === "you" ? "turn-you" : "turn-enemy"}>{turnLabel}</span>
            </Pill>
          </div>
          <div className="right">
            <Pill>{EN[difficulty]}</Pill>
            <IconButton label={EN.moveHistory} onClick={() => setShowHistory(true)}>
              ☰
            </IconButton>
            <button className="btn btn-danger" style={{ minHeight: 40, padding: "8px 12px" }} onClick={toMenu}>
              {EN.forfeit}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
          <div className="tabs panel">
            <button className={`tab ${view === "target" ? "active" : ""}`} onClick={() => setView("target")}>
              {EN.target}
            </button>
            <button className={`tab ${view === "fleet" ? "active" : ""}`} onClick={() => setView("fleet")}>
              {EN.fleet}
            </button>
          </div>
        </div>

        <div className="spacer" />

        <div className="bottombar">
          <div className="panel coord-line">
            <div>
              <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: "0.1em" }}>
                {EN.shipsLeft}: {shipsLeft}
              </div>
              <div className="coord">{selected !== null ? label(selected) : "—"}</div>
            </div>
            <div className={`turn-status ${turn === "you" ? "turn-you" : "turn-enemy"}`}>
              {turnLabel}
            </div>
          </div>

          {view === "target" ? (
            <div style={{ display: "flex", gap: 10 }}>
              {selected !== null && (
                <Button variant="secondary" onClick={() => selectTarget(null)} style={{ flex: 1 }}>
                  {EN.cancelTarget}
                </Button>
              )}
              <Button
                variant={canFire ? "amber" : "secondary"}
                onClick={fire}
                disabled={!canFire}
                style={{ flex: 2 }}
              >
                {selected !== null ? EN.fireAt(label(selected)) : EN.selectTarget}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" block onClick={() => setView("target")}>
              ◀ {EN.target}
            </Button>
          )}
        </div>
      </div>

      <ResultBanner />
      {showHistory && <History onClose={() => setShowHistory(false)} />}
    </>
  );
}
