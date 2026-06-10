// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {FHE, euint8} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {InEuint8} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

/// @title CofheCompileCheck
/// @notice Compile-only proof that the pinned CoFHE Solidity dependencies
///         (GAME-302) build with this package's compiler settings. It is never
///         deployed by the game and holds no game logic; Phase 4 replaces this
///         with real encrypted-fleet contracts once the CoFHE feasibility
///         results (GAME-401..405) freeze the fleet encoding.
contract CofheCompileCheck {
    euint8 private lastValue;

    function store(InEuint8 calldata value) external {
        euint8 converted = FHE.asEuint8(value);
        lastValue = converted;
        FHE.allowThis(converted);
    }
}
