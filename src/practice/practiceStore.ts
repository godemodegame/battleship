import { create } from 'zustand'
import { FLEET } from '../game/constants'
import { autoPlaceFleet, canPlace, isFleetComplete, rotated } from '../game/board'
import { applyAttack, applyResolvedShot, createMatch, sunkHalo } from '../game/engine'
import type { ResolvedShot } from '../game/engine'
import { chooseBotTarget } from '../game/bot'
import type { Difficulty, MatchState, Move, Orientation, Placement, Side } from '../game/types'
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
/** The chain-decided result of a player's shot, fed back into the animation. */
export interface PlayerShotOutcome {
  result: 'miss' | 'hit' | 'sunk' | 'won'
  /** FLEET slot of the ship this shot sank, or null when nothing sank. */
  sunkShipSlot: number | null
}

export interface BattleDriver {
  /**
   * Submit the player's shot on-chain (attack + finalize) and resolve to the
   * contract's decrypted outcome. Throws on failure. The animation waits on this
   * outcome, so the player cannot know hit/miss before the transaction.
   */
  submitPlayerShot: (cell: number) => Promise<PlayerShotOutcome>
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
  /**
   * Set when an on-chain mirror write stalled mid-turn and left the battle
   * waiting on the chain (bot-match route only). The HUD swaps the Fire button
   * for a Retry that calls `resumeBattle()`; until then input is gated so the
   * local board can't drift further ahead of the contract.
   */
  driverError: boolean
  /**
   * The player's shot cell that still needs to land on-chain after a stall, or
   * null when only the bot's turn needs resuming. `resumeBattle()` re-sends this
   * shot (idempotently) before draining the bot's turn.
   */
  recoveryCell: number | null
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
  /** Resume a bot match that stalled on an on-chain write (driverError). */
  resumeBattle: () => Promise<void>
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
    driverError: false,
    recoveryCell: null,
    battleDriver: null,
    effects: [],
    projectiles: [],
    toast: null,
    forfeited: false,
  })
}

/** Toast shown when an on-chain mirror write stalls; recovery is automatic. */
function driverErrorToast(): Toast {
  return { id: nextId++, text: botBattleCopy.reconnectingSub, tone: 'amber' }
}

/**
 * Start the on-chain player shot now — so its latency overlaps the projectile
 * flight — and return a thunk that awaits the contract's decrypted outcome,
 * mapping it to a `ResolvedShot` (or null on a recoverable stall). Shared by
 * `fire()` and `resumeBattle()`.
 */
function driverOutcomeThunk(
  driver: BattleDriver,
  cell: number,
): () => Promise<ResolvedShot | null> {
  const pending = driver.submitPlayerShot(cell)
  // If an interrupt means the thunk is never awaited, swallow the rejection so
  // it never surfaces as an unhandled promise rejection.
  pending.catch(() => {})
  return async () => {
    try {
      const outcome = await pending
      return {
        result: outcome.result === 'won' ? 'sunk' : outcome.result,
        shipSlot: outcome.sunkShipSlot,
        winner: outcome.result === 'won',
      }
    } catch (err) {
      // The stall auto-recovers; forward the cause to the driver's onError sink
      // for diagnostics (no console logging — release config forbids it in src).
      driver.onError?.(err instanceof Error ? err.message : String(err))
      return null
    }
  }
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

  /**
   * Plays one shot's full visual sequence and applies it to the match. Without
   * `resolve` the result is computed locally from fleet geometry (offline
   * practice, and the bot's shots against the player's own known board). With
   * `resolve` (the on-chain player shot) the projectile flies, then the sequence
   * holds in a "resolving" beat until the contract's decrypted outcome lands and
   * is stamped onto the hidden enemy board — so the player never learns hit/miss
   * before the transaction. Returns 'stalled' when that on-chain resolve fails.
   */
  async function resolveShot(
    by: Side,
    cell: number,
    sessionId: number,
    resolve?: () => Promise<ResolvedShot | null>,
  ): Promise<'miss' | 'hit' | 'sunk' | 'won' | 'aborted' | 'stalled'> {
    const projectile: ProjectileSpec = { id: nextId++, from: by, cell }
    set((s) => ({ projectiles: [...s.projectiles, projectile] }))
    sfx.fire()
    await delay(FLIGHT_MS)
    set((s) => ({ projectiles: s.projectiles.filter((p) => p.id !== projectile.id) }))
    if (interrupted(sessionId)) return 'aborted'

    let resolvedMatch: MatchState
    let move: Move
    if (resolve) {
      const driver = get().battleDriver
      driver?.onConfirming?.(true)
      set({ confirming: true })
      let outcome: ResolvedShot | null
      try {
        outcome = await resolve()
      } finally {
        driver?.onConfirming?.(false)
        set({ confirming: false })
      }
      if (outcome === null) return 'stalled'
      if (interrupted(sessionId)) return 'aborted'
      const applied = applyResolvedShot(get().match!, cell, outcome)
      resolvedMatch = applied.match
      move = applied.move
    } else {
      const applied = applyAttack(get().match!, by, cell)
      resolvedMatch = applied.match
      move = applied.move
    }

    const defender: Side = by === 'player' ? 'bot' : 'player'
    const shipLabel =
      move.shipSlot === null ? undefined : FLEET[move.shipSlot].label.toLowerCase()
    set((s) => ({
      match: resolvedMatch,
      effects: [...s.effects, { id: nextId++, kind: move.result, board: defender, cell }],
      toast: shotToast(move.result, by, shipLabel),
    }))
    sfx[move.result]()

    await delay(move.result === 'sunk' ? SUNK_MS : IMPACT_MS)
    if (interrupted(sessionId)) return 'aborted'
    return resolvedMatch.winner ? 'won' : move.result
  }

  /**
   * Drives the bot's turn until control passes back to the player. Shared by the
   * normal `fire()` sequence and the `resumeBattle()` recovery path. On the
   * driver (on-chain) path the contract picks each cell; locally the heuristic
   * does. Returns 'stalled' when an on-chain bot move fails so the caller can
   * surface a recoverable error instead of leaving the turn wedged on the bot.
   */
  async function runBotTurn(
    sessionId: number,
  ): Promise<'passed' | 'won' | 'aborted' | 'stalled'> {
    while (get().match?.turn === 'bot') {
      const battleDriver = get().battleDriver
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
        if (botCell === null) return 'stalled'
        if (interrupted(sessionId)) return 'aborted'
        target = botCell
      } else {
        target = chooseBotTarget(get().match!.boards.player, get().difficulty, randomSource)
      }
      const botResult = await resolveShot('bot', target, sessionId)
      if (botResult === 'aborted' || interrupted(sessionId)) return 'aborted'
      if (botResult === 'won') return 'won'
      if (botResult === 'miss') break

      await delay(350 + randomSource() * 350)
      if (interrupted(sessionId)) return 'aborted'
    }
    return 'passed'
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
    driverError: false,
    recoveryCell: null,
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
        confirming: false,
        driverError: false,
        recoveryCell: null,
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
        confirming: false,
        driverError: false,
        recoveryCell: null,
        toast: null,
      })
    },

    selectCell: (cell) => {
      const { match, busy, driverError } = get()
      if (!match || match.winner || busy || driverError || match.turn !== 'player') return
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
      const { match, busy, selectedCell, battleDriver, driverError } = get()
      // While a stall is pending, the Retry button (resumeBattle) is the only
      // way forward; a fresh shot would push the local board further from chain.
      if (!match || match.winner || busy || driverError || match.turn !== 'player') return
      if (selectedCell === null || match.boards.bot.shots[selectedCell] !== 0) return
      const cell = selectedCell
      set({ busy: true, selectedCell: null })

      // On the driver (on-chain) path the player's result is authoritative on the
      // chain: the shot's attack+finalize is kicked off now so its latency
      // overlaps the projectile flight, and resolveShot then animates the
      // decrypted outcome — the player can't know hit/miss before the tx. Offline
      // practice has no driver and resolves locally from fleet geometry.
      const result = await resolveShot(
        'player',
        cell,
        sessionId,
        battleDriver ? driverOutcomeThunk(battleDriver, cell) : undefined,
      )
      if (result === 'aborted' || interrupted(sessionId)) {
        releaseBusy(sessionId)
        return
      }
      if (result === 'stalled') {
        // The shot never resolved on-chain; remember the cell so Retry re-sends
        // it (idempotently) before the bot replies.
        set({ toast: driverErrorToast(), driverError: true, recoveryCell: cell })
        releaseBusy(sessionId)
        return
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

      const outcome = await runBotTurn(sessionId)
      if (outcome === 'aborted') {
        releaseBusy(sessionId)
        return
      }
      if (outcome === 'won') {
        sfx.lose()
        set({ screen: 'gameover', busy: false })
        return
      }
      if (outcome === 'stalled') {
        // The player's shot already settled on-chain; only the bot's turn needs
        // resuming, so no recovery cell.
        set({ toast: driverErrorToast(), driverError: true, recoveryCell: null })
        releaseBusy(sessionId)
        return
      }

      set({ focus: 'enemy' })
      await delay(SWING_MS / 2)
      if (interrupted(sessionId)) {
        releaseBusy(sessionId)
        return
      }
      set({ busy: false })
    },

    resumeBattle: async () => {
      const sessionId = practiceSessionId
      const { match, busy, battleDriver, driverError } = get()
      if (!battleDriver || !driverError || busy || !match || match.winner) return
      set({ busy: true, driverError: false, toast: null })

      // 1) Re-send the player's shot if it never resolved on-chain, then animate
      // the contract's decrypted outcome. The driver guards on the contract's
      // pending-shot state, so a re-send is safe whether the original attack
      // reverted, was never broadcast, or only the finalize failed.
      const recoveryCell = get().recoveryCell
      if (recoveryCell !== null) {
        const result = await resolveShot(
          'player',
          recoveryCell,
          sessionId,
          driverOutcomeThunk(battleDriver, recoveryCell),
        )
        if (result === 'aborted' || interrupted(sessionId)) {
          releaseBusy(sessionId)
          return
        }
        if (result === 'stalled') {
          set({ toast: driverErrorToast(), driverError: true })
          releaseBusy(sessionId)
          return
        }
        set({ recoveryCell: null })
        // A winning player shot that only now resolved on-chain.
        if (result === 'won') {
          sfx.win()
          set({ screen: 'gameover', busy: false })
          return
        }
      }

      // 2) Drain the bot's turn. A no-op when the player's shot was a hit (turn
      // stays with the player); otherwise it replies until it misses.
      if (get().match?.turn === 'bot') {
        set({ focus: 'player' })
        const outcome = await runBotTurn(sessionId)
        if (outcome === 'aborted') {
          releaseBusy(sessionId)
          return
        }
        if (outcome === 'won') {
          sfx.lose()
          set({ screen: 'gameover', busy: false })
          return
        }
        if (outcome === 'stalled') {
          set({ toast: driverErrorToast(), driverError: true, recoveryCell: null })
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
  const shipsLeft = (side: Side) => {
    const board = match.boards[side]
    // A fully-known board (the player's, or an offline-practice bot) counts its
    // own live hulls. The hidden enemy board's `ships` holds only reconstructed
    // sunk hulls (for rendering), so derive remaining from FLEET minus the slots
    // the attacker's finalized shots have sunk.
    if (!board.hidden) return board.ships.filter((s) => !s.sunk).length
    const attacker: Side = side === 'player' ? 'bot' : 'player'
    const sunk = new Set<number>()
    for (const m of match.moves) {
      if (m.by === attacker && m.result === 'sunk' && m.shipSlot !== null) sunk.add(m.shipSlot)
    }
    return Math.max(0, FLEET.length - sunk.size)
  }
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
