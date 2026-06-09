import { EN } from "../../copy/en";
import { useGame } from "../../game/store";
import { Button, Pill } from "../components/Buttons";

export function PlacementHUD() {
  const ships = useGame((s) => s.playerShips);
  const reshuffle = useGame((s) => s.reshuffle);
  const confirm = useGame((s) => s.confirmFleet);
  const toMenu = useGame((s) => s.toMenu);

  return (
    <div className="overlay">
      <div className="topbar">
        <Pill>{EN.placeYourFleet}</Pill>
        <button className="icon-btn" aria-label={EN.backToMenu} onClick={toMenu}>
          ✕
        </button>
      </div>

      <div className="spacer" />

      <div className="bottombar">
        <div className="panel fleet-list" style={{ padding: 10 }}>
          {ships.map((s) => (
            <span className="fleet-chip" key={s.id}>
              {s.name}
              <span className="dots">{"●".repeat(s.length)}</span>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={reshuffle} style={{ flex: 1 }}>
            ⟳ {EN.shuffle}
          </Button>
          <Button variant="primary" onClick={confirm} style={{ flex: 2 }}>
            {EN.confirmFleet}
          </Button>
        </div>
        <div style={{ textAlign: "center", fontSize: 12, opacity: 0.6 }}>
          {EN.fleetReady}
        </div>
      </div>
    </div>
  );
}
