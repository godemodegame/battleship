/**
 * Temporary diagnostic: deploys CofheInfraProbe to Arbitrum Sepolia and
 * eth_calls each primitive with a freshly encrypted input to isolate what
 * the upgraded CoFHE TaskManager rejects for cofhe-contracts 0.0.13.
 *
 * Required env: DEPLOYER_PRIVATE_KEY, CREATOR_PRIVATE_KEY,
 * ARBITRUM_SEPOLIA_RPC_URL.
 */
import { ethers } from 'hardhat'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia } from 'viem/chains'
import { createCofheClient, createCofheConfig } from '@cofhe/sdk/node'
import { Encryptable } from '@cofhe/sdk'
import { arbSepolia } from '@cofhe/sdk/chains'

async function main() {
  const rpc = process.env.ARBITRUM_SEPOLIA_RPC_URL!
  const factory = await ethers.getContractFactory('CofheInfraProbe')
  const probe = process.env.PROBE_ADDRESS
    ? factory.attach(process.env.PROBE_ADDRESS)
    : await (async () => {
        const deployed = await factory.deploy()
        await deployed.waitForDeployment()
        return deployed
      })()
  const probeAddress = await probe.getAddress()
  console.log('probe at', probeAddress)

  const account = privateKeyToAccount(process.env.CREATOR_PRIVATE_KEY! as `0x${string}`)
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpc) })
  const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport: http(rpc) })
  const cofhe = createCofheClient(
    createCofheConfig({ environment: 'node', supportedChains: [arbSepolia] }),
  )
  await cofhe.connect(publicClient, walletClient)

  for (const fn of ['verifyOnly', 'opThenStore', 'decryptPath'] as const) {
    const [item] = await cofhe.encryptInputs([Encryptable.uint8(7n)]).execute()
    const input = {
      ctHash: item.ctHash,
      securityZone: item.securityZone,
      utype: item.utype,
      signature: item.signature,
    }
    try {
      await ethers.provider.call({
        to: probeAddress,
        from: account.address,
        data: probe.interface.encodeFunctionData(fn, [input]),
      })
      console.log(fn, 'OK')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(fn, 'REVERT:', message.slice(0, 160))
    }
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
