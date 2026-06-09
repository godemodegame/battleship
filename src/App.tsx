import { useGame } from "./game/store";
import { EntryScreen } from "./ui/screens/EntryScreen";
import { OpponentScreen } from "./ui/screens/OpponentScreen";
import { GameShell } from "./ui/GameShell";

export default function App() {
  const phase = useGame((s) => s.phase);
  const chooseOpponent = useGame((s) => s.chooseOpponent);
  const toMenu = useGame((s) => s.toMenu);

  if (phase === "entry") return <EntryScreen onPlay={chooseOpponent} />;
  if (phase === "opponent") return <OpponentScreen onBack={toMenu} />;
  return <GameShell />;
}
