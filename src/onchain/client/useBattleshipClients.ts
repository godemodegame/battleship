/**
 * Per-deployment contract client assembly (GAME-501 / GAME-502).
 *
 * `useBattleshipClients(deploymentId)` resolves + validates the deployment
 * record, then binds the typed read/write clients to its contract address over
 * the wallet layer's viem clients. Reads need only the public client; writes
 * additionally need a connected wallet (the write guard still gates every
 * actual transaction).
 *
 * Tests inject `BattleshipClientsOverrideContext` with a factory returning
 * fake clients (and a synthetic ready deployment), so screens exercise real
 * flows without a network.
 */

import { createContext, useContext, useMemo } from 'react'
import { resolveDeployment, type DeploymentResolution } from '../deployments'
import type { HexAddress } from '../phaseResolver'
import { useWalletSession } from '../wallet/WalletSessionContext'
import {
  createBattleshipReadClient,
  createBattleshipWriteClient,
  type BattleshipReadClient,
  type BattleshipWriteClient,
} from './battleshipClient'

export interface BattleshipClients {
  resolution: DeploymentResolution
  /** Null until the deployment is live and the public client exists. */
  readClient: BattleshipReadClient | null
  /** Null until a wallet is connected on top of a live deployment. */
  writeClient: BattleshipWriteClient | null
}

export type BattleshipClientsFactory = (deploymentId: string) => BattleshipClients | null

/** Test seam: when provided, the factory's clients replace the real ones. */
export const BattleshipClientsOverrideContext =
  createContext<BattleshipClientsFactory | null>(null)

export function useBattleshipClients(deploymentId: string): BattleshipClients {
  const override = useContext(BattleshipClientsOverrideContext)
  const wallet = useWalletSession()
  const { publicClient, walletClient } = wallet
  const account = wallet.session.address

  return useMemo(() => {
    const overridden = override?.(deploymentId)
    if (overridden) return overridden

    const resolution = resolveDeployment(deploymentId)
    if (!resolution.ok || !resolution.ready || !publicClient) {
      return { resolution, readClient: null, writeClient: null }
    }

    const contractAddress = resolution.record.address as HexAddress
    const readClient = createBattleshipReadClient({
      publicClient,
      contractAddress,
      deploymentId,
    })
    const writeClient =
      walletClient && account
        ? createBattleshipWriteClient({
            publicClient,
            walletClient,
            contractAddress,
            deploymentId,
            account,
          })
        : null
    return { resolution, readClient, writeClient }
  }, [override, deploymentId, publicClient, walletClient, account])
}
