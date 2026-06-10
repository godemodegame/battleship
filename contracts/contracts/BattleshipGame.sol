// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/// @title BattleshipGame
/// @notice Public match lifecycle for the encrypted Battleship MVP on
///         Arbitrum Sepolia: strict invited friend matches, joining,
///         cancellation, forfeit, timeout claims, and public reads.
///
///         Phase 3 scope (GAME-301..311): this contract intentionally has no
///         fleet or attack functions. The encrypted fleet encoding and the
///         attack/finalization ABI are frozen only after the CoFHE
///         feasibility work in Phase 4 (see docs/game-implementation-roadmap.md).
///         No plaintext fleet data may ever be added for convenience.
contract BattleshipGame {
    // ---------------------------------------------------------------------
    // Board and fleet constants (docs/contract-data-model.md)
    // ---------------------------------------------------------------------

    uint8 public constant BOARD_SIZE = 10;
    uint8 public constant CELL_COUNT = 100;
    uint8 public constant MAX_SHIPS = 10;
    uint8 public constant TOTAL_SHIP_CELLS = 20;
    uint8 public constant NO_CELL = type(uint8).max;

    // ---------------------------------------------------------------------
    // Timeout configuration
    // ---------------------------------------------------------------------
    // Constants keep the deployed bytecode fully deterministic so deployment
    // records can be validated byte-for-byte (GAME-311). Values may be tuned
    // in a redeployment after UX and gas testing.

    uint64 public constant JOIN_TIMEOUT = 24 hours;
    uint64 public constant PLACEMENT_TIMEOUT = 24 hours;
    uint64 public constant TURN_TIMEOUT = 24 hours;
    /// @dev Placeholder until the Phase 4 CoFHE prototype defines the real
    ///      resolving-recovery rule; no resolving claim path exists yet.
    uint64 public constant RESOLVING_TIMEOUT = 24 hours;

    /// @dev Cap for paginated reads so view calls stay bounded.
    uint32 public constant MAX_PAGE_LIMIT = 50;

    // ---------------------------------------------------------------------
    // Enums (docs/contract-api.md)
    // ---------------------------------------------------------------------

    enum MatchType {
        Friend,
        Open,
        Bot
    }

    enum MatchStatus {
        None,
        WaitingForOpponent,
        WaitingForPlacement,
        ValidatingPlacement,
        ReadyToStart,
        InProgress,
        ResolvingShot,
        Finished,
        Cancelled,
        Forfeited
    }

    enum PlacementStatus {
        None,
        NotSubmitted,
        Submitted,
        ResolvingValidation,
        Valid,
        Invalid
    }

    /// @dev Public result encoding: 0 reserved for unset, 1..4 real results.
    enum ShotResult {
        None,
        Miss,
        Hit,
        Sunk,
        Win
    }

    /// @dev Reason codes carried by TimeoutWinClaimed.
    enum TimeoutReason {
        None,
        PlacementTimeout,
        TurnTimeout,
        ResolvingTimeout
    }

    // ---------------------------------------------------------------------
    // Storage structs
    // ---------------------------------------------------------------------

    /// @notice Publicly revealed attack state against one player.
    ///         100 cells map onto the low bits of each 128-bit mask, bit
    ///         index == cellIndex.
    struct PublicBoard {
        uint128 attackedMask;
        uint128 missMask;
        uint128 hitMask;
        uint128 sunkMask;
    }

    /// @notice Per-player public state. Encrypted fleet storage and fleet
    ///         health are added in Phase 4 once the encoding is frozen; they
    ///         must never appear in public reads.
    struct PlayerState {
        address player;
        bool joined;
        PlacementStatus placementStatus;
        bool fleetSubmitted;
        bool fleetValid;
        uint64 fleetSubmittedAt;
        uint64 fleetValidatedAt;
        PublicBoard publicBoard;
    }

    struct TimeoutState {
        uint64 joinDeadline;
        uint64 placementDeadline;
        uint64 turnDeadline;
        uint64 resolvingDeadline;
    }

    struct Match {
        uint256 id;
        MatchType matchType;
        MatchStatus status;
        address creator;
        address opponent;
        address invitedOpponent;
        address currentTurn;
        address winner;
        uint64 createdAt;
        uint64 joinedAt;
        uint64 startedAt;
        uint64 finishedAt;
        uint64 lastActionAt;
        uint32 moveCount;
        uint32 pendingMoveId;
        PlayerState creatorState;
        PlayerState opponentState;
        TimeoutState timeoutState;
    }

    // ---------------------------------------------------------------------
    // Read structs
    // ---------------------------------------------------------------------

    struct MatchView {
        uint256 id;
        MatchType matchType;
        MatchStatus status;
        address creator;
        address opponent;
        address invitedOpponent;
        address currentTurn;
        address winner;
        uint64 createdAt;
        uint64 joinedAt;
        uint64 startedAt;
        uint64 finishedAt;
        uint64 lastActionAt;
        uint32 moveCount;
        uint32 pendingMoveId;
        TimeoutState timeoutState;
    }

    struct PlayerPublicView {
        address player;
        bool joined;
        PlacementStatus placementStatus;
        bool fleetSubmitted;
        bool fleetValid;
        PublicBoard publicBoard;
    }

    // ---------------------------------------------------------------------
    // Events (lifecycle slice of docs/contract-api.md)
    // ---------------------------------------------------------------------

    event MatchCreated(
        uint256 indexed matchId,
        address indexed creator,
        address indexed invitedOpponent
    );

    event MatchJoined(uint256 indexed matchId, address indexed opponent);

    event MatchCancelled(uint256 indexed matchId);

    event MatchForfeited(
        uint256 indexed matchId,
        address indexed loser,
        address indexed winner
    );

    event TimeoutWinClaimed(
        uint256 indexed matchId,
        address indexed winner,
        uint8 reason
    );

    // ---------------------------------------------------------------------
    // Errors (lifecycle slice of docs/contract-api.md)
    // ---------------------------------------------------------------------

    error MatchNotFound();
    error InvalidMatchStatus();
    error InvalidInvitedOpponent();
    error SelfInviteNotAllowed();
    error NotInvitedOpponent();
    error CreatorCannotJoinOwnMatch();
    error OpponentAlreadyJoined();
    error JoinDeadlineExpired();
    error OnlyCreator();
    error NotMatchPlayer();
    error CannotCancelStartedMatch();
    error MatchAlreadyFinished();
    error NoTimeoutAvailable();
    error NotTimeoutClaimant();
    error InvalidPaginationLimit();

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Id assigned to the next created match. Match ids start at 1 so
    ///         id 0 always means "no match".
    uint256 public nextMatchId = 1;

    // Internal (not private) so the test harness can drive states that only
    // become reachable through Phase 4 fleet submission and Phase 7 battle.
    mapping(uint256 matchId => Match) internal matches;
    mapping(address player => uint256[] matchIds) internal playerMatchIds;

    // ---------------------------------------------------------------------
    // Match creation
    // ---------------------------------------------------------------------

    /// @notice Create a strict friend match that only `invitedOpponent` can join.
    function createMatch(address invitedOpponent) external returns (uint256 matchId) {
        if (invitedOpponent == address(0)) revert InvalidInvitedOpponent();
        if (invitedOpponent == msg.sender) revert SelfInviteNotAllowed();

        matchId = nextMatchId;
        nextMatchId = matchId + 1;

        uint64 nowTs = uint64(block.timestamp);
        Match storage m = matches[matchId];
        m.id = matchId;
        m.matchType = MatchType.Friend;
        m.status = MatchStatus.WaitingForOpponent;
        m.creator = msg.sender;
        m.invitedOpponent = invitedOpponent;
        m.createdAt = nowTs;
        m.lastActionAt = nowTs;
        m.timeoutState.joinDeadline = nowTs + JOIN_TIMEOUT;

        m.creatorState.player = msg.sender;
        m.creatorState.joined = true;
        m.creatorState.placementStatus = PlacementStatus.NotSubmitted;

        playerMatchIds[msg.sender].push(matchId);

        emit MatchCreated(matchId, msg.sender, invitedOpponent);
    }

    // ---------------------------------------------------------------------
    // Opponent joining
    // ---------------------------------------------------------------------

    /// @notice Join a match as the invited opponent before the join deadline.
    function joinMatch(uint256 matchId) external {
        Match storage m = _getMatch(matchId);

        if (msg.sender == m.creator) revert CreatorCannotJoinOwnMatch();
        if (m.status != MatchStatus.WaitingForOpponent) {
            if (m.opponent != address(0)) revert OpponentAlreadyJoined();
            revert InvalidMatchStatus();
        }
        if (msg.sender != m.invitedOpponent) revert NotInvitedOpponent();
        if (block.timestamp > m.timeoutState.joinDeadline) revert JoinDeadlineExpired();

        uint64 nowTs = uint64(block.timestamp);
        m.opponent = msg.sender;
        m.joinedAt = nowTs;
        m.lastActionAt = nowTs;
        m.status = MatchStatus.WaitingForPlacement;
        m.timeoutState.placementDeadline = nowTs + PLACEMENT_TIMEOUT;

        m.opponentState.player = msg.sender;
        m.opponentState.joined = true;
        m.opponentState.placementStatus = PlacementStatus.NotSubmitted;

        playerMatchIds[msg.sender].push(matchId);

        emit MatchJoined(matchId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Cancellation, forfeit, and timeout claims
    // ---------------------------------------------------------------------

    /// @notice Creator-only cancellation before the match starts. This is also
    ///         the recovery path when the invited opponent never joins.
    function cancelMatch(uint256 matchId) external {
        Match storage m = _getMatch(matchId);

        if (msg.sender != m.creator) revert OnlyCreator();
        if (_isTerminal(m.status)) revert MatchAlreadyFinished();
        if (
            m.status != MatchStatus.WaitingForOpponent &&
            m.status != MatchStatus.WaitingForPlacement &&
            m.status != MatchStatus.ValidatingPlacement
        ) revert CannotCancelStartedMatch();

        uint64 nowTs = uint64(block.timestamp);
        m.status = MatchStatus.Cancelled;
        m.finishedAt = nowTs;
        m.lastActionAt = nowTs;
        m.currentTurn = address(0);

        emit MatchCancelled(matchId);
    }

    /// @notice Voluntarily lose a match that has an opponent. While the match
    ///         is still waiting for the opponent there is nobody to win it, so
    ///         the creator must use cancelMatch instead.
    function forfeit(uint256 matchId) external {
        Match storage m = _getMatch(matchId);

        if (msg.sender != m.creator && msg.sender != m.opponent) revert NotMatchPlayer();
        if (_isTerminal(m.status)) revert MatchAlreadyFinished();
        if (m.status == MatchStatus.WaitingForOpponent) revert InvalidMatchStatus();

        address winner = msg.sender == m.creator ? m.opponent : m.creator;
        _finishAsForfeit(m, winner);

        emit MatchForfeited(matchId, msg.sender, winner);
    }

    /// @notice Claim a win when the opponent stalled past a deadline.
    ///
    ///         Active cases:
    ///         - placement deadline expired and only the claimant submitted a
    ///           fleet (activates with Phase 4 fleet submission);
    ///         - turn deadline expired and the claimant is not the player on
    ///           turn (activates with Phase 7 battle).
    ///
    ///         A missed join deadline is not a win: the creator cancels with
    ///         cancelMatch. The ResolvingShot recovery rule is defined with
    ///         the Phase 4 CoFHE prototype before any production deployment.
    function claimTimeoutWin(uint256 matchId) external {
        Match storage m = _getMatch(matchId);

        if (msg.sender != m.creator && msg.sender != m.opponent) revert NotMatchPlayer();
        if (_isTerminal(m.status)) revert MatchAlreadyFinished();

        TimeoutReason reason;
        if (
            m.status == MatchStatus.WaitingForPlacement ||
            m.status == MatchStatus.ValidatingPlacement
        ) {
            if (block.timestamp <= m.timeoutState.placementDeadline) {
                revert NoTimeoutAvailable();
            }
            PlayerState storage claimant = msg.sender == m.creator
                ? m.creatorState
                : m.opponentState;
            PlayerState storage other = msg.sender == m.creator
                ? m.opponentState
                : m.creatorState;
            if (!claimant.fleetSubmitted || other.fleetSubmitted) {
                revert NotTimeoutClaimant();
            }
            reason = TimeoutReason.PlacementTimeout;
        } else if (m.status == MatchStatus.InProgress) {
            if (block.timestamp <= m.timeoutState.turnDeadline) {
                revert NoTimeoutAvailable();
            }
            if (msg.sender == m.currentTurn) revert NotTimeoutClaimant();
            reason = TimeoutReason.TurnTimeout;
        } else {
            revert NoTimeoutAvailable();
        }

        _finishAsForfeit(m, msg.sender);

        emit TimeoutWinClaimed(matchId, msg.sender, uint8(reason));
    }

    // ---------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------

    /// @notice Public match metadata without any encrypted internals.
    function getMatch(uint256 matchId) external view returns (MatchView memory) {
        Match storage m = _getMatch(matchId);
        return
            MatchView({
                id: m.id,
                matchType: m.matchType,
                status: m.status,
                creator: m.creator,
                opponent: m.opponent,
                invitedOpponent: m.invitedOpponent,
                currentTurn: m.currentTurn,
                winner: m.winner,
                createdAt: m.createdAt,
                joinedAt: m.joinedAt,
                startedAt: m.startedAt,
                finishedAt: m.finishedAt,
                lastActionAt: m.lastActionAt,
                moveCount: m.moveCount,
                pendingMoveId: m.pendingMoveId,
                timeoutState: m.timeoutState
            });
    }

    /// @notice Public player state for both slots. The opponent slot has a
    ///         zero player address until joinMatch succeeds.
    function getPlayers(
        uint256 matchId
    ) external view returns (PlayerPublicView memory creator, PlayerPublicView memory opponent) {
        Match storage m = _getMatch(matchId);
        creator = _toPlayerView(m.creatorState);
        opponent = _toPlayerView(m.opponentState);
    }

    /// @notice Paginated ids of every match a player created or joined,
    ///         ordered oldest first.
    function getPlayerMatches(
        address player,
        uint32 offset,
        uint32 limit
    ) external view returns (uint256[] memory matchIds) {
        if (limit == 0 || limit > MAX_PAGE_LIMIT) revert InvalidPaginationLimit();

        uint256[] storage all = playerMatchIds[player];
        uint256 total = all.length;
        if (offset >= total) return new uint256[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;

        matchIds = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            matchIds[i - offset] = all[i];
        }
    }

    /// @notice Total number of matches associated with a player, for paging.
    function getPlayerMatchCount(address player) external view returns (uint256) {
        return playerMatchIds[player].length;
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _getMatch(uint256 matchId) private view returns (Match storage m) {
        m = matches[matchId];
        if (m.status == MatchStatus.None) revert MatchNotFound();
    }

    function _isTerminal(MatchStatus status) private pure returns (bool) {
        return
            status == MatchStatus.Finished ||
            status == MatchStatus.Cancelled ||
            status == MatchStatus.Forfeited;
    }

    function _finishAsForfeit(Match storage m, address winner) private {
        uint64 nowTs = uint64(block.timestamp);
        m.status = MatchStatus.Forfeited;
        m.winner = winner;
        m.finishedAt = nowTs;
        m.lastActionAt = nowTs;
        m.currentTurn = address(0);
    }

    function _toPlayerView(
        PlayerState storage state
    ) private view returns (PlayerPublicView memory) {
        return
            PlayerPublicView({
                player: state.player,
                joined: state.joined,
                placementStatus: state.placementStatus,
                fleetSubmitted: state.fleetSubmitted,
                fleetValid: state.fleetValid,
                publicBoard: state.publicBoard
            });
    }
}
