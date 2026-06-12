// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, InEuint8, euint8} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @notice Temporary diagnostic for the live CoFHE testnet: isolates which
///         cofhe-contracts 0.0.13 primitive (input verification, FHE ops,
///         or decrypt request) the upgraded TaskManager still accepts.
///         Not part of the game; safe to delete.
contract CofheInfraProbe {
    euint8 private stored;

    function verifyOnly(InEuint8 calldata x) external {
        euint8 v = FHE.asEuint8(x);
        FHE.allowThis(v);
        stored = v;
    }

    function opThenStore(InEuint8 calldata x) external {
        euint8 v = FHE.asEuint8(x);
        euint8 w = FHE.add(v, FHE.asEuint8(1));
        FHE.allowThis(w);
        stored = w;
    }

    function decryptPath(InEuint8 calldata x) external {
        euint8 v = FHE.asEuint8(x);
        FHE.allowThis(v);
        FHE.decrypt(v);
    }
}
