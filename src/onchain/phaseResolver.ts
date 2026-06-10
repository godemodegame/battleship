/**
 * Pure on-chain match phase resolver.
 *
 * NOTE: Address is a simple branded hex string for now. When the contract
 * client layer lands it can be re-exported from a shared viem-compatible type.
 */

export type Address = `0x${string}`

/**
 * Pure on-chain match phase resolver.
 *
 * This module translates wallet + network + public contract-derived MatchView
 * into a UI phase. It must remain free of local practice engine logic
 * (no imports from ../game/engine or ../game/bot).
 *
 * The input shape is intentionally small and will be populated by future
 * contract read clients. All values are public on-chain data.
 */

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
  | { kind: 'loading' }
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
  const isInvited = norm(match.invitedOpponent) === me
  // Creator / opponent checks are available for future per-player placement status.
  // Currently only used indirectly via demo data and later slices.

  switch (match.status) {
    case 'WaitingForOpponent': {
      // Only the invited wallet should be offered the join action
      if (isInvited && !match.opponent) {
        return { kind: 'join' }
      }
      return { kind: 'waiting-for-opponent' }
    }

    case 'WaitingForPlacement': {
      // In the GAME-102 slice we return a simple actionable placement phase.
      // Later client code will map real per-player PlacementStatus here.
      return {
        kind: 'placement',
        canSubmit: true,
        submitted: false,
        waitingForOpponent: false,
        validating: false,
      }
    }

    case 'ValidatingPlacement': {
      return {
        kind: 'placement',
        canSubmit: false,
        submitted: true,
        waitingForOpponent: true,
        validating: true,
      }
    }

    case 'ReadyToStart': {
      return {
        kind: 'placement',
        canSubmit: false,
        submitted: true,
        waitingForOpponent: true,
        validating: false,
      }
    }

    case 'InProgress': {
      const myTurn = norm(match.currentTurn) === me
      return { kind: 'battle', isMyTurn: myTurn }
    }

    case 'ResolvingShot': {
      return { kind: 'resolving' }
    }

    case 'Finished': {
      const youWon = match.winner ? norm(match.winner) === me : null
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
    case 'loading':
      return 'Loading match'
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
