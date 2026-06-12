import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

import committedAbi from './contracts/abi/BattleshipGame.json'
import deploymentManifest from './src/onchain/deploymentManifest.json'

interface BuildDeploymentRecord {
  deploymentId: string
  chainId: number
  contractName: string
  address: string | null
  status: 'active' | 'pending'
  deploymentTx?: string
  deploymentBlock?: number
  sourceCommit?: string
}

function sourceCommit(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function releaseMetadataPlugin(env: Record<string, string>): Plugin {
  const deploymentId = env.VITE_ACTIVE_DEPLOYMENT_ID || 'arb-sepolia-v1'
  const deployment = (deploymentManifest as BuildDeploymentRecord[]).find(
    (record) => record.deploymentId === deploymentId,
  )

  if (!deployment) {
    throw new Error(`VITE_ACTIVE_DEPLOYMENT_ID ${deploymentId} is absent from the manifest`)
  }

  const assertedAddress = env.VITE_BATTLESHIP_CONTRACT_ADDRESS
  if (
    assertedAddress &&
    assertedAddress.toLowerCase() !== (deployment.address ?? '').toLowerCase()
  ) {
    throw new Error('VITE_BATTLESHIP_CONTRACT_ADDRESS does not match the selected deployment')
  }

  const abiSha256 = `sha256:${createHash('sha256')
    .update(JSON.stringify(committedAbi))
    .digest('hex')}`

  return {
    name: 'release-metadata',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'release.json',
        source: `${JSON.stringify(
          {
            schemaVersion: 1,
            application: 'encrypted-battleship',
            sourceCommit: sourceCommit(),
            deploymentId: deployment.deploymentId,
            deploymentStatus: deployment.status,
            chainId: deployment.chainId,
            contractName: deployment.contractName,
            contractAddress: deployment.address,
            deploymentTx: deployment.deploymentTx ?? null,
            deploymentBlock: deployment.deploymentBlock ?? null,
            contractSourceCommit: deployment.sourceCommit ?? null,
            abiSha256,
            builtAt: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<
    string,
    string
  >

  return {
    plugins: [react(), releaseMetadataPlugin(env)],
    server: {
      host: true,
    },
    build: {
      rollupOptions: {
        output: {
          // GAME-808: stable vendor chunks per docs/mobile-performance-budget.md
          // ("split vendor chunks ... so caching starts paying off"). three.js
          // loads only with the practice route, viem with the wallet bridge.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined
            if (/node_modules\/(three|@react-three|maath)\//.test(id)) return 'three'
            if (/node_modules\/viem\//.test(id)) return 'viem'
            if (
              /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(
                id,
              )
            ) {
              return 'react'
            }
            return undefined
          }
        },
      },
    },
  }
})
