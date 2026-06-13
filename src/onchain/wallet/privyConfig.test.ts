import { describe, expect, it } from 'vitest'
import { ARBITRUM_SEPOLIA_CHAIN_ID } from './network'
import { buildPrivyConfig, ENABLED_LOGIN_METHODS } from './privyConfig'

describe('buildPrivyConfig', () => {
  it('offers wallet plus social/email login', () => {
    const config = buildPrivyConfig()
    expect(config.loginMethods).toBe(ENABLED_LOGIN_METHODS)
    // Wallet stays available alongside the social/email methods.
    expect(ENABLED_LOGIN_METHODS).toContain('wallet')
    for (const method of ['email', 'google', 'twitter', 'apple', 'farcaster', 'passkey']) {
      expect(ENABLED_LOGIN_METHODS).toContain(method)
    }
  })

  it('mints an embedded wallet for users without an external wallet', () => {
    const config = buildPrivyConfig()
    // The embedded wallet is what makes sponsored, gasless writes possible.
    expect(config.embeddedWallets?.ethereum?.createOnLogin).toBe('users-without-wallets')
  })

  it('hides non-EVM wallet families', () => {
    expect(buildPrivyConfig().appearance?.walletChainType).toBe('ethereum-only')
  })

  it('pins Arbitrum Sepolia as the only / default chain', () => {
    const config = buildPrivyConfig()
    expect(config.defaultChain?.id).toBe(ARBITRUM_SEPOLIA_CHAIN_ID)
    expect(config.supportedChains?.map((chain) => chain.id)).toEqual([
      ARBITRUM_SEPOLIA_CHAIN_ID,
    ])
  })
})
