/**
 * Chain → frontend match view mapping (GAME-503).
 *
 * `getMatch` returns the Solidity `MatchView` struct with numeric enums,
 * zero-address sentinels, and bigint timestamps. This module converts it into
 * the string-status `MatchView` consumed by `resolveMatchPhase`, extended with
 * the public metadata Phase 5 UI needs (deadlines, move counts, timestamps).
 *
 * Pure and synchronous; the only on-chain shape it understands is the struct
 * from the generated ABI (`src/onchain/abi/battleshipGame.ts`).
 */

import type { HexAddress, MatchStatus, MatchView } from '../phaseResolver'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

/** Solidity `MatchStatus` enum, by index. Index 0 (`None`) means "not found". */
const STATUS_BY_INDEX: ReadonlyArray<MatchStatus | null> = [
  null, // None
  'WaitingForOpponent',
  'WaitingForPlacement',
  'ValidatingPlacement',
  'ReadyToStart',
  'InProgress',
  'ResolvingShot',
  'Finished',
  'Cancelled',
  'Forfeited',
]

/** Solidity `MatchType` enum, by index. */
const MATCH_TYPE_BY_INDEX = ['Friend', 'Open', 'Bot'] as const
export type MatchTypeName = (typeof MATCH_TYPE_BY_INDEX)[number]

/** Public deadline block (unix seconds; 0 = not set). */
export interface MatchDeadlines {
  joinDeadline: number
  placementDeadline: number
  turnDeadline: number
  resolvingDeadline: number
}

/**
 * Frontend view of one on-chain match: the resolver's `MatchView` plus the
 * public metadata used by lobby states, timeout displays, and identity panels.
 */
export interface ChainMatchView extends MatchView {
  /** On-chain match id as bigint (`matchId` keeps the route string form). */
  matchIdBig: bigint
  matchType: MatchTypeName
  createdAt: number
  joinedAt: number
  startedAt: number
  finishedAt: number
  lastActionAt: number
  moveCount: number
  pendingMoveId: number
  deadlines: MatchDeadlines
  /** Authoritative public player state, loaded alongside getMatch in Phase 6. */
  players?: MatchPlayersView
}

const PLACEMENT_STATUS_BY_INDEX = [
  'None',
  'NotSubmitted',
  'Submitted',
  'ResolvingValidation',
  'Valid',
  'Invalid',
] as const

export type PlacementStatusName = (typeof PLACEMENT_STATUS_BY_INDEX)[number]

export interface PublicBoardView {
  attackedMask: bigint
  missMask: bigint
  hitMask: bigint
  sunkMask: bigint
}

export interface ChainPlayerView {
  player: HexAddress | null
  joined: boolean
  placementStatus: PlacementStatusName
  fleetSubmitted: boolean
  fleetValid: boolean
  publicBoard: PublicBoardView
}

export interface MatchPlayersView {
  creator: ChainPlayerView
  opponent: ChainPlayerView
}

export interface RawPlayerPublicView {
  player: `0x${string}`
  joined: boolean
  placementStatus: number
  fleetSubmitted: boolean
  fleetValid: boolean
  publicBoard: PublicBoardView
}

/** Structural type of the raw `getMatch` tuple as decoded by viem. */
export interface RawMatchView {
  id: bigint
  matchType: number
  status: number
  creator: `0x${string}`
  opponent: `0x${string}`
  invitedOpponent: `0x${string}`
  currentTurn: `0x${string}`
  winner: `0x${string}`
  createdAt: bigint
  joinedAt: bigint
  startedAt: bigint
  finishedAt: bigint
  lastActionAt: bigint
  moveCount: number
  pendingMoveId: number
  timeoutState: {
    joinDeadline: bigint
    placementDeadline: bigint
    turnDeadline: bigint
    resolvingDeadline: bigint
  }
}

function addressOrNull(value: `0x${string}`): HexAddress | null {
  if (!value || value.toLowerCase() === ZERO_ADDRESS) return null
  return value.toLowerCase() as HexAddress
}

/**
 * Convert the raw struct into a `ChainMatchView`, or `null` when the struct
 * describes a non-existent match (`status == None`, defensive — the contract
 * reverts with `MatchNotFound` before returning such a struct).
 */
export function toChainMatchView(
  raw: RawMatchView,
  deploymentId: string,
): ChainMatchView | null {
  const status = STATUS_BY_INDEX[raw.status] ?? null
  if (!status) return null
  return {
    deploymentId,
    matchId: raw.id.toString(),
    matchIdBig: raw.id,
    status,
    matchType: MATCH_TYPE_BY_INDEX[raw.matchType] ?? 'Friend',
    creator: addressOrNull(raw.creator),
    opponent: addressOrNull(raw.opponent),
    invitedOpponent: addressOrNull(raw.invitedOpponent),
    currentTurn: addressOrNull(raw.currentTurn),
    winner: addressOrNull(raw.winner),
    createdAt: Number(raw.createdAt),
    joinedAt: Number(raw.joinedAt),
    startedAt: Number(raw.startedAt),
    finishedAt: Number(raw.finishedAt),
    lastActionAt: Number(raw.lastActionAt),
    moveCount: raw.moveCount,
    pendingMoveId: raw.pendingMoveId,
    deadlines: {
      joinDeadline: Number(raw.timeoutState.joinDeadline),
      placementDeadline: Number(raw.timeoutState.placementDeadline),
      turnDeadline: Number(raw.timeoutState.turnDeadline),
      resolvingDeadline: Number(raw.timeoutState.resolvingDeadline),
    },
  }
}

export function toChainPlayerView(raw: RawPlayerPublicView): ChainPlayerView {
  return {
    player: addressOrNull(raw.player),
    joined: raw.joined,
    placementStatus: PLACEMENT_STATUS_BY_INDEX[raw.placementStatus] ?? 'None',
    fleetSubmitted: raw.fleetSubmitted,
    fleetValid: raw.fleetValid,
    publicBoard: {
      attackedMask: raw.publicBoard.attackedMask,
      missMask: raw.publicBoard.missMask,
      hitMask: raw.publicBoard.hitMask,
      sunkMask: raw.publicBoard.sunkMask,
    },
  }
}

export function toMatchPlayersView(
  raw: readonly [RawPlayerPublicView, RawPlayerPublicView],
): MatchPlayersView {
  return {
    creator: toChainPlayerView(raw[0]),
    opponent: toChainPlayerView(raw[1]),
  }
}

/**
 * Parse the `:matchId` route segment into an on-chain id. Returns `null` for
 * anything that is not a plain positive decimal integer (contract ids start
 * at 1), so demo and malformed ids never reach a contract read.
 */
export function parseMatchIdParam(param: string | undefined | null): bigint | null {
  if (!param || !/^[0-9]{1,78}$/.test(param)) return null
  const id = BigInt(param)
  return id > 0n ? id : null
}

/**
 * True when the match is still waiting for the invited opponent but its join
 * deadline has passed (GAME-508 "expired" state). `nowSeconds` is injected so
 * UI tests stay deterministic.
 */
export function isJoinExpired(view: ChainMatchView, nowSeconds: number): boolean {
  return (
    view.status === 'WaitingForOpponent' &&
    view.opponent === null &&
    view.deadlines.joinDeadline > 0 &&
    nowSeconds > view.deadlines.joinDeadline
  )
}
