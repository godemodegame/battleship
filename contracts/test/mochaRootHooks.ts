import hre from 'hardhat'
import { mock_setLoggingEnabled } from '@cofhe/hardhat-plugin'

// The mock CoFHE contracts deploy with per-operation string logging enabled,
// which burns enough gas to out-of-gas FHE-heavy transactions (submitFleet
// runs ~130 FHE ops). Disable it once before any test takes a snapshot.
export const mochaHooks = {
  beforeAll: async () => {
    await mock_setLoggingEnabled(hre, false)
  },
}
