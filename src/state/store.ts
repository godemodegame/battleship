import { create } from 'zustand'
import { FLEET, cellLabel } from '../game/constants'
import { autoPlaceFleet, canPlace, isFleetComplete, rotated } from '../game/board'
import { applyAttack, createMatch, sunkHalo } from '../game/engine'
import { chooseBotTarget } from '../game/bot'
import type { Difficulty, MatchState, Orientation, Placement, Side } from '../game/types'
import { sfx } from '../lib/sfx'

export type Screen = 'home' | 'placement' | 'battle' | 'gameover'

/** Which board the camera frames during battle. */
export type Focus = 'enemy' | 'player'

export interface EffectSpec {
  id: number
  kind: 'hit' | 'miss' | 'sunk'
  /** Board the effect plays on (the board that was shot). */
  board: Side
  cell: number
}

export interface ProjectileSpec {
  id: number
  /** Side that fired; the projectile flies toward the opposing board. */
  from: Side
  cell: number
}

export interface Toast {
  id: number
  text: string
  tone: 'cyan' | 'red' | 'amber'
}

interface AppState {
  screen: Screen
  difficulty: Difficulty
  howItWorksOpen: boolean

  // Placement
  placements: (Placement | null)[]
  selectedSlot: number | null
  placeOrientation: Orientation

  // Battle
  match: MatchState | null
  focus: Focus
  selectedCell: number | null
  busy: boolean
  effects: EffectSpec[]
  projectiles: ProjectileSpec[]
  toast: Toast | null
  forfeited: boolean

  setDifficulty: (d: Difficulty) => void
  setHowItWorksOpen: (open: boolean) => void
  startPlacement: () => void
  selectSlot: (slot: number | null) => void
  rotateSelected: () => void
  placeAt: (row: number, col: number) => void
  pickUpAt: (cell: number) => void
  autoPlace: () => void
  clearPlacement: () => void
  confirmFleet: () => void
  selectCell: (cell: number | null) => void
  fire: () => Promise<void>
  forfeit: () => void
  removeEffect: (id: number) => void
  rematch: () => void
  toHome: () => void
}

const FLIGHT_MS = 620
const IMPACT_MS = 950
const SUNK_MS = 1400
const SWING_MS = 750

let nextId = 1
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
let randomSource = Math.random
let practiceSessionId = 0

/** Allows deterministic practice orchestration in tests without patching globals. */
export function setPracticeRandomSource(rnd: () => number = Math.random) {
  randomSource = rnd
}

/** Resets practice flow state when leaving the practice route. */
export function resetPracticeState() {
  practiceSessionId++
  useStore.setState({
    screen: 'home',
    difficulty: 'normal',
    howItWorksOpen: false,
    placements: FLEET.map(() => null),
    selectedSlot: null,
    placeOrientation: 'h',
    match: null,
    focus: 'enemy',
    selectedCell: null,
    busy: false,
    effects: [],
    projectiles: [],
    toast: null,
    forfeited: false,
  })
}

function shotToast(result: 'miss' | 'hit' | 'sunk', by: Side, label: string | undefined): Toast {
  const yours = by === 'player'
  if (result === 'miss') return { id: nextId++, text: 'Miss', tone: 'cyan' }
  if (result === 'hit') return { id: nextId++, text: 'Hit', tone: yours ? 'amber' : 'red' }
  return {
    id: nextId++,
    text: yours ? `Sunk — enemy ${label} destroyed` : `Sunk — your ${label} is lost`,
    tone: yours ? 'amber' : 'red',
  }
}

export const useStore = create<AppState>((set, get) => {
  const sessionAborted = (sessionId: number) => practiceSessionId !== sessionId

  /** True when the battle this shot belongs to is no longer running (forfeit, rematch). */
  const battleLeft = () => get().screen !== 'battle' || !get().match

  const interrupted = (sessionId: number) => sessionAborted(sessionId) || battleLeft()

  /** Plays one shot's full visual sequence and applies it to the match. */
  async function resolveShot(
    by: Side,
    cell: number,
    sessionId: number,
  ): Promise<'miss' | 'hit' | 'sunk' | 'won' | 'aborted'> {
    const projectile: ProjectileSpec = { id: nextId++, from: by, cell }
    set((s) => ({ projectiles: [...s.projectiles, projectile] }))
    sfx.fire()
    await delay(FLIGHT_MS)
    set((s) => ({ projectiles: s.projectiles.filter((p) => p.id !== projectile.id) }))
    if (interrupted(sessionId)) return 'aborted'

    const { match, move } = applyAttack(get().match!, by, cell)
    const defender: Side = by === 'player' ? 'bot' : 'player'
    const shipLabel =
      move.shipSlot === null ? undefined : FLEET[move.shipSlot].label.toLowerCase()
    set((s) => ({
      match,
      effects: [...s.effects, { id: nextId++, kind: move.result, board: defender, cell }],
      toast: shotToast(move.result, by, shipLabel),
    }))
    sfx[move.result]()

    await delay(move.result === 'sunk' ? SUNK_MS : IMPACT_MS)
    if (interrupted(sessionId)) return 'aborted'
    return match.winner ? 'won' : move.result
  }

  return {
    screen: 'home',
    difficulty: 'normal',
    howItWorksOpen: false,

    placements: FLEET.map(() => null),
    selectedSlot: null,
    placeOrientation: 'h',

    match: null,
    focus: 'enemy',
    selectedCell: null,
    busy: false,
    effects: [],
    projectiles: [],
    toast: null,
    forfeited: false,

    setDifficulty: (difficulty) => set({ difficulty }),
    setHowItWorksOpen: (howItWorksOpen) => set({ howItWorksOpen }),

    startPlacement: () => {
      sfx.ui()
      set({
        screen: 'placement',
        placements: FLEET.map(() => null),
        selectedSlot: 0,
        placeOrientation: 'h',
        match: null,
        effects: [],
        projectiles: [],
        toast: null,
        selectedCell: null,
        forfeited: false,
        busy: false,
        focus: 'player',
      })
    },

    selectSlot: (selectedSlot) => set({ selectedSlot }),

    rotateSelected: () => set((s) => ({ placeOrientation: rotated(s.placeOrientation) })),

    placeAt: (row, col) => {
      const { placements, selectedSlot, placeOrientation } = get()
      if (selectedSlot === null) return
      const candidate: Placement = { slot: selectedSlot, row, col, orientation: placeOrientation }
      if (!canPlace(placements, candidate)) {
        sfx.deny()
        return
      }
      const next = placements.slice()
      next[selectedSlot] = candidate
      const nextEmpty = next.findIndex((p) => p === null)
      sfx.place()
      set({ placements: next, selectedSlot: nextEmpty === -1 ? null : nextEmpty })
    },

    pickUpAt: (cell) => {
      const { placements } = get()
      for (const p of placements) {
        if (!p) continue
        const cells = new Set<number>()
        for (let i = 0; i < FLEET[p.slot].length; i++) {
          const r = p.row + (p.orientation === 'v' ? i : 0)
          const c = p.col + (p.orientation === 'h' ? i : 0)
          cells.add(r * 10 + c)
        }
        if (cells.has(cell)) {
          const next = placements.slice()
          next[p.slot] = null
          sfx.ui()
          set({ placements: next, selectedSlot: p.slot, placeOrientation: p.orientation })
          return
        }
      }
    },

    autoPlace: () => {
      sfx.place()
      set({ placements: autoPlaceFleet(randomSource), selectedSlot: null })
    },

    clearPlacement: () => {
      sfx.ui()
      set({ placements: FLEET.map(() => null), selectedSlot: 0 })
    },

    confirmFleet: () => {
      const { placements } = get()
      if (!isFleetComplete(placements)) return
      sfx.confirm()
      set({
        screen: 'battle',
        match: createMatch(placements, autoPlaceFleet(randomSource)),
        focus: 'enemy',
        selectedCell: null,
        busy: false,
        toast: null,
      })
    },

    selectCell: (cell) => {
      const { match, busy } = get()
      if (!match || match.winner || busy || match.turn !== 'player') return
      if (
        cell !== null &&
        (match.boards.bot.shots[cell] !== 0 || sunkHalo(match.boards.bot).has(cell))
      ) {
        sfx.deny()
        return
      }
      if (cell !== null) sfx.ui()
      set({ selectedCell: cell })
    },

    fire: async () => {
      const sessionId = practiceSessionId
      const { match, busy, selectedCell, difficulty } = get()
      if (!match || match.winner || busy || match.turn !== 'player') return
      if (selectedCell === null || match.boards.bot.shots[selectedCell] !== 0) return
      set({ busy: true, selectedCell: null })

      const result = await resolveShot('player', selectedCell, sessionId)
      if (result === 'aborted' || interrupted(sessionId)) return
      if (result === 'won') {
        sfx.win()
        set({ screen: 'gameover', busy: false })
        return
      }
      if (result !== 'miss') {
        set({ focus: 'enemy', busy: false })
        return
      }

      set({ focus: 'player' })
      await delay(SWING_MS + 350 + randomSource() * 500)
      if (interrupted(sessionId)) return

      while (get().match?.turn === 'bot') {
        const target = chooseBotTarget(get().match!.boards.player, difficulty, randomSource)
        const botResult = await resolveShot('bot', target, sessionId)
        if (botResult === 'aborted' || interrupted(sessionId)) return
        if (botResult === 'won') {
          sfx.lose()
          set({ screen: 'gameover', busy: false })
          return
        }
        if (botResult === 'miss') break

        await delay(350 + randomSource() * 350)
        if (interrupted(sessionId)) return
      }

      set({ focus: 'enemy' })
      await delay(SWING_MS / 2)
      if (interrupted(sessionId)) return
      set({ busy: false })
    },

    forfeit: () => {
      const { match } = get()
      if (!match || match.winner) return
      sfx.lose()
      set({
        forfeited: true,
        match: { ...match, winner: 'bot' },
        screen: 'gameover',
        busy: false,
      })
    },

    removeEffect: (id) => set((s) => ({ effects: s.effects.filter((e) => e.id !== id) })),

    rematch: () => get().startPlacement(),

    toHome: () => {
      sfx.ui()
      set({ screen: 'home', match: null, effects: [], projectiles: [], toast: null })
    },
  }
})

if (import.meta.env.DEV) {
  ;(window as unknown as { __store: typeof useStore }).__store = useStore
}

/** Battle summary per docs/game-mechanics.md game-over screen. */
export function matchSummary(match: MatchState, forfeited: boolean) {
  const shotsBy = (side: Side) => match.moves.filter((m) => m.by === side)
  const accuracy = (side: Side) => {
    const moves = shotsBy(side)
    if (moves.length === 0) return 0
    return Math.round((moves.filter((m) => m.result !== 'miss').length / moves.length) * 100)
  }
  const shipsLeft = (side: Side) => match.boards[side].ships.filter((s) => !s.sunk).length
  return {
    winner: match.winner,
    forfeited,
    turns: match.moves.length,
    playerShots: shotsBy('player').length,
    botShots: shotsBy('bot').length,
    playerAccuracy: accuracy('player'),
    botAccuracy: accuracy('bot'),
    playerShipsLeft: shipsLeft('player'),
    botShipsLeft: shipsLeft('bot'),
  }
}

export { cellLabel }
