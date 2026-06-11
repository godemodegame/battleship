import type {
  PublicClientLike,
  WalletClientLike,
} from '../client/battleshipClient'
import {
  cofheScopeKey,
  type CofheFleetEncryptor,
  type CofheProgress,
  type CofheScope,
  type EncryptedFleetSegment,
} from './types'
import type {
  WorkerInbound,
  WorkerOutbound,
  WorkerRpcMethod,
} from './workerProtocol'

export interface CofheClientConfig {
  scope: CofheScope
  publicClient: PublicClientLike
  walletClient: WalletClientLike
}

interface CofhePublicTransport extends PublicClientLike {
  getChainId?: () => Promise<number>
  call?: (tx: { to: string; data: string }) => Promise<string | { data?: string }>
  request?: (request: { method: string; params?: unknown[] }) => Promise<unknown>
  send?: (method: string, params: unknown[]) => Promise<unknown>
}

interface CofheWalletTransport extends WalletClientLike {
  getAddresses?: () => Promise<readonly string[]>
  signTypedData?: (request: Record<string, unknown>) => Promise<string>
  sendTransaction?: (request: Record<string, unknown>) => Promise<string>
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('CoFHE operation failed')
}

function assertTransport(config: CofheClientConfig) {
  const publicClient = config.publicClient as CofhePublicTransport
  const walletClient = config.walletClient as CofheWalletTransport
  if (
    typeof publicClient.call !== 'function' ||
    (typeof publicClient.request !== 'function' && typeof publicClient.send !== 'function') ||
    typeof walletClient.signTypedData !== 'function' ||
    typeof walletClient.sendTransaction !== 'function'
  ) {
    throw new Error('Wallet clients are not ready for CoFHE')
  }
}

async function assertActiveScope(config: CofheClientConfig) {
  const publicClient = config.publicClient as CofhePublicTransport
  const walletClient = config.walletClient as CofheWalletTransport
  if (publicClient.getChainId) {
    const chainId = await publicClient.getChainId()
    if (chainId !== config.scope.chainId) throw new Error('CoFHE chain changed')
  }
  if (walletClient.getAddresses) {
    const [address] = await walletClient.getAddresses()
    if (address?.toLowerCase() !== config.scope.address.toLowerCase()) {
      throw new Error('CoFHE account changed')
    }
  }
}

async function executeRpc(
  config: CofheClientConfig,
  method: WorkerRpcMethod,
  args: unknown[],
): Promise<unknown> {
  await assertActiveScope(config)
  const publicClient = config.publicClient as CofhePublicTransport
  const walletClient = config.walletClient as CofheWalletTransport

  switch (method) {
    case 'provider-call': {
      const value = await publicClient.call!(args[0] as { to: string; data: string })
      return typeof value === 'string' ? value : value.data ?? '0x'
    }
    case 'provider-send': {
      const [rpcMethod, params] = args as [string, unknown[]]
      if (publicClient.request) {
        return publicClient.request({ method: rpcMethod, params })
      }
      return publicClient.send!(rpcMethod, params)
    }
    case 'sign-typed-data': {
      const [domain, types, message] = args
      const typeRecord = types as Record<string, unknown>
      return walletClient.signTypedData!({
        account: config.scope.address,
        domain,
        types,
        primaryType: Object.keys(typeRecord)[0],
        message,
      })
    }
    case 'send-transaction':
      return walletClient.sendTransaction!({
        ...(args[0] as Record<string, unknown>),
        account: config.scope.address,
      })
  }
}

class WorkerCofheFleetEncryptor implements CofheFleetEncryptor {
  readonly execution = 'worker' as const
  readonly scopeKey: string

  private readonly worker: Worker
  private commandId = 0
  private disposed = false
  private readonly pending = new Map<
    number,
    {
      resolve: (value: readonly EncryptedFleetSegment[] | undefined) => void
      reject: (error: Error) => void
      onProgress?: (progress: CofheProgress) => void
    }
  >()

  constructor(private readonly config: CofheClientConfig) {
    assertTransport(config)
    this.scopeKey = cofheScopeKey(config.scope)
    this.worker = new Worker(new URL('./cofhe.worker.ts', import.meta.url), {
      type: 'module',
      name: 'battleship-cofhe',
    })
    this.worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
      void this.onMessage(event.data)
    }
    this.worker.onerror = () => this.failAll(new Error('CoFHE worker failed'))
  }

  private async onMessage(message: WorkerOutbound) {
    if (message.kind === 'rpc') {
      try {
        const value = await executeRpc(this.config, message.method, message.args)
        this.worker.postMessage({
          kind: 'rpc-result',
          id: message.id,
          ok: true,
          value,
        } satisfies WorkerInbound)
      } catch (error) {
        this.worker.postMessage({
          kind: 'rpc-result',
          id: message.id,
          ok: false,
          error: asError(error).message,
        } satisfies WorkerInbound)
      }
      return
    }

    const pending = this.pending.get(message.id)
    if (!pending) return
    if (message.kind === 'progress') {
      pending.onProgress?.(message.progress)
      return
    }
    this.pending.delete(message.id)
    if (message.ok) pending.resolve(message.value)
    else pending.reject(new Error(message.error))
  }

  private command(
    command: Extract<WorkerInbound, { kind: 'command' }>,
    onProgress?: (progress: CofheProgress) => void,
  ) {
    if (this.disposed) return Promise.reject(new Error('CoFHE client disposed'))
    return new Promise<readonly EncryptedFleetSegment[] | undefined>((resolve, reject) => {
      this.pending.set(command.id, { resolve, reject, onProgress })
      this.worker.postMessage(command)
    })
  }

  async initialize() {
    await assertActiveScope(this.config)
    const id = ++this.commandId
    await this.command({
      kind: 'command',
      id,
      command: 'initialize',
      scope: this.config.scope,
    })
  }

  async encryptFleet(
    segments: readonly number[],
    onProgress?: (progress: CofheProgress) => void,
  ) {
    await assertActiveScope(this.config)
    const id = ++this.commandId
    const result = await this.command(
      { kind: 'command', id, command: 'encrypt', segments },
      onProgress,
    )
    if (!result) throw new Error('CoFHE returned no encrypted fleet')
    return result
  }

  private failAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.worker.postMessage({ kind: 'dispose' } satisfies WorkerInbound)
    this.worker.terminate()
    this.failAll(new Error('CoFHE client disposed'))
  }
}

class MainThreadCofheFleetEncryptor implements CofheFleetEncryptor {
  readonly execution = 'main-thread' as const
  readonly scopeKey: string
  private disposed = false

  constructor(private readonly config: CofheClientConfig) {
    assertTransport(config)
    this.scopeKey = cofheScopeKey(config.scope)
  }

  private provider() {
    const config = this.config
    return {
      getChainId: async () => String(config.scope.chainId),
      call: async (tx: { to: string; data: string }) =>
        executeRpc(config, 'provider-call', [tx]) as Promise<string>,
      send: async (method: string, params: unknown[]) =>
        executeRpc(config, 'provider-send', [method, params]),
    }
  }

  async initialize() {
    await assertActiveScope(this.config)
    const { cofhejs } = await import('cofhejs/web')
    const provider = this.provider()
    const signer = {
      getAddress: async () => this.config.scope.address,
      signTypedData: async (domain: object, types: Record<string, object[]>, value: object) =>
        executeRpc(this.config, 'sign-typed-data', [domain, types, value]) as Promise<string>,
      provider,
      sendTransaction: async (tx: { to: string; data: string }) =>
        executeRpc(this.config, 'send-transaction', [tx]) as Promise<string>,
    }
    const result = await cofhejs.initialize({
      provider,
      signer,
      environment: 'TESTNET',
      generatePermit: false,
    })
    if (!result.success) throw result.error
  }

  async encryptFleet(
    segments: readonly number[],
    onProgress?: (progress: CofheProgress) => void,
  ) {
    if (this.disposed) throw new Error('CoFHE client disposed')
    await assertActiveScope(this.config)
    const { cofhejs, Encryptable } = await import('cofhejs/web')
    const result = await cofhejs.encrypt(
      segments.map((segment) => Encryptable.uint8(BigInt(segment))),
      onProgress,
    )
    if (!result.success) throw result.error
    return result.data
  }

  dispose() {
    this.disposed = true
  }
}

/**
 * Create one account/chain/match-bound CoFHE client. Workers are preferred
 * because proof generation is CPU-heavy; the fallback keeps unsupported
 * browsers functional and still enforces scope checks before every operation.
 */
export function createCofheFleetEncryptor(config: CofheClientConfig): CofheFleetEncryptor {
  if (typeof Worker !== 'undefined') return new WorkerCofheFleetEncryptor(config)
  return new MainThreadCofheFleetEncryptor(config)
}
