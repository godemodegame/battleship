// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {BattleshipGame} from "../BattleshipGame.sol";

/// @title BattleshipGameHarness
/// @notice Test-only subclass that forces lifecycle states which production
///         code can only reach through Phase 4 fleet submission and Phase 7
///         battle, so the timeout-claim transitions are testable today. It
///         touches public lifecycle flags only - there is no fleet data of
///         any kind here. Never deploy this contract.
contract BattleshipGameHarness is BattleshipGame {
    /// @dev Simulate a finished encrypted-fleet submission for one player.
    function harnessSetFleetSubmitted(uint256 matchId, address player, bool submitted) external {
        Match storage m = matches[matchId];
        require(m.status != MatchStatus.None, "harness: match not found");
        if (player == m.creator) {
            m.creatorState.fleetSubmitted = submitted;
        } else if (player == m.opponent) {
            m.opponentState.fleetSubmitted = submitted;
        } else {
            revert("harness: not a match player");
        }
    }

    /// @dev Simulate the Phase 7 match start: invited opponent moves first.
    function harnessStartMatch(uint256 matchId) external {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.WaitingForPlacement, "harness: not ready");
        uint64 nowTs = uint64(block.timestamp);
        m.status = MatchStatus.InProgress;
        m.startedAt = nowTs;
        m.lastActionAt = nowTs;
        m.currentTurn = m.opponent;
        m.timeoutState.turnDeadline = nowTs + TURN_TIMEOUT;
    }
}
