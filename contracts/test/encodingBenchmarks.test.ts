import { expect } from 'chai'
import hre from 'hardhat'
import { cofhejs, Encryptable } from 'cofhejs/node'
import { cofhejs_initializeWithHardhatSigner } from 'cofhe-hardhat-plugin'

// GAME-402..404: measures the candidate encrypted fleet encodings against the
// prototypes in contracts/prototypes/FleetEncodingPrototypes.sol. The numbers
// land in docs/cofhe-feasibility-results.md and drive the GAME-405 encoding
// decision. Mock caveats: encryption time excludes real TFHE proving, and gas
// reflects the on-chain mock task manager rather than CoFHE precompiles, so
// rows are comparable to each other but not to mainnet absolutes.

const SHIP_LENGTHS = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1] as const

// Canonical valid placement (classic no-touch layout) used by every encoding.
const SHIP_SEGMENTS: readonly (readonly number[])[] = [
  [0, 1, 2, 3],
  [20, 21, 22],
  [40, 41, 42],
  [60, 61],
  [80, 81],
  [5, 6],
  [25],
  [45],
  [65],
  [85],
]

function buildCellArray(): bigint[] {
  const cells = new Array<bigint>(100).fill(0n)
  SHIP_SEGMENTS.forEach((segments, shipIndex) => {
    for (const cell of segments) cells[cell] = BigInt(shipIndex + 1)
  })
  return cells
}

function buildSegmentList(): bigint[] {
  return SHIP_SEGMENTS.flat().map((cell) => BigInt(cell))
}

function packNibbleWords(cells: bigint[]): { low: bigint; high: bigint } {
  let low = 0n
  let high = 0n
  for (let i = 0; i < 64; i++) low |= cells[i] << BigInt(i * 4)
  for (let i = 64; i < 100; i++) high |= cells[i] << BigInt((i - 64) * 4)
  return { low, high }
}

function unwrapResult<T>(result: { success: boolean; data: T; error: unknown }): T {
  if (!result.success) {
    throw new Error(`cofhejs call failed: ${JSON.stringify(result.error)}`)
  }
  return result.data
}

interface BenchmarkRow {
  encoding: string
  inputs: number
  txCount: number
  encryptMs: number
  calldataBytes: number
  submitGas: bigint
  shotGas: bigint
}

const rows: BenchmarkRow[] = []

function calldataBytes(data: string): number {
  return (data.length - 2) / 2
}

describe('fleet encoding benchmarks (GAME-402..404)', function () {
  // Benchmarks tolerate the mock decrypt delay and large encrypt batches.
  this.timeout(300_000)

  before(async function () {
    const [signer] = await hre.ethers.getSigners()
    unwrapResult(
      await cofhejs_initializeWithHardhatSigner(hre, signer, {
        environment: 'MOCK',
        generatePermit: false,
      }),
    )
  })

  after(function () {
    // eslint-disable-next-line no-console
    console.table(
      rows.map((row) => ({
        encoding: row.encoding,
        inputs: row.inputs,
        txs: row.txCount,
        'encrypt (ms)': Math.round(row.encryptMs),
        'calldata (bytes)': row.calldataBytes,
        'submit gas': row.submitGas.toString(),
        'hit-core gas': row.shotGas.toString(),
      })),
    )
  })

  it('GAME-402: cell array, 100 InEuint8 in one transaction', async function () {
    const cells = buildCellArray()
    const startedAt = performance.now()
    const encrypted = unwrapResult(
      await cofhejs.encrypt(cells.map((cell) => Encryptable.uint8(cell))),
    )
    const encryptMs = performance.now() - startedAt

    const proto = await hre.ethers.deployContract('ProtoCellArrayFleet')
    const submitTx = await proto.submitFleet(encrypted)
    const submitReceipt = await submitTx.wait()
    expect(await proto.submitted()).to.equal(true)

    const shotTx = await proto.resolveShot(45)
    const shotReceipt = await shotTx.wait()

    rows.push({
      encoding: 'cell array (1 tx)',
      inputs: 100,
      txCount: 1,
      encryptMs,
      calldataBytes: calldataBytes(submitTx.data),
      submitGas: submitReceipt!.gasUsed,
      shotGas: shotReceipt!.gasUsed,
    })
  })

  it('GAME-404: cell array batched as 4 x 25 InEuint8', async function () {
    const cells = buildCellArray()
    const proto = await hre.ethers.deployContract('ProtoCellArrayBatchedFleet')

    let encryptMs = 0
    let totalCalldata = 0
    let submitGas = 0n
    for (let batch = 0; batch < 4; batch++) {
      const slice = cells.slice(batch * 25, (batch + 1) * 25)
      const startedAt = performance.now()
      const encrypted = unwrapResult(
        await cofhejs.encrypt(slice.map((cell) => Encryptable.uint8(cell))),
      )
      encryptMs += performance.now() - startedAt

      const tx = await proto.submitFleetBatch(batch * 25, encrypted)
      const receipt = await tx.wait()
      totalCalldata += calldataBytes(tx.data)
      submitGas += receipt!.gasUsed
    }
    expect(await proto.batchesReceived()).to.equal(4)

    const shotTx = await proto.resolveShot(45)
    const shotReceipt = await shotTx.wait()

    rows.push({
      encoding: 'cell array (4 tx batches)',
      inputs: 100,
      txCount: 4,
      encryptMs,
      calldataBytes: totalCalldata,
      submitGas,
      shotGas: shotReceipt!.gasUsed,
    })
  })

  it('GAME-404: packed nibble masks, 2 InEuint256', async function () {
    const { low, high } = packNibbleWords(buildCellArray())
    const startedAt = performance.now()
    const encrypted = unwrapResult(
      await cofhejs.encrypt([Encryptable.uint256(low), Encryptable.uint256(high)]),
    )
    const encryptMs = performance.now() - startedAt

    const proto = await hre.ethers.deployContract('ProtoPackedNibbleFleet')
    const submitTx = await proto.submitFleet(encrypted[0], encrypted[1])
    const submitReceipt = await submitTx.wait()
    expect(await proto.submitted()).to.equal(true)

    const shotTx = await proto.resolveShot(45)
    const shotReceipt = await shotTx.wait()

    rows.push({
      encoding: 'packed nibbles (2 words)',
      inputs: 2,
      txCount: 1,
      encryptMs,
      calldataBytes: calldataBytes(submitTx.data),
      submitGas: submitReceipt!.gasUsed,
      shotGas: shotReceipt!.gasUsed,
    })
  })

  it('GAME-404: ship segment list, 20 InEuint8', async function () {
    const segments = buildSegmentList()
    expect(segments).to.have.length(20)
    expect(SHIP_LENGTHS.reduce((sum, length) => sum + length, 0)).to.equal(20)

    const startedAt = performance.now()
    const encrypted = unwrapResult(
      await cofhejs.encrypt(segments.map((segment) => Encryptable.uint8(segment))),
    )
    const encryptMs = performance.now() - startedAt

    const proto = await hre.ethers.deployContract('ProtoShipSegmentFleet')
    const submitTx = await proto.submitFleet(encrypted)
    const submitReceipt = await submitTx.wait()
    expect(await proto.submitted()).to.equal(true)

    const shotTx = await proto.resolveShot(45)
    const shotReceipt = await shotTx.wait()

    rows.push({
      encoding: 'ship segments (20 cells)',
      inputs: 20,
      txCount: 1,
      encryptMs,
      calldataBytes: calldataBytes(submitTx.data),
      submitGas: submitReceipt!.gasUsed,
      shotGas: shotReceipt!.gasUsed,
    })
  })
})
