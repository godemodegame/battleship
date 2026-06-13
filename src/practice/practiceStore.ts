import { create } from 'zustand'
import { FLEET, cellLabel } from '../game/constants'
import { autoPlaceFleet, canPlace, isFleetComplete, rotated } from '../game/board'
import { applyAttack, createMatch, sunkHalo } from '../game/engine'
import { chooseBotTarget } from '../game/bot'
import type { Difficulty, MatchState, Orientation, Placement, Side } from '../game/types'
import { sfx } from '../lib/sfx'
import { botBattleCopy, resultCopy } from '../copy/en'
import { comicResultFor, type ComicResultSfx } from '../lib/comicSfx'

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
  comic?: ComicResultSfx
}

/**
 * Optional async bridge that mirrors the local battle on-chain. When set (only
 * by the on-chain bot match route), `fire()` interleaves contract writes with
 * the local visual sequence: it submits the player's shot, takes the bot's cell
 * FROM the contract (never the local bot), and lets the route auto-finalize. The
 * default is `null`, so practice mode behaves exactly as before — every call
 * site is guarded.
 */
export interface BattleDriver {
  /** Submit the player's shot on-chain (attack) and finalize it. Throws on failure. */
  submitPlayerShot: (cell: number) => Promise<void>
  /** Run the bot's move on-chain (executeBotMove); resolves to the contract-chosen cell. */
  resolveBotShot: () => Promise<number>
  /** Drive the on-chain forfeit; the route refetch lands the terminal summary. */
  forfeit?: () => Promise<void>
  /** Toggle the "confirming on-chain" indicator (e.g. while a write settles). */
  onConfirming?: (active: boolean) => void
  /** Surface a driver error to the caller (logging / diagnostics). */
  onError?: (message: string) => void
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
  /** True while a shot/turn is settling on-chain (bot-match route only). */
  confirming: boolean
  /** On-chain mirror for the bot match; null in practice mode. */
  battleDriver: BattleDriver | null
  effects: EffectSpec[]
  projectiles: ProjectileSpec[]
  toast: Toast | null
  forfeited: boolean

  setBattleDriver: (driver: BattleDriver | null) => void
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
    confirming: false,
    battleDriver: null,
    effects: [],
    projectiles: [],
    toast: null,
    forfeited: false,
  })
}

/** Toast shown when an on-chain mirror write fails mid-battle (driver path). */
function driverErrorToast(): Toast {
  return { id: nextId++, text: botBattleCopy.syncFailed, tone: 'red' }
}

function shotToast(result: 'miss' | 'hit' | 'sunk', by: Side, label: string | undefined): Toast {
  const yours = by === 'player'
  const id = nextId++
  const comic = comicResultFor(result, id)
  if (result === 'miss') return { id, text: resultCopy.miss, tone: 'cyan', comic }
  if (result === 'hit') return { id, text: resultCopy.hit, tone: yours ? 'amber' : 'red', comic }
  const ship = label ?? 'ship'
  return {
    id,
    text: yours ? resultCopy.sunkEnemy(ship) : resultCopy.sunkYours(ship),
    tone: yours ? 'amber' : 'red',
    comic,
  }
}

export const useStore = create<AppState>((set, get) => {
  const sessionAborted = (sessionId: number) => practiceSessionId !== sessionId

  /**
   * True when the battle this shot belongs to is no longer running (forfeit, rematch).
   * We intentionally do NOT test match.winner here: a winning shot sets the winner
   * inside resolveShot, and the post-impact interrupted() check must still let that
   * shot resolve as 'won' rather than 'aborted'. Every winner-setting path also leaves
   * the 'battle' screen, so the screen check already covers finished matches.
   */
  const battleLeft = () => get().screen !== 'battle' || !get().match

  const interrupted = (sessionId: number) => sessionAborted(sessionId) || battleLeft()

  /**
   * Clears busy after an interrupted shot — but only while this session is still
   * active. resetPracticeState() bumps practiceSessionId; if a newer practice session
   * has already started its own fire() (busy:true), clearing busy here would clobber it
   * and allow a concurrent fire(). Skip the reset when the session is stale.
   */
  const releaseBusy = (sessionId: number) => {
    if (!sessionAborted(sessionId)) set({ busy: false })
  }

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
    confirming: false,
    battleDriver: null,
    effects: [],
    projectiles: [],
    toast: null,
    forfeited: false,

    setBattleDriver: (battleDriver) => set({ battleDriver }),
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
      const { match, busy, selectedCell, difficulty, battleDriver } = get()
      if (!match || match.winner || busy || match.turn !== 'player') return
      if (selectedCell === null || match.boards.bot.shots[selectedCell] !== 0) return
      const cell = selectedCell
      set({ busy: true, selectedCell: null })

      // On-chain mirror: kick off the player's attack+finalize in parallel with
      // the local animation so the transaction latency overlaps the projectile
      // flight. The local result already matches what the contract will finalize
      // (both sides hold the same fleets), so the animation never waits on it.
      const playerMirror = battleDriver
        ? battleDriver.submitPlayerShot(cell).then(
            () => true,
            (err: unknown) => {
              battleDriver.onError?.(err instanceof Error ? err.message : String(err))
              return false
            },
          )
        : null

      const result = await resolveShot('player', cell, sessionId)
      if (result === 'aborted' || interrupted(sessionId)) {
        releaseBusy(sessionId)
        return
      }

      // The contract serializes turns: wait for the player's shot to settle
      // on-chain before advancing. The local boards already reflect the outcome.
      if (playerMirror) {
        battleDriver?.onConfirming?.(true)
        set({ confirming: true })
        const ok = await playerMirror
        battleDriver?.onConfirming?.(false)
        set({ confirming: false })
        if (!ok) {
          set({ toast: driverErrorToast() })
          releaseBusy(sessionId)
          return
        }
        if (interrupted(sessionId)) {
          releaseBusy(sessionId)
          return
        }
      }

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
      if (interrupted(sessionId)) {
        releaseBusy(sessionId)
        return
      }

      while (get().match?.turn === 'bot') {
        let target: number
        if (battleDriver) {
          // Authoritative: the contract picks the bot's cell. Run it on-chain,
          // read the chosen cell back, then animate that exact shot locally so
          // the boards stay in lockstep with the chain.
          battleDriver.onConfirming?.(true)
          set({ confirming: true })
          let botCell: number | null
          try {
            botCell = await battleDriver.resolveBotShot()
          } catch (err) {
            battleDriver.onError?.(err instanceof Error ? err.message : String(err))
            botCell = null
          } finally {
            battleDriver.onConfirming?.(false)
            set({ confirming: false })
          }
          if (botCell === null) {
            set({ toast: driverErrorToast() })
            releaseBusy(sessionId)
            return
          }
          if (interrupted(sessionId)) {
            releaseBusy(sessionId)
            return
          }
          target = botCell
        } else {
          target = chooseBotTarget(get().match!.boards.player, difficulty, randomSource)
        }
        const botResult = await resolveShot('bot', target, sessionId)
        if (botResult === 'aborted' || interrupted(sessionId)) {
          releaseBusy(sessionId)
          return
        }
        if (botResult === 'won') {
          sfx.lose()
          set({ screen: 'gameover', busy: false })
          return
        }
        if (botResult === 'miss') break

        await delay(350 + randomSource() * 350)
        if (interrupted(sessionId)) {
          releaseBusy(sessionId)
          return
        }
      }

      set({ focus: 'enemy' })
      await delay(SWING_MS / 2)
      if (interrupted(sessionId)) {
        releaseBusy(sessionId)
        return
      }
      set({ busy: false })
    },

    forfeit: () => {
      const { match, battleDriver } = get()
      if (!match || match.winner) return
      if (battleDriver?.forfeit) {
        // On-chain forfeit: the route refetch lands the terminal summary.
        void battleDriver.forfeit()
        return
      }
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

// Expose the practice store globally for E2E tests (which run against the production
// preview build in CI) and for manual debugging in dev tools. This is safe: it only
// provides access to in-memory game state for the local practice mode.
;(window as unknown as { __store: typeof useStore }).__store = useStore

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
