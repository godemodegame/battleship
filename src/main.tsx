import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { preloadAll } from "./three/models";
import { useGame } from "./game/store";
import "./styles.css";

// Warm the FBX cache so the field loading gate reflects real progress.
preloadAll();

if (import.meta.env.DEV) (window as unknown as { useGame: typeof useGame }).useGame = useGame;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
