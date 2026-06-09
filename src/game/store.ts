import { create } from "zustand";
import { BoardState } from "./engine";
import { Bot } from "./bot";
import { autoPlaceFleet } from "./fleet";
import { Difficulty, PlacedShip, ShotResult } from "./types";

export type Phase = "entry" | "opponent" | "placement" | "battle" | "gameover";
export type BoardView = "target" | "fleet";
export type Turn = "you" | "enemy";

export type FxKind = "projectile" | "miss" | "hit" | "sunk";
export interface FxEvent {
  id: number;
  kind: FxKind;
  board: BoardView; // "target" = enemy board, "fleet" = player board
  index: number;
}

export interface Move {
  by: Turn;
  index: number;
  result: ShotResult;
  ship?: string;
}

export interface ResultBanner {
  result: ShotResult;
  text: string;
  by: Turn;
}

interface Store {
  phase: Phase;
  difficulty: Difficulty;
  view: BoardView;
  turn: Turn;
  resolving: boolean;

  // boards
  playerShips: PlacedShip[]; // local layout during placement + your real fleet
  playerBoard: BoardState | null; // your fleet, attacked by enemy (fleet view)
  enemyBoard: BoardState | null; // enemy fleet, attacked by you (target view)
  bot: Bot | null;

  selectedTarget: number | null;
  moves: Move[];
  banner: ResultBanner | null;
  winner: Turn | null;

  // VFX queue consumed by the 3D layer
  effects: FxEvent[];

  // internal: cancels pending timers when the match resets
  runId: number;

  // actions
  chooseOpponent: () => void;
  start: (difficulty: Difficulty) => void;
  reshuffle: () => void;
  confirmFleet: () => void;
  setView: (v: BoardView) => void;
  selectTarget: (index: number | null) => void;
  fire: () => void;
  clearEffect: (id: number) => void;
  clearBanner: () => void;
  toMenu: () => void;
  playAgain: () => void;
}

let fxId = 1;

const PROJECTILE_MS = 620;
const REVEAL_MS = 520;
const TURN_GAP_MS = 700;
const BOT_THINK_MS = 850;

export const useGame = create<Store>((set, get) => {
  // Schedule work that is cancelled if the match is reset (runId changes).
  const later = (ms: number, fn: () => void) => {
    const myRun = get().runId;
    setTimeout(() => {
      if (get().runId === myRun) fn();
    }, ms);
  };

  const pushFx = (kind: FxKind, board: BoardView, index: number) => {
    set((s) => ({ effects: [...s.effects, { id: fxId++, kind, board, index }] }));
  };

  // Resolve one attack (already validated) on `defender`, run the visual
  // sequence, record history, then either finish or hand over the turn.
  const resolveShot = (by: Turn, index: number) => {
    const { enemyBoard, playerBoard } = get();
    const defender = by === "you" ? enemyBoard! : playerBoard!;
    const board: BoardView = by === "you" ? "target" : "fleet";

    set({ resolving: true });
    pushFx("projectile", board, index);

    later(PROJECTILE_MS, () => {
      const outcome = defender.fire(index);
      const fxKind: FxKind =
        outcome.result === "miss" ? "miss" : outcome.result === "sunk" ? "sunk" : "hit";
      pushFx(fxKind, board, index);

      const move: Move = {
        by,
        index,
        result: outcome.result,
        ship: outcome.ship?.name,
      };
      const banner = bannerFor(by, outcome.result, outcome.ship?.name);
      set((s) => ({ moves: [move, ...s.moves], banner }));

      if (by === "enemy" && get().bot) get().bot!.notify(index, outcome);

      later(REVEAL_MS, () => {
        if (outcome.gameOver) {
          set({ winner: by, resolving: false });
          later(900, () => set({ phase: "gameover" }));
          return;
        }
        // Pass the turn (base rule: turn always alternates).
        later(TURN_GAP_MS, () => {
          if (by === "you") {
            set({ turn: "enemy", resolving: true, view: "fleet", selectedTarget: null });
            later(BOT_THINK_MS, runBotTurn);
          } else {
            set({ turn: "you", resolving: false, view: "target" });
          }
        });
      });
    });
  };

  const runBotTurn = () => {
    const { bot, playerBoard } = get();
    if (!bot || !playerBoard) return;
    const target = bot.chooseTarget(playerBoard);
    resolveShot("enemy", target);
  };

  return {
    phase: "entry",
    difficulty: "normal",
    view: "target",
    turn: "you",
    resolving: false,
    playerShips: [],
    playerBoard: null,
    enemyBoard: null,
    bot: null,
    selectedTarget: null,
    moves: [],
    banner: null,
    winner: null,
    effects: [],
    runId: 0,

    chooseOpponent: () => set({ phase: "opponent" }),

    start: (difficulty) =>
      set((s) => ({
        phase: "placement",
        difficulty,
        playerShips: autoPlaceFleet(),
        runId: s.runId + 1,
        moves: [],
        banner: null,
        winner: null,
        effects: [],
        selectedTarget: null,
        view: "target",
        turn: "you",
        resolving: false,
      })),

    reshuffle: () => set({ playerShips: autoPlaceFleet() }),

    confirmFleet: () => {
      const { playerShips, difficulty } = get();
      set({
        phase: "battle",
        playerBoard: new BoardState(playerShips),
        enemyBoard: new BoardState(autoPlaceFleet()),
        bot: new Bot(difficulty),
        view: "target",
        turn: "you",
        resolving: false,
        selectedTarget: null,
      });
    },

    setView: (v) => set({ view: v }),

    selectTarget: (index) => {
      const { turn, resolving, enemyBoard, phase } = get();
      if (phase !== "battle" || turn !== "you" || resolving) return;
      if (index !== null && enemyBoard?.alreadyAttacked(index)) return;
      set({ selectedTarget: index });
    },

    fire: () => {
      const { selectedTarget, turn, resolving, enemyBoard } = get();
      if (turn !== "you" || resolving || selectedTarget === null) return;
      if (enemyBoard?.alreadyAttacked(selectedTarget)) return;
      const target = selectedTarget;
      set({ selectedTarget: null });
      resolveShot("you", target);
    },

    clearEffect: (id) => set((s) => ({ effects: s.effects.filter((e) => e.id !== id) })),
    clearBanner: () => set({ banner: null }),

    toMenu: () =>
      set((s) => ({
        phase: "entry",
        runId: s.runId + 1,
        playerBoard: null,
        enemyBoard: null,
        bot: null,
        effects: [],
        moves: [],
        banner: null,
        winner: null,
        selectedTarget: null,
        resolving: false,
      })),

    playAgain: () => {
      const { difficulty } = get();
      get().start(difficulty);
    },
  };
});

function bannerFor(by: Turn, result: ShotResult, ship?: string): ResultBanner {
  const mine = by === "you";
  let text: string;
  if (result === "miss") text = "Miss";
  else if (result === "sunk")
    text = mine ? `Sunk — ${ship ?? "ship"}` : `They sank your ${ship ?? "ship"}`;
  else text = "Hit";
  return { result, text, by };
}
