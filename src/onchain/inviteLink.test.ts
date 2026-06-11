import { describe, expect, it } from 'vitest'
import { explorerAddressUrl, explorerTxUrl } from './explorer'
import { buildInviteLink, inviteLinkPath } from './inviteLink'

describe('invite links (GAME-506)', () => {
  it('builds the versioned match path', () => {
    expect(inviteLinkPath('arb-sepolia-v1', '7')).toBe('/match/arb-sepolia-v1/7')
  })

  it('builds an absolute link from an explicit origin', () => {
    expect(buildInviteLink('arb-sepolia-v1', '7', 'https://game.example')).toBe(
      'https://game.example/match/arb-sepolia-v1/7',
    )
  })

  it('escapes unexpected characters instead of corrupting the path', () => {
    expect(inviteLinkPath('a/b', '1?x=2')).toBe('/match/a%2Fb/1%3Fx%3D2')
  })
})

describe('explorer links (GAME-512)', () => {
  it('points at Arbitrum Sepolia Arbiscan', () => {
    expect(explorerTxUrl('0xabc')).toBe('https://sepolia.arbiscan.io/tx/0xabc')
    expect(explorerAddressUrl('0xdef')).toBe('https://sepolia.arbiscan.io/address/0xdef')
  })
})
