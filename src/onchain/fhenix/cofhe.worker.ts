/// <reference lib="webworker" />

import { cofhejs, Encryptable } from 'cofhejs/web'
import type { AbstractProvider, AbstractSigner } from 'cofhejs/web'
import type { CofheScope, EncryptedFleetSegment } from './types'
import type {
  WorkerInbound,
  WorkerOutbound,
  WorkerRpcMethod,
} from './workerProtocol'

const worker = self as unknown as DedicatedWorkerGlobalScope

let scope: CofheScope | null = null
let rpcId = 0
const pendingRpc = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>()

function post(message: WorkerOutbound) {
  worker.postMessage(message)
}

function rpc(method: WorkerRpcMethod, args: unknown[]): Promise<unknown> {
  const id = ++rpcId
  return new Promise((resolve, reject) => {
    pendingRpc.set(id, { resolve, reject })
    post({ kind: 'rpc', id, method, args })
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'CoFHE operation failed'
}

async function initialize(nextScope: CofheScope) {
  scope = nextScope

  const provider: AbstractProvider = {
    getChainId: async () => String(nextScope.chainId),
    call: async (tx) => rpc('provider-call', [tx]) as Promise<string>,
    send: async (method, params) => rpc('provider-send', [method, params]),
  }
  const signer: AbstractSigner = {
    getAddress: async () => nextScope.address,
    signTypedData: async (domain, types, value) =>
      rpc('sign-typed-data', [domain, types, value]) as Promise<string>,
    provider,
    sendTransaction: async (tx) =>
      rpc('send-transaction', [tx]) as Promise<string>,
  }

  const result = await cofhejs.initialize({
    provider,
    signer,
    environment: 'TESTNET',
    generatePermit: false,
  })
  if (!result.success) throw result.error
}

async function encrypt(
  commandId: number,
  segments: readonly number[],
): Promise<readonly EncryptedFleetSegment[]> {
  if (!scope) throw new Error('CoFHE client is not initialized')
  const result = await cofhejs.encrypt(
    segments.map((segment) => Encryptable.uint8(BigInt(segment))),
    (progress) => post({ kind: 'progress', id: commandId, progress }),
  )
  if (!result.success) throw result.error
  return result.data
}

worker.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const message = event.data
  if (message.kind === 'rpc-result') {
    const pending = pendingRpc.get(message.id)
    if (!pending) return
    pendingRpc.delete(message.id)
    if (message.ok) pending.resolve(message.value)
    else pending.reject(new Error(message.error))
    return
  }

  if (message.kind === 'dispose') {
    scope = null
    for (const pending of pendingRpc.values()) {
      pending.reject(new Error('CoFHE worker disposed'))
    }
    pendingRpc.clear()
    worker.close()
    return
  }

  const run =
    message.command === 'initialize'
      ? initialize(message.scope).then(() => undefined)
      : encrypt(message.id, message.segments)

  void run.then(
    (value) => post({ kind: 'response', id: message.id, ok: true, value }),
    (error) =>
      post({
        kind: 'response',
        id: message.id,
        ok: false,
        error: errorMessage(error),
      }),
  )
}
