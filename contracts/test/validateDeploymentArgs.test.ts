import { expect } from 'chai'

import { parseValidationArgs } from '../scripts/validate-deployment'

describe('deployment validator arguments', () => {
  it('keeps the record path when no RPC is supplied', () => {
    expect(parseValidationArgs(['deployments/421614/arb-sepolia-v1.json'])).to.deep.equal({
      recordArg: 'deployments/421614/arb-sepolia-v1.json',
      rpcUrl: undefined,
    })
  })

  it('separates the record path from the RPC value', () => {
    expect(
      parseValidationArgs([
        'deployments/421614/arb-sepolia-v1.json',
        '--rpc',
        'https://rpc.example',
      ]),
    ).to.deep.equal({
      recordArg: 'deployments/421614/arb-sepolia-v1.json',
      rpcUrl: 'https://rpc.example',
    })
  })
})
