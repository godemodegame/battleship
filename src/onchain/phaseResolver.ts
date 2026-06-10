/**
 * Pure on-chain match phase resolver.
 *
 * This module translates wallet + network + public contract-derived MatchView
 * into a UI phase. It must remain free of local practice engine logic
 * (no imports from ../game/engine or ../game/bot).
 *
 * The input shape is intentionally small and will be populated by future
 * contract read clients. All values are public on-chain data.
 *
 * NOTE: Address is a simple branded hex string for now. When the contract
 * client layer lands it can be re-exported from a shared viem-compatible type.
 */

export type Address = `0x${string}`

export type HexAddress = Address

export type MatchStatus =
  | 'WaitingForOpponent'
  | 'WaitingForPlacement'
  | 'ValidatingPlacement'
  | 'ReadyToStart'
  | 'InProgress'
  | 'ResolvingShot'
  | 'Finished'
  | 'Cancelled'
  | 'Forfeited'

export interface MatchView {
  /** Logical deployment/version key, e.g. "arb-sepolia-v1" */
  deploymentId: string
  matchId: string
  status: MatchStatus
  creator: HexAddress | null
  opponent: HexAddress | null
  invitedOpponent: HexAddress | null
  /** Current turn address when InProgress or ResolvingShot */
  currentTurn: HexAddress | null
  winner: HexAddress | null
}

export interface PhaseResolverInput {
  hasWallet: boolean
  walletAddress: HexAddress | null
  isCorrectChain: boolean
  /** Null when the match cannot be loaded (404 or error) */
  match: MatchView | null
}

export type MatchPhase =
  | { kind: 'wallet-required' }
  | { kind: 'wrong-network' }
  | { kind: 'not-found' }
  | { kind: 'join' }
  | { kind: 'waiting-for-opponent' }
  | {
      kind: 'placement'
      /** Can the connected player submit a fleet right now? */
      canSubmit: boolean
      /** Has the connected player already submitted? */
      submitted: boolean
      /** Both players submitted but not yet validated/started */
      waitingForOpponent: boolean
      validating: boolean
    }
  | { kind: 'battle'; isMyTurn: boolean }
  | { kind: 'resolving' }
  | { kind: 'finished'; youWon: boolean | null }
  | { kind: 'cancelled' }
  | { kind: 'forfeited' }
  | { kind: 'unavailable' }

function norm(addr: HexAddress | null | undefined): string | null {
  if (!addr) return null
  return addr.toLowerCase()
}

/**
 * Resolve the current UI phase for a match route.
 * Pure and synchronous; safe to call from render and from tests.
 */
export function resolveMatchPhase(input: PhaseResolverInput): MatchPhase {
  const { hasWallet, walletAddress, isCorrectChain, match } = input

  if (!hasWallet || !walletAddress) {
    return { kind: 'wallet-required' }
  }
  if (!isCorrectChain) {
    return { kind: 'wrong-network' }
  }
  if (!match) {
    return { kind: 'not-found' }
  }

  const me = norm(walletAddress)
  const isCreator = norm(match.creator) === me
  const isOpponent = norm(match.opponent) === me
  const isInvited = norm(match.invitedOpponent) === me
  const isParticipant = isCreator || isOpponent || isInvited

  // Only the invited wallet should be offered the join action while waiting.
  // For all other active phases (placement, battle, resolving), a non-participant
  // (e.g. a spectator or unrelated wallet) must not receive actionable UI state.
  // They see a safe passive state instead. (Creator/opponent/invited fields on
  // MatchView exist precisely for this; real contract data will populate them.)

  switch (match.status) {
    case 'WaitingForOpponent': {
      if (isInvited && !match.opponent) {
        return { kind: 'join' }
      }
      return { kind: 'waiting-for-opponent' }
    }

    case 'WaitingForPlacement':
    case 'ValidatingPlacement':
    case 'ReadyToStart': {
      if (!isParticipant) {
        return { kind: 'waiting-for-opponent' }
      }
      if (match.status === 'WaitingForPlacement') {
        // In the initial on-chain shell (GAME-103) we return a simple actionable placement phase.
        // Later client code will map real per-player PlacementStatus here.
        return {
          kind: 'placement',
          canSubmit: true,
          submitted: false,
          waitingForOpponent: false,
          validating: false,
        }
      }
      if (match.status === 'ValidatingPlacement') {
        return {
          kind: 'placement',
          canSubmit: false,
          submitted: true,
          waitingForOpponent: true,
          validating: true,
        }
      }
      return {
        kind: 'placement',
        canSubmit: false,
        submitted: true,
        waitingForOpponent: true,
        validating: false,
      }
    }

    case 'InProgress': {
      if (!isParticipant) {
        return { kind: 'waiting-for-opponent' }
      }
      const myTurn = norm(match.currentTurn) === me
      return { kind: 'battle', isMyTurn: myTurn }
    }

    case 'ResolvingShot': {
      if (!isParticipant) {
        return { kind: 'waiting-for-opponent' }
      }
      return { kind: 'resolving' }
    }

    case 'Finished': {
      // Only a participant (creator or opponent) can have a meaningful youWon true/false.
      // Spectators / non-participants get null ("match finished" from their perspective).
      const youWon = isParticipant && match.winner ? norm(match.winner) === me : null
      return { kind: 'finished', youWon }
    }

    case 'Cancelled': {
      return { kind: 'cancelled' }
    }

    case 'Forfeited': {
      return { kind: 'forfeited' }
    }

    default: {
      return { kind: 'unavailable' }
    }
  }
}

/** Human label for a phase, suitable for banners or debug UI. */
export function phaseLabel(phase: MatchPhase): string {
  switch (phase.kind) {
    case 'wallet-required':
      return 'Connect wallet to continue'
    case 'wrong-network':
      return 'Switch to Arbitrum Sepolia'
    case 'not-found':
      return 'Match not found'
    case 'join':
      return 'Join this match'
    case 'waiting-for-opponent':
      return 'Waiting for opponent to join'
    case 'placement':
      if (phase.validating) return 'Validating fleets'
      if (phase.waitingForOpponent) return 'Waiting for opponent fleet'
      if (phase.submitted) return 'Fleet submitted'
      return 'Place your fleet'
    case 'battle':
      return phase.isMyTurn ? 'Your turn' : "Opponent's turn"
    case 'resolving':
      return 'Resolving shot'
    case 'finished':
      return phase.youWon === true ? 'You won' : phase.youWon === false ? 'You lost' : 'Match finished'
    case 'cancelled':
      return 'Match cancelled'
    case 'forfeited':
      return 'Match forfeited'
    case 'unavailable':
    default:
      return 'Match unavailable'
  }
}
