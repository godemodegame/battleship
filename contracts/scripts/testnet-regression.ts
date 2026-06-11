/**
 * Funded two-wallet Arbitrum Sepolia regression (GAME-906).
 *
 * This deliberately performs a small real-chain lifecycle: creator creates a
 * strict friend match, the invited wallet joins, and the creator cancels. It
 * verifies chain id, deployment bytecode, record hash, wallet separation, and
 * balances before spending gas.
 *
 * Required environment:
 *   ARBITRUM_SEPOLIA_RPC_URL
 *   CREATOR_PRIVATE_KEY
 *   OPPONENT_PRIVATE_KEY
 *   DEPLOYMENT_RECORD=deployments/421614/<deploymentId>.json
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatEther,
  keccak256,
  type ContractTransactionReceipt,
  type ContractTransactionResponse,
  type InterfaceAbi,
  type Log,
} from 'ethers'

import { validateRecordSchema, type DeploymentRecord } from './deploymentRecord'

const MIN_BALANCE = 100_000_000_000_000n
let activeProvider: JsonRpcProvider | null = null

interface TransactionBaseline {
  action: 'createMatch' | 'joinMatch' | 'cancelMatch'
  hash: string
  gasUsed: string
  gasPriceWei: string
  feeWei: string
  walletToHashMs: number
  hashToReceiptMs: number
  walletToReceiptMs: number
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name} before running the funded regression`)
  return value
}

async function main(): Promise<void> {
  const contractsDir = join(__dirname, '..')
  const rpcUrl = required('ARBITRUM_SEPOLIA_RPC_URL')
  const recordArg = required('DEPLOYMENT_RECORD')
  const recordPath = isAbsolute(recordArg) ? recordArg : join(contractsDir, recordArg)
  const record = JSON.parse(readFileSync(recordPath, 'utf8')) as DeploymentRecord
  const problems = validateRecordSchema(record)
  if (problems.length) throw new Error(`Invalid deployment record: ${problems.join('; ')}`)
  if (record.chainId !== 421614) throw new Error(`Expected chain 421614, got ${record.chainId}`)

  const abi = JSON.parse(
    readFileSync(join(contractsDir, 'abi', `${record.contractName}.json`), 'utf8'),
  ) as InterfaceAbi
  const provider = new JsonRpcProvider(rpcUrl)
  activeProvider = provider
  const network = await provider.getNetwork()
  if (Number(network.chainId) !== record.chainId) {
    throw new Error(`RPC chain ${network.chainId} does not match record ${record.chainId}`)
  }

  const code = await provider.getCode(record.address)
  if (code === '0x') throw new Error(`No bytecode at ${record.address}`)
  const codeHash = `keccak256:${keccak256(code)}`
  if (codeHash !== record.deployedBytecodeKeccak256) {
    throw new Error(`On-chain bytecode hash ${codeHash} does not match the record`)
  }

  const creator = new Wallet(required('CREATOR_PRIVATE_KEY'), provider)
  const opponent = new Wallet(required('OPPONENT_PRIVATE_KEY'), provider)
  if (creator.address.toLowerCase() === opponent.address.toLowerCase()) {
    throw new Error('Creator and opponent keys resolve to the same address')
  }

  const [creatorBalance, opponentBalance] = await Promise.all([
    provider.getBalance(creator.address),
    provider.getBalance(opponent.address),
  ])
  if (creatorBalance < MIN_BALANCE || opponentBalance < MIN_BALANCE) {
    throw new Error(
      `Both wallets need at least ${formatEther(MIN_BALANCE)} ETH; ` +
        `creator=${formatEther(creatorBalance)}, opponent=${formatEther(opponentBalance)}`,
    )
  }

  const creatorGame = new Contract(record.address, abi, creator)
  const opponentGame = new Contract(record.address, abi, opponent)
  const baselines: TransactionBaseline[] = []

  const measuredWrite = async (
    action: TransactionBaseline['action'],
    send: () => Promise<ContractTransactionResponse>,
  ): Promise<ContractTransactionReceipt> => {
    const startedAt = Date.now()
    const transaction = await send()
    const submittedAt = Date.now()
    const receipt = await transaction.wait()
    const finishedAt = Date.now()
    if (!receipt) throw new Error(`${action} receipt missing`)
    const gasPrice = receipt.gasPrice
    baselines.push({
      action,
      hash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
      gasPriceWei: gasPrice.toString(),
      feeWei: (receipt.gasUsed * gasPrice).toString(),
      walletToHashMs: submittedAt - startedAt,
      hashToReceiptMs: finishedAt - submittedAt,
      walletToReceiptMs: finishedAt - startedAt,
    })
    return receipt
  }

  const createReceipt = await measuredWrite('createMatch', () =>
    creatorGame.createMatch(opponent.address),
  )

  let matchId: bigint | null = null
  for (const log of createReceipt.logs as Log[]) {
    try {
      const parsed = creatorGame.interface.parseLog(log)
      if (parsed?.name === 'MatchCreated') {
        matchId = parsed.args.matchId as bigint
        break
      }
    } catch {
      // Ignore logs emitted by CoFHE/system contracts.
    }
  }
  if (matchId === null) throw new Error('MatchCreated event missing')

  const joinReceipt = await measuredWrite('joinMatch', () => opponentGame.joinMatch(matchId))
  const joined = await creatorGame.getMatch(matchId)
  if (Number(joined.status) !== 2 || joined.opponent.toLowerCase() !== opponent.address.toLowerCase()) {
    throw new Error('Joined match state does not identify the invited opponent')
  }

  const cancelReceipt = await measuredWrite('cancelMatch', () => creatorGame.cancelMatch(matchId))
  const cancelled = await creatorGame.getMatch(matchId)
  if (Number(cancelled.status) !== 8) throw new Error('Match did not reach Cancelled')

  console.log(`Funded regression passed for match ${matchId}`)
  console.log(`create ${createReceipt.hash}`)
  console.log(`join   ${joinReceipt.hash}`)
  console.log(`cancel ${cancelReceipt.hash}`)

  if (process.env.TESTNET_EVIDENCE_PATH) {
    writeFileSync(
      process.env.TESTNET_EVIDENCE_PATH,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          checkedAt: new Date().toISOString(),
          chainId: record.chainId,
          deploymentId: record.deploymentId,
          contractAddress: record.address,
          matchId: matchId.toString(),
          creator: creator.address,
          opponent: opponent.address,
          transactions: baselines,
        },
        null,
        2,
      )}\n`,
    )
  }
}

void main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => activeProvider?.destroy())
