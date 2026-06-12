// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, InEuint8, euint8, ebool} from "cofhe-contracts-next/FHE.sol";

/// @notice Spike for the cofhe-contracts 0.1.x decrypt model on the live
///         CoFHE testnet (the 0.0.13 `FHE.decrypt` entrypoint was removed
///         upstream; results are now published from client-fetched
///         threshold-network signatures). Validates the exact cycle the
///         migrated BattleshipGame will need: compute -> allowGlobal ->
///         off-chain decryptForTx -> on-chain publish -> getDecryptResultSafe.
///         Not part of the game; safe to delete.
contract CofheDecryptSpike {
    uint256 public sumHash;
    uint256 public flagHash;

    function compute(InEuint8 calldata a, InEuint8 calldata b) external {
        euint8 va = FHE.asEuint8(a);
        euint8 vb = FHE.asEuint8(b);
        euint8 sum = FHE.add(va, vb);
        ebool flag = FHE.gt(sum, FHE.asEuint8(5));
        FHE.allowThis(sum);
        FHE.allowThis(flag);
        // Global allowance: anyone may fetch/publish the plaintext, matching
        // the game's public results (placement validity, shot outcome).
        FHE.allowGlobal(sum);
        FHE.allowGlobal(flag);
        sumHash = uint256(euint8.unwrap(sum));
        flagHash = uint256(ebool.unwrap(flag));
    }

    function readSum() external view returns (uint256 result, bool decrypted) {
        return FHE.getDecryptResultSafe(bytes32(sumHash));
    }

    function readFlag() external view returns (uint256 result, bool decrypted) {
        return FHE.getDecryptResultSafe(bytes32(flagHash));
    }
}
