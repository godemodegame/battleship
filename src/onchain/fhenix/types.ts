import type { HexAddress } from '../phaseResolver'

export interface CofheScope {
  address: HexAddress
  chainId: number
  deploymentId: string
  matchId: bigint
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

export type CofheProgress =
  | 'initializing'
  | 'extract'
  | 'pack'
  | 'prove'
  | 'verify'
  | 'replace'
  | 'done'

export interface CofheFleetEncryptor {
  readonly execution: 'worker' | 'main-thread'
  readonly scopeKey: string
  initialize(): Promise<void>
  encryptFleet(
    segments: readonly number[],
    onProgress?: (progress: CofheProgress) => void,
  ): Promise<readonly EncryptedFleetSegment[]>
  dispose(): void
}
