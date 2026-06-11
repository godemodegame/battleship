/**
 * Finalized-shot presentation effects (GAME-706 / GAME-707).
 *
 * Watches the authoritative move history and turns each *finalized* public
 * move into exactly one visual/audio effect, using the idempotent move cursor
 * in `moveFx.ts`. Pending shots never produce an effect — an attack receipt is
 * not a result — and duplicate events, refetches, or re-renders can only
 * produce redundant reads, never a second effect for the same move id.
 *
 * Both the battle panel and the terminal summary mount this hook, so the
 * winning shot still presents when the match jumps straight to Finished.
 */

import { useEffect, useState } from 'react'
import { FLEET } from '../../game/constants'
import { resultCopy } from '../../copy/en'
import { sfx } from '../../lib/sfx'
import { haptics } from '../../lib/haptics'
import type { ChainMatchView, ChainMoveView } from '../client/mapping'
import type { Address } from '../renderModel'
import { takeNewFinalizedMoves } from './moveFx'

export interface ShotFx {
  moveId: number
  cell: number
  result: 'miss' | 'hit' | 'sunk' | 'win'
  /** True when the viewer fired this shot. */
  mine: boolean
  /** Player-facing result line (English copy). */
  text: string
  tone: 'cyan' | 'amber' | 'red'
}

function sunkShipLabel(move: ChainMoveView): string {
  // sunkShipId is 1..10 in the public submission order shared with FLEET.
  return FLEET[move.sunkShipId - 1]?.label ?? 'ship'
}

function toShotFx(move: ChainMoveView, mine: boolean): ShotFx | null {
  switch (move.result) {
    case 'Miss':
      return {
        moveId: move.moveId,
        cell: move.cellIndex,
        result: 'miss',
        mine,
        text: resultCopy.miss,
        tone: 'cyan',
      }
    case 'Hit':
      return {
        moveId: move.moveId,
        cell: move.cellIndex,
        result: 'hit',
        mine,
        text: resultCopy.hit,
        tone: mine ? 'amber' : 'red',
      }
    case 'Sunk':
    case 'Win': {
      const label = sunkShipLabel(move)
      return {
        moveId: move.moveId,
        cell: move.cellIndex,
        result: move.result === 'Win' ? 'win' : 'sunk',
        mine,
        text: mine ? resultCopy.sunkEnemy(label) : resultCopy.sunkYours(label),
        tone: mine ? 'amber' : 'red',
      }
    }
    default:
      return null
  }
}

function playShotSfx(fx: ShotFx): void {
  switch (fx.result) {
    case 'miss':
      sfx.miss()
      haptics.miss()
      break
    case 'hit':
      sfx.hit()
      haptics.hit()
      break
    case 'sunk':
      sfx.sunk()
      haptics.sunk()
      break
    case 'win':
      if (fx.mine) {
        sfx.win()
        haptics.win()
      } else {
        sfx.lose()
        haptics.lose()
      }
      break
  }
}

/**
 * Present new finalized moves once and expose the latest effect for rendering.
 * Returns `null` until a fresh finalized move arrives in this session.
 */
export function useShotFx(match: ChainMatchView, viewer: Address | null): ShotFx | null {
  const [fx, setFx] = useState<ShotFx | null>(null)

  useEffect(() => {
    if (!viewer) return
    const fresh = takeNewFinalizedMoves(
      { deploymentId: match.deploymentId, matchId: match.matchId },
      match.moves ?? [],
    )
    // Burst catch-up (several finalizations between reads) presents only the
    // newest move; boards and history already reflect the rest.
    for (let i = fresh.length - 1; i >= 0; i--) {
      const effect = toShotFx(fresh[i], fresh[i].attacker === viewer)
      if (effect) {
        playShotSfx(effect)
        setFx(effect)
        break
      }
    }
  }, [match.deploymentId, match.matchId, match.moves, viewer])

  return fx
}
