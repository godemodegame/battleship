import type { PublicClient, WalletClient } from 'viem'
import { Encryptable, EncryptStep, type CofheClient } from '@cofhe/sdk'
import {
  areWorkersAvailable,
  createCofheClient,
  createCofheConfig,
} from '@cofhe/sdk/web'
import { arbSepolia } from '@cofhe/sdk/chains'
import type {
  PublicClientLike,
  WalletClientLike,
} from '../client/battleshipClient'
import {
  cofheScopeKey,
  type CofheMatchClient,
  type CofheProgress,
  type CofheScope,
  type DecryptProof,
  type EncryptedFleetSegment,
} from './types'

export interface CofheClientConfig {
  scope: CofheScope
  publicClient: PublicClientLike
  walletClient: WalletClientLike
}

/** CoFHE coprocessor endpoints per supported chain id. */
const COFHE_CHAINS = [arbSepolia]

/**
 * How long one decrypt-proof fetch polls the threshold network before
 * surfacing a retryable error. Validation/shot results are usually ready
 * within seconds; the recovery button re-runs the fetch on demand.
 */
const PROOF_FETCH_TIMEOUT_MS = 90_000

interface CofhePublicTransport extends PublicClientLike {
  getChainId?: () => Promise<number>
}

interface CofheWalletTransport extends WalletClientLike {
  getAddresses?: () => Promise<readonly string[]>
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

function toProgress(step: EncryptStep): CofheProgress {
  switch (step) {
    case EncryptStep.InitTfhe:
      return 'initTfhe'
    case EncryptStep.FetchKeys:
      return 'fetchKeys'
    case EncryptStep.Pack:
      return 'pack'
    case EncryptStep.Prove:
      return 'prove'
    case EncryptStep.Verify:
      return 'verify'
  }
}

/**
 * `@cofhe/sdk/web`-backed session. The SDK offloads zk proving to its own
 * Web Worker where available and caches the fetched FHE public keys in
 * IndexedDB; neither path ever sees plaintext fleet data outside the
 * encrypt call itself.
 */
class SdkCofheMatchClient implements CofheMatchClient {
  readonly execution = areWorkersAvailable() ? ('worker' as const) : ('main-thread' as const)
  readonly scopeKey: string

  private client: CofheClient | null = null
  private disposed = false
  private warming: Promise<void> | null = null

  constructor(private readonly config: CofheClientConfig) {
    this.scopeKey = cofheScopeKey(config.scope)
  }

  private connected(): CofheClient {
    if (this.disposed || !this.client) throw new Error('CoFHE client disposed')
    return this.client
  }

  /**
   * Pre-warm the encrypt pipeline by running one throwaway encryption. This
   * forces the (idempotent, session-cached) `InitTfhe` WASM load and `FetchKeys`
   * network fetch ahead of time, so the real fleet encrypt skips both. Runs at
   * most once; never throws — the catch keeps a warm-up failure off the UI, and
   * the next real encrypt simply pays the full cost. No wallet signature or
   * on-chain transaction is involved.
   */
  warm(): Promise<void> {
    if (this.warming) return this.warming
    this.warming = (async () => {
      try {
        const client = this.connected()
        await client.encryptInputs([Encryptable.uint8(0n)]).execute()
      } catch {
        // Best-effort: swallow so warm-up is invisible to the placement UI.
      }
    })()
    return this.warming
  }

  async initialize() {
    const chain = COFHE_CHAINS.find((entry) => entry.id === this.config.scope.chainId)
    if (!chain) {
      throw new Error(`CoFHE does not support chain ${this.config.scope.chainId}`)
    }
    await assertActiveScope(this.config)
    const client = createCofheClient(
      createCofheConfig({ environment: 'web', supportedChains: [chain] }),
    )
    // The wallet layer always supplies real viem clients; the structural
    // `*Like` types exist so unit tests can drive the rest of the onchain
    // layer with fakes (those tests substitute this whole factory).
    await client.connect(
      this.config.publicClient as unknown as PublicClient,
      this.config.walletClient as unknown as WalletClient,
    )
    if (this.disposed) {
      client.disconnect()
      throw new Error('CoFHE client disposed')
    }
    this.client = client
  }

  async encryptFleet(
    segments: readonly number[],
    onProgress?: (progress: CofheProgress) => void,
  ): Promise<readonly EncryptedFleetSegment[]> {
    const client = this.connected()
    // Let an in-flight warm-up finish first: two concurrent encrypts share one
    // worker and would serialize (or contend) anyway, and by now it is usually
    // already done — leaving the real encrypt to skip InitTfhe + FetchKeys.
    if (this.warming) await this.warming
    await assertActiveScope(this.config)
    return client
      .encryptInputs(segments.map((segment) => Encryptable.uint8(BigInt(segment))))
      .onStep((step, context) => {
        if (context?.isStart === false) {
          if (onProgress && step === EncryptStep.Verify) onProgress('done')
          return
        }
        onProgress?.(toProgress(step))
      })
      .execute()
  }

  async fetchDecryptProof(ctHash: bigint): Promise<DecryptProof> {
    const client = this.connected()
    await assertActiveScope(this.config)
    const result = await client
      .decryptForTx(ctHash)
      .withoutPermit()
      .set404RetryTimeout(PROOF_FETCH_TIMEOUT_MS)
      .execute()
    return { value: result.decryptedValue, signature: result.signature }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.client?.disconnect()
    this.client = null
  }
}

/** Create one account/chain/match-bound CoFHE client. */
export function createCofheMatchClient(config: CofheClientConfig): CofheMatchClient {
  return new SdkCofheMatchClient(config)
}
