import type { HexAddress } from '../phaseResolver'

export interface CofheScope {
  address: HexAddress
  chainId: number
  deploymentId: string
  /**
   * Contract match id, or a provisional key (e.g. 'new') while a match is being
   * created placement-first and no id exists yet. Used only for the session
   * scope key; ciphertext binds to the account, not the match id.
   */
  matchId: bigint | string
}

export function cofheScopeKey(scope: CofheScope): string {
  return [
    scope.address.toLowerCase(),
    scope.chainId,
    scope.deploymentId,
    scope.matchId.toString(),
  ].join('|')
}

/** Solidity `InEuint8`, produced only by CoFHE. */
export interface EncryptedFleetSegment {
  ctHash: bigint
  securityZone: number
  utype: number
  signature: string
}

/**
 * One threshold-network decrypt result for a globally-allowed ciphertext
 * handle. The contract's `*WithProof` entrypoints verify the network
 * signature on-chain before accepting the plaintext value.
 */
export interface DecryptProof {
  value: bigint
  signature: `0x${string}`
}

/**
 * Encryption pipeline states surfaced to the UI. `initializing`/`done` are
 * ours; the rest mirror the @cofhe/sdk `EncryptStep` values verbatim.
 */
export type CofheProgress =
  | 'initializing'
  | 'initTfhe'
  | 'fetchKeys'
  | 'pack'
  | 'prove'
  | 'verify'
  | 'done'

/**
 * One account/chain/match-bound CoFHE session: encrypts fleet inputs for
 * `submitFleet` and fetches threshold-network decrypt proofs for the
 * `finalize*WithProof` entrypoints.
 */
export interface CofheMatchClient {
  readonly execution: 'worker' | 'main-thread'
  readonly scopeKey: string
  initialize(): Promise<void>
  encryptFleet(
    segments: readonly number[],
    onProgress?: (progress: CofheProgress) => void,
  ): Promise<readonly EncryptedFleetSegment[]>
  fetchDecryptProof(ctHash: bigint): Promise<DecryptProof>
  dispose(): void
}
