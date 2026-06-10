// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {FHE, euint8, euint256, ebool} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {InEuint8, InEuint256} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

/// @title Fleet encoding prototypes (GAME-402..404)
/// @notice Measurement-only contracts comparing encrypted fleet encodings in
///         the mock CoFHE environment. They are exercised exclusively by
///         test/encodingBenchmarks.test.ts, are never deployed to a real
///         network, and hold no game rules beyond the hit-detection core that
///         differs per encoding. Results live in
///         docs/cofhe-feasibility-results.md and drive the GAME-405 encoding
///         decision implemented in BattleshipGame.sol.

/// @notice Baseline from the roadmap: one encrypted uint8 per board cell
///         (0 = water, 1..10 = ship id), submitted in a single transaction.
contract ProtoCellArrayFleet {
    euint8[100] private cells;
    bool public submitted;

    function submitFleet(InEuint8[100] calldata input) external {
        for (uint256 i = 0; i < 100; i++) {
            euint8 cell = FHE.asEuint8(input[i]);
            FHE.allowThis(cell);
            cells[i] = cell;
        }
        submitted = true;
    }

    /// @notice Hit-detection core: one array read plus one comparison. Ship
    ///         identity for sunk tracking would still need 10 eq/select ops
    ///         against per-ship health (shared across encodings).
    function resolveShot(uint8 cellIndex) external {
        ebool hit = FHE.ne(cells[cellIndex], FHE.asEuint8(0));
        FHE.allowThis(hit);
        FHE.decrypt(hit);
    }
}

/// @notice Same cell-array model split across four transactions of 25 cells
///         to probe per-transaction calldata and verification pressure.
contract ProtoCellArrayBatchedFleet {
    euint8[100] private cells;
    uint8 public batchesReceived;

    function submitFleetBatch(uint8 startIndex, InEuint8[] calldata input) external {
        require(startIndex % 25 == 0 && input.length == 25, "batch shape");
        for (uint256 i = 0; i < input.length; i++) {
            euint8 cell = FHE.asEuint8(input[i]);
            FHE.allowThis(cell);
            cells[startIndex + i] = cell;
        }
        batchesReceived += 1;
    }

    function resolveShot(uint8 cellIndex) external {
        ebool hit = FHE.ne(cells[cellIndex], FHE.asEuint8(0));
        FHE.allowThis(hit);
        FHE.decrypt(hit);
    }
}

/// @notice Packed-mask encoding: 100 cells x 4-bit ship id packed into two
///         euint256 words (cells 0..63 low, 64..99 high).
contract ProtoPackedNibbleFleet {
    euint256 private nibblesLow;
    euint256 private nibblesHigh;
    bool public submitted;

    function submitFleet(InEuint256 calldata low, InEuint256 calldata high) external {
        euint256 l = FHE.asEuint256(low);
        euint256 h = FHE.asEuint256(high);
        FHE.allowThis(l);
        FHE.allowThis(h);
        nibblesLow = l;
        nibblesHigh = h;
        submitted = true;
    }

    /// @notice Hit-detection core: shift + mask + compare on 256-bit words.
    function resolveShot(uint8 cellIndex) external {
        euint256 source = cellIndex < 64 ? nibblesLow : nibblesHigh;
        uint256 shift = uint256(cellIndex < 64 ? cellIndex : cellIndex - 64) * 4;
        euint256 nibble = FHE.and(FHE.shr(source, FHE.asEuint256(shift)), FHE.asEuint256(0xf));
        ebool hit = FHE.ne(nibble, FHE.asEuint256(0));
        FHE.allowThis(hit);
        FHE.decrypt(hit);
    }
}

/// @notice Ship-segment list encoding: 20 encrypted cell indexes (0..99), one
///         per occupied cell, grouped by ship in a fixed public order so ship
///         identity is the public array position.
contract ProtoShipSegmentFleet {
    euint8[20] private segments;
    bool public submitted;

    function submitFleet(InEuint8[20] calldata input) external {
        for (uint256 i = 0; i < 20; i++) {
            euint8 segment = FHE.asEuint8(input[i]);
            FHE.allowThis(segment);
            segments[i] = segment;
        }
        submitted = true;
    }

    /// @notice Hit-detection core: 20 equality checks folded with or. Unlike
    ///         the other encodings this already yields per-segment hit flags,
    ///         so sunk tracking needs no extra ship-id extraction.
    function resolveShot(uint8 cellIndex) external {
        euint8 target = FHE.asEuint8(cellIndex);
        ebool hit = FHE.eq(segments[0], target);
        for (uint256 i = 1; i < 20; i++) {
            hit = FHE.or(hit, FHE.eq(segments[i], target));
        }
        FHE.allowThis(hit);
        FHE.decrypt(hit);
    }
}
