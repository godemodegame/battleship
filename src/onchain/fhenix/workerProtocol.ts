import type {
  CofheProgress,
  CofheScope,
  EncryptedFleetSegment,
} from './types'

export type WorkerCommand =
  | { kind: 'command'; id: number; command: 'initialize'; scope: CofheScope }
  | { kind: 'command'; id: number; command: 'encrypt'; segments: readonly number[] }

export type WorkerInbound =
  | WorkerCommand
  | { kind: 'rpc-result'; id: number; ok: true; value: unknown }
  | { kind: 'rpc-result'; id: number; ok: false; error: string }
  | { kind: 'dispose' }

export type WorkerRpcMethod =
  | 'provider-call'
  | 'provider-send'
  | 'sign-typed-data'
  | 'send-transaction'

export type WorkerOutbound =
  | { kind: 'response'; id: number; ok: true; value?: readonly EncryptedFleetSegment[] }
  | { kind: 'response'; id: number; ok: false; error: string }
  | { kind: 'progress'; id: number; progress: CofheProgress }
  | { kind: 'rpc'; id: number; method: WorkerRpcMethod; args: unknown[] }
