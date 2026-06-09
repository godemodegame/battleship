import { useState } from "react";
import { EN } from "../../copy/en";
import { Difficulty } from "../../game/types";
import { Button } from "../components/Buttons";
import { useGame } from "../../game/store";

export function OpponentScreen({ onBack }: { onBack: () => void }) {
  const start = useGame((s) => s.start);
  const [diff, setDiff] = useState<Difficulty>("normal");

  return (
    <div className="center-screen">
      <span className="tag">{EN.chooseOpponent}</span>

      <div className="menu-stack">
        <div className="seg panel">
          {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
            <button
              key={d}
              className={`seg-btn ${diff === d ? "active" : ""}`}
              onClick={() => setDiff(d)}
            >
              {EN[d]}
            </button>
          ))}
        </div>

        <Button variant="primary" block onClick={() => start(diff)}>
          ⚓ {EN.practiceVsBot}
        </Button>

        <Button variant="secondary" block disabled className="opt">
          <span className="opt-title">{EN.playAgainstFriend}</span>
          <span className="opt-sub">{EN.needsOnchain}</span>
        </Button>
        <Button variant="secondary" block disabled className="opt">
          <span className="opt-title">{EN.openMatch}</span>
          <span className="opt-sub">{EN.comingSoon}</span>
        </Button>

        <Button variant="secondary" block onClick={onBack}>
          {EN.backToMenu}
        </Button>
      </div>

      <div className="build-note">
        Bot strategy mirrors docs/computer-opponent-design.md (easy · normal · hard)
      </div>
    </div>
  );
}
