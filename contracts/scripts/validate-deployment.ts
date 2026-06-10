/**
 * Deployment record validation (GAME-311).
 *
 * Checks a committed deployment record against:
 *   1. the record schema (always);
 *   2. the committed ABI snapshot in contracts/abi/ (always);
 *   3. the live chain when an RPC URL is given: chain id, runtime bytecode
 *      presence at the address, and the bytecode keccak256 hash.
 *
 * Usage:
 *   ts-node --files scripts/validate-deployment.ts deployments/<chainId>/<id>.json [--rpc <url>]
 *
 * Exits non-zero when any check fails, so it can gate CI and releases.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { JsonRpcProvider, keccak256 } from 'ethers'

import { computeAbiSha256, validateRecordSchema, type DeploymentRecord } from './deploymentRecord'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const rpcFlagIndex = args.indexOf('--rpc')
  const rpcUrl = rpcFlagIndex >= 0 ? args[rpcFlagIndex + 1] : undefined
  const recordArg = args.find((arg, i) => arg !== '--rpc' && i !== rpcFlagIndex + 1)
  if (!recordArg) {
    throw new Error(
      'Usage: validate-deployment.ts <path-to-record.json> [--rpc <url>]',
    )
  }

  const contractsDir = join(__dirname, '..')
  const problems: string[] = []

  const record = JSON.parse(readFileSync(recordArg, 'utf8')) as DeploymentRecord
  problems.push(...validateRecordSchema(record))

  // The committed ABI snapshot must agree with the record's abiSha256 so the
  // frontend types generated from the same artifact match the deployment.
  try {
    const abi = JSON.parse(
      readFileSync(join(contractsDir, 'abi', `${record.contractName}.json`), 'utf8'),
    ) as unknown[]
    const abiSha256 = computeAbiSha256(abi)
    if (abiSha256 !== record.abiSha256) {
      problems.push(
        `abiSha256 mismatch: record has ${record.abiSha256}, committed ABI hashes to ${abiSha256}`,
      )
    }
  } catch {
    problems.push(
      `committed ABI snapshot abi/${record.contractName}.json is missing or unreadable`,
    )
  }

  if (rpcUrl) {
    const provider = new JsonRpcProvider(rpcUrl)
    const chainId = Number((await provider.getNetwork()).chainId)
    if (chainId !== record.chainId) {
      problems.push(`RPC chain id ${chainId} does not match record chainId ${record.chainId}`)
    }
    const code = await provider.getCode(record.address)
    if (code === '0x') {
      problems.push(`no runtime bytecode at ${record.address}`)
    } else {
      const codeHash = `keccak256:${keccak256(code)}`
      if (codeHash !== record.deployedBytecodeKeccak256) {
        problems.push(
          `bytecode hash mismatch: record has ${record.deployedBytecodeKeccak256}, chain has ${codeHash}`,
        )
      }
    }
    provider.destroy()
  } else {
    console.log('No --rpc given: skipping on-chain bytecode and chain id checks')
  }

  if (problems.length > 0) {
    console.error(`Deployment record ${recordArg} is INVALID:`)
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exitCode = 1
    return
  }
  console.log(`Deployment record ${recordArg} is valid`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
