/**
 * Live spike for the cofhe-contracts 0.1.x decrypt model (run with
 * `hardhat run --network arbitrumSepolia`).
 *
 * Flow under test, mirroring what the migrated BattleshipGame needs:
 *   1. creator encrypts inputs with @cofhe/sdk and calls compute()
 *      (FHE ops + allowGlobal on the results);
 *   2. the OPPONENT (a third party to the compute call) fetches the
 *      threshold-network decrypt signature off-chain via
 *      decryptForTx(...).withoutPermit();
 *   3. the opponent publishes it on-chain via TaskManager.publishDecryptResult;
 *   4. the contract reads it back with FHE.getDecryptResultSafe.
 *
 * Required env: DEPLOYER_PRIVATE_KEY, CREATOR_PRIVATE_KEY,
 * OPPONENT_PRIVATE_KEY, ARBITRUM_SEPOLIA_RPC_URL.
 * Optional: SPIKE_ADDRESS to reuse a deployed spike contract.
 */
import { ethers } from 'hardhat'
import { Wallet, Contract } from 'ethers'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { createCofheClient, createCofheConfig } from '@cofhe/sdk/node'
import { Encryptable } from '@cofhe/sdk'
import { arbSepolia } from '@cofhe/sdk/chains'

const TASK_MANAGER = '0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9'
const PUBLISH_ABI = [
  'function publishDecryptResult(uint256 ctHash, uint256 result, bytes signature) external',
]

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function cofheClientFor(privateKey: string, rpc: string) {
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpc) })
  const walletClient = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http(rpc),
  })
  const client = createCofheClient(
    createCofheConfig({ environment: 'node', supportedChains: [arbSepolia] }),
  )
  await client.connect(publicClient, walletClient)
  return client
}

async function main() {
  const rpc = process.env.ARBITRUM_SEPOLIA_RPC_URL!
  const creator = new Wallet(process.env.CREATOR_PRIVATE_KEY!, ethers.provider)
  const opponent = new Wallet(process.env.OPPONENT_PRIVATE_KEY!, ethers.provider)

  const factory = await ethers.getContractFactory('CofheDecryptSpike')
  const spike = process.env.SPIKE_ADDRESS
    ? factory.attach(process.env.SPIKE_ADDRESS)
    : await (async () => {
        const deployed = await factory.deploy()
        await deployed.waitForDeployment()
        return deployed
      })()
  const spikeAddress = await spike.getAddress()
  console.log('spike at', spikeAddress)

  // 1. creator encrypts and computes
  const creatorCofhe = await cofheClientFor(process.env.CREATOR_PRIVATE_KEY!, rpc)
  const inputs = await creatorCofhe
    .encryptInputs([Encryptable.uint8(3n), Encryptable.uint8(4n)])
    .execute()
  const computeTx = await (spike.connect(creator) as Contract).compute(inputs[0], inputs[1])
  const computeReceipt = await computeTx.wait()
  console.log('compute tx', computeReceipt.hash, 'gas', computeReceipt.gasUsed.toString())

  const sumHash = (await spike.sumHash()) as bigint
  const flagHash = (await spike.flagHash()) as bigint

  // Is the result auto-published by the network, or client-published?
  const before = await spike.readSum()
  console.log('readSum before publish:', before.toString())

  // 2. third party (opponent) fetches the threshold decrypt signature
  const opponentCofhe = await cofheClientFor(process.env.OPPONENT_PRIVATE_KEY!, rpc)
  const taskManager = new Contract(TASK_MANAGER, PUBLISH_ABI, opponent)

  for (const [label, ctHash, expected] of [
    ['sum', sumHash, 7n],
    ['flag', flagHash, 1n],
  ] as const) {
    const started = Date.now()
    const result = await opponentCofhe.decryptForTx(ctHash).withoutPermit().execute()
    console.log(
      `${label}: decryptForTx -> value=${result.decryptedValue} ` +
        `sigLen=${result.signature.length} in ${Date.now() - started} ms`,
    )

    // 3. opponent publishes on-chain (permissionless?)
    const publishStarted = Date.now()
    const publishTx = await taskManager.publishDecryptResult(
      ctHash,
      result.decryptedValue,
      result.signature,
    )
    const publishReceipt = await publishTx.wait()
    console.log(
      `${label}: publish tx ${publishReceipt.hash} gas ${publishReceipt.gasUsed} ` +
        `in ${Date.now() - publishStarted} ms`,
    )

    // 4. contract read-back
    for (let attempt = 0; attempt < 10; attempt++) {
      const read = label === 'sum' ? await spike.readSum() : await spike.readFlag()
      if (read[1]) {
        console.log(`${label}: getDecryptResultSafe -> ${read[0]} (expected ${expected})`)
        if (read[0] !== expected) throw new Error(`${label}: wrong decrypt result`)
        break
      }
      if (attempt === 9) throw new Error(`${label}: result never became readable`)
      await sleep(2000)
    }
  }

  console.log('spike passed: 0.1.x compute/allowGlobal/decryptForTx/publish/read cycle works')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
