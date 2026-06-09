import { useState } from "react";
import { EN } from "../../copy/en";
import { Button } from "../components/Buttons";

// First screen — looks like the game, not a marketing page (interface guide).
// On-chain wallet connect is documented but not wired in this local build, so
// the primary action enters the playable practice flow.
export function EntryScreen({ onPlay }: { onPlay: () => void }) {
  const [help, setHelp] = useState(false);
  return (
    <div className="center-screen">
      <span className="tag">Arbitrum · Fhenix · 3D</span>
      <h1 className="title">{EN.appTitle}</h1>
      <p className="subtitle">{EN.appTagline}</p>

      <div className="menu-stack">
        <Button variant="primary" block onClick={onPlay}>
          ▶ {EN.enterBattle}
        </Button>
        <Button variant="secondary" block onClick={() => setHelp((v) => !v)}>
          {EN.howItWorks}
        </Button>
      </div>

      {help && (
        <div className="panel" style={{ padding: 16, maxWidth: 340, textAlign: "left", fontSize: 13, lineHeight: 1.6 }}>
          <b>How it works</b>
          <ol style={{ paddingLeft: 18, margin: "8px 0 0" }}>
            <li>Place your fleet on the 10×10 sea grid.</li>
            <li>Take turns firing at the enemy's hidden board.</li>
            <li>Hit every segment of a ship to sink it.</li>
            <li>Destroy the whole enemy fleet to win.</li>
          </ol>
          <p style={{ opacity: 0.6, marginBottom: 0 }}>
            Classic rules: ships never touch, even diagonally.
          </p>
        </div>
      )}

      <div className="build-note">
        Local playable build · on-chain Fhenix/CoFHE layer scaffolded per docs
      </div>
    </div>
  );
}
