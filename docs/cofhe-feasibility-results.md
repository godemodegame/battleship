# CoFHE Feasibility Results

## Purpose

This document records the Phase 4 (GAME-402..405, GAME-411) measurements that
froze the encrypted fleet encoding and the fleet/attack contract ABI. It is
the decision record referenced by `docs/game-implementation-roadmap.md`,
`docs/contract-data-model.md`, and `docs/fhenix-integration-plan.md`.

Measurement date:

- June 11, 2026.

## Pinned Compatible Set (GAME-401)

The compatible CoFHE set, pinned exactly in `contracts/package.json`:

| Package | Version | Note |
| --- | --- | --- |
| `@fhenixprotocol/cofhe-contracts` | `0.0.13` | Solidity `FHE.sol` library |
| `@fhenixprotocol/cofhe-mock-contracts` | `0.3.1` | mock task manager, ACL, verifier |
| `cofhe-hardhat-plugin` | `0.3.1` | deploys mocks before `hardhat test` |
| `cofhejs` | `0.3.1` | client SDK (`cofhejs/node`, `cofhejs/web`) |
| solc | `0.8.25` | Cancun EVM target |

Compatibility findings that changed the Phase 3 pins:

- `@fhenixprotocol/cofhe-contracts` was repinned from `0.1.4` to `0.0.13`.
  The newest plugin/mock/cofhejs set (all `0.3.1`) targets `0.0.13`
  exclusively: `cofhe-hardhat-plugin` hard-depends on `0.0.13`, and the mock
  task manager does not implement the `publishDecryptResult` /
  `verifyDecryptResult` entry points that `0.1.4` requires, so every `0.1.4`
  finalization path reverts under mocks.
- Consequence for the decrypt flow: `0.0.13` exposes the asynchronous
  on-chain request API (`FHE.decrypt(handle)` then
  `FHE.getDecryptResultSafe(handle)`), and the CoFHE network posts the
  signed plaintext on-chain itself. There is no client-submitted
  `(ctHash, value, signature)` tuple anywhere in the flow. This is stronger
  than the originally planned client-relayed finalization: no client ever
  supplies the authoritative result, and finalization transactions carry no
  result data at all.
- The Hardhat in-process network must pin `hardfork: 'cancun'`. Hardhat
  2.28's default (osaka) enables the EIP-7951 P256VERIFY precompile at
  address `0x...0100`, which shadows the `MockZkVerifier` that the CoFHE
  plugin etches at exactly that address; mock deployment then fails.

## Benchmark Setup (GAME-402..404)

Prototypes: `contracts/contracts/prototypes/FleetEncodingPrototypes.sol`.
Benchmark suite: `contracts/test/encodingBenchmarks.test.ts` (runs in CI with
the normal contract tests and prints the comparison table).

Every encoding submits the same canonical valid fleet (10 ships, lengths
4,3,3,2,2,2,1,1,1,1, 20 occupied cells) and resolves one shot through its
hit-detection core. Measured on the mock CoFHE environment (Node 20.19.5,
Hardhat 2.28.6).

Mock-environment caveats:

- encryption time excludes real TFHE proving (the mock verifier signs
  instead of proving), so encrypt times compare pipeline overhead between
  encodings but are not browser absolutes;
- gas reflects the on-chain mock task manager, which prices every FHE
  operation at roughly 100k gas (storage + bookkeeping). Rows are comparable
  to each other; testnet absolutes differ and are re-measured in GAME-906;
- calldata bytes and encrypted-input counts are exact and
  environment-independent.

## Benchmark Results (GAME-403, GAME-404)

| Encoding | Inputs | Txs | Encrypt (ms) | Calldata (bytes) | Submit gas | Hit-core gas |
| --- | --- | --- | --- | --- | --- | --- |
| Cell array (`InEuint8[100]`, 1 tx) | 100 | 1 | 1202 | 28,836 | 3,817,625 | 329,133 |
| Cell array (4 x 25 batches) | 100 | 4 | 4529 | 29,200 | 4,015,972 | 309,233 |
| Packed nibbles (2 x `InEuint256`) | 2 | 1 | 1113 | 580 | 175,518 | 737,088 |
| Ship segments (`InEuint8[20]`, 1 tx) | 20 | 1 | 1130 | 5,796 | 1,267,310 | 4,240,518 |

The hit-core column is only the encoding-specific hit test (one comparison
for the cell array, shift+mask+compare for packed words, 20 equality checks
folded with `or` for segments). It excludes the shared per-shot sunk/health/
win pipeline, which depends on how each encoding exposes ship identity.

## Validation Cost Analysis (the deciding factor)

Submission and hit-core numbers alone favor packed nibbles, but placement
validation and sunk tracking dominate total feasibility:

- Cell array: proving "ship id `s` occupies exactly `length(s)` cells"
  costs 100 equality checks per ship = ~1,000 FHE operations (~100M mock
  gas). Without that check a player can submit a one-cell carrier that is
  nearly impossible to hit. Initializing encrypted per-ship health requires
  the same counting. Infeasible in any transaction budget.
- Packed nibbles: identical counting problem, plus ~200 shift/mask
  operations on 256-bit words just to extract the nibbles. Worst of the
  candidates for validation despite the smallest submission.
- Ship segments: ship identity is the public array position, so per-ship
  health initializes from public constants at zero FHE cost, and full
  geometric validation (range, straightness, contiguity, row bounds) costs
  ~130 FHE operations once per fleet (~13M mock gas, measured 12.9M in the
  implemented `submitFleet`). The only encoding whose complete rule set fits
  a transaction budget.

Cross-ship overlap is deliberately not validated on-chain: overlapping your
own ships strictly harms the cheater (fewer distinct hittable cells, each
shared-cell hit decrements several ships, and the win check is
all-ships-sunk), while intra-ship duplicate cells - the dangerous
"unsinkable ship" cheat - are already excluded by the straightness check
(consecutive segment deltas of exactly 1 or 10 force distinct cells). The
client keeps enforcing classic no-touch placement for UX; see
`docs/security-and-fair-play.md` for the fairness argument.

## Decision (GAME-405)

Frozen fleet encoding and submission shape:

- `submitFleet(uint256 matchId, InEuint8[20] calldata segments)`: one
  transaction, 20 encrypted cell indexes (`0..99`), grouped by ship in the
  fixed public order carrier(4), battleship(3), cruiser(3), destroyer A(2),
  destroyer B(2), submarine(2), patrol A..D(1 each);
- ship identity = public array position (`SHIP_SEGMENT_OFFSETS` /
  `SHIP_LENGTHS` constants in `BattleshipGame.sol`);
- encrypted per-ship health starts at the public ship length;
- placement validity is computed encrypted in the same transaction and
  resolved through the on-chain decrypt request flow;
- one `cofhejs.encrypt` call produces all 20 inputs (~1.1s pipeline overhead
  in mocks; 5.8KB calldata fits mobile wallets comfortably).

The decision-gate condition from the roadmap ("change the encoding if the
100-cell baseline exceeds budgets") triggered: the 100-cell baseline fails
the validation budget, not the submission budget, and batching cannot hide
that (4 x 25 batching was measured and made encryption 3.8x slower while
saving nothing).

## Full-Match Budget (GAME-411)

Measured by `test/fullMatchBenchmark.test.ts` on the implemented
`BattleshipGame.sol` (mock environment, complete two-player match driven to
a win):

| Operation | Mock gas (measured) | Count per match |
| --- | --- | --- |
| `createMatch` | ~239k | 1 |
| `joinMatch` | ~141k | 1 |
| `submitFleet` (incl. encrypted validation) | ~12.9M | 2 |
| `finalizeFleetValidation` | ~167k | 2 |
| `attack` (full encrypted shot pipeline) | ~10.0M | 24-99 |
| `finalizeAttack` | ~190-247k | one per attack |
| Whole 24-shot match | ~272M total | - |

Working budget for Arbitrum Sepolia (to validate in GAME-906):

- the two FHE-heavy transactions (`submitFleet`, `attack`) stay within a
  30M-gas block even at mock prices, with ~55% headroom;
- mock pricing overstates real CoFHE task-creation gas (every operation
  pays mock storage bookkeeping), so testnet absolutes are expected lower;
  the budget alarm threshold is set at the mock numbers: any testnet
  `attack` above 10M gas or `submitFleet` above 13M reopens the encoding
  decision before Phase 6 freezes the frontend integration;
- finalization transactions are cheap (<250k) and permissionless, so
  result-finalization gas is not a bottleneck for either player.

## Re-measurement

Re-run locally:

```bash
cd contracts
npx hardhat test test/encodingBenchmarks.test.ts
npx hardhat test test/fullMatchBenchmark.test.ts
```

Both suites print their tables after the run. Update this document in the
same change whenever the encoding, the validation rules, or the pinned CoFHE
set changes.
