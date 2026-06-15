// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {FHE, ebool, euint8} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {InEuint8} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

/// @title BattleshipGame
/// @notice Encrypted Battleship MVP on Arbitrum Sepolia: strict invited
///         friend matches AND permissionless open matches (random
///         matchmaking via a public, paginated open-match lobby index),
///         encrypted fleet submission and validation, encrypted shot
///         resolution, cancellation, forfeit, timeout claims, and public
///         reads.
///
///         Phase 4 scope (GAME-401..412): fleets are stored as 20 encrypted
///         ship-segment cell indexes (see docs/cofhe-feasibility-results.md
///         for the encoding decision). Hit, sunk, and win are computed with
///         FHE operations; the only values ever decrypted are the per-shot
///         result enum, the sunk ship id, and the placement validity flag.
///
///         Decrypt model (cofhe-contracts 0.1.x, June 2026 CoFHE upgrade):
///         result handles are made globally decryptable with
///         FHE.allowGlobal; any party fetches the threshold-network decrypt
///         signature off-chain and publishes it through the permissionless
///         *WithProof finalizers (or directly at the TaskManager), where the
///         TaskManager verifies the network signature on-chain before the
///         plaintext is accepted. No client ever supplies an authoritative
///         result - a forged signature reverts - and no plaintext fleet
///         data exists anywhere.
contract BattleshipGame {
    // ---------------------------------------------------------------------
    // Board and fleet constants (docs/contract-data-model.md)
    // ---------------------------------------------------------------------

    uint8 public constant BOARD_SIZE = 10;
    uint8 public constant CELL_COUNT = 100;
    uint8 public constant MAX_SHIPS = 10;
    uint8 public constant TOTAL_SHIP_CELLS = 20;
    uint8 public constant NO_CELL = type(uint8).max;

    /// @dev The 100 valid cells occupy the low bits of every 128-bit board mask.
    uint128 internal constant BOARD_MASK = (uint128(1) << 100) - 1;

    /// @notice Virtual opponent address for Bot (single-player practice)
    ///         matches. The bot has no externally owned wallet: it occupies the
    ///         opponent slot under this fixed sentinel so the whole two-player
    ///         encrypted machinery (public boards, fleet storage, shot
    ///         resolution, finalization) is reused unchanged. No real account
    ///         controls it, and bot matches never accept a join.
    address public constant BOT_OPPONENT = address(0xB07);

    /// @dev Frozen fleet layout (docs/cofhe-feasibility-results.md): the 20
    ///      encrypted segments of submitFleet are grouped by ship in this
    ///      fixed public order, so ship identity is the array position and
    ///      per-ship health initializes from public lengths at zero FHE cost.
    ///      Index: carrier(4), battleship(3), cruiser(3), destroyer A(2),
    ///      destroyer B(2), submarine(2), patrol A..D(1 each).
    bytes private constant SHIP_LENGTHS = hex"04030302020201010101";

    /// @notice Public ship lengths in submission order, for clients and tests.
    function getShipLengths() external pure returns (uint8[10] memory lengths) {
        for (uint256 i = 0; i < 10; i++) {
            lengths[i] = uint8(SHIP_LENGTHS[i]);
        }
    }

    // ---------------------------------------------------------------------
    // Timeout configuration
    // ---------------------------------------------------------------------
    // Constants keep the deployed bytecode fully deterministic so deployment
    // records can be validated byte-for-byte (GAME-311). Values may be tuned
    // in a redeployment after UX and gas testing.

    uint64 public constant JOIN_TIMEOUT = 24 hours;
    uint64 public constant PLACEMENT_TIMEOUT = 24 hours;
    uint64 public constant TURN_TIMEOUT = 24 hours;
    /// @dev Resolving-recovery rule: a stuck resolution is never a win for
    ///      either player - anyone can publish the pending threshold-network
    ///      decrypt result through the *WithProof finalizers, and both
    ///      players can always exit via forfeit. This deadline only paces
    ///      recovery UI; claimTimeoutWin stays closed during resolution.
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

    /// @notice Per-player public state. The encrypted fleet lives in the
    ///         separate `fleets` mapping so no encrypted handle can leak
    ///         through public reads of this struct.
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

    /// @notice Encrypted fleet state. Lives outside Match/PlayerState and is
    ///         never returned by any read function. Segments are encrypted
    ///         cell indexes (0..99) in the SHIP_LENGTHS submission order;
    ///         shipHealth starts at the public ship length and decrements
    ///         encrypted on every hit.
    struct EncryptedFleet {
        euint8[20] segments;
        euint8[10] shipHealth;
        bool initialized;
    }

    /// @notice Pending asynchronous placement-validity decryption for one
    ///         player. validityCtHash is the ebool handle whose plaintext the
    ///         CoFHE network posts on-chain.
    struct PendingPlacementValidation {
        bool exists;
        uint256 validityCtHash;
        uint64 requestedAt;
    }

    /// @notice One public move. result stays None until finalizeAttack reads
    ///         the on-chain decrypt result. sunkShipId is 0 unless the move
    ///         sank a ship (1..10, public ship metadata order).
    struct Move {
        uint32 moveId;
        address attacker;
        address defender;
        uint8 cellIndex;
        ShotResult result;
        uint8 sunkShipId;
        uint64 submittedAt;
        uint64 resolvedAt;
        bool finalized;
    }

    /// @notice The single unresolved shot of a match. resultCtHash and
    ///         sunkShipCtHash are euint8 handles awaiting network decryption;
    ///         the handles are public values, decryption stays ACL-gated.
    struct PendingShot {
        bool exists;
        uint32 moveId;
        address attacker;
        address defender;
        uint8 cellIndex;
        uint256 resultCtHash;
        uint256 sunkShipCtHash;
        uint64 submittedAt;
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

    struct MoveView {
        uint32 moveId;
        address attacker;
        address defender;
        uint8 cellIndex;
        ShotResult result;
        uint8 sunkShipId;
        uint64 submittedAt;
        uint64 resolvedAt;
        bool finalized;
    }

    struct PendingShotView {
        bool exists;
        uint32 moveId;
        address attacker;
        address defender;
        uint8 cellIndex;
        uint256 resultCtHash;
        uint256 sunkShipCtHash;
        uint64 submittedAt;
    }

    // ---------------------------------------------------------------------
    // Events (docs/contract-api.md)
    // ---------------------------------------------------------------------

    event MatchCreated(
        uint256 indexed matchId,
        address indexed creator,
        address indexed invitedOpponent
    );

    event MatchJoined(uint256 indexed matchId, address indexed opponent);

    /// @dev Emitted when a single-player practice match against the on-chain
    ///      bot is created. The bot occupies the opponent slot under
    ///      BOT_OPPONENT.
    event BotMatchCreated(uint256 indexed matchId, address indexed player);

    /// @dev Emitted when any caller advances the bot's turn. The caller only
    ///      triggers execution; the contract chooses the target cell.
    event BotMoveTriggered(
        uint256 indexed matchId,
        uint32 indexed moveId,
        address indexed caller
    );

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

    event FleetSubmitted(uint256 indexed matchId, address indexed player);

    /// @dev ctHash is the ebool validity handle; emitted on submission and on
    ///      every retry so clients can track the pending decryption.
    event FleetValidationRequested(
        uint256 indexed matchId,
        address indexed player,
        uint256 ctHash
    );

    event FleetValidated(uint256 indexed matchId, address indexed player, bool valid);

    event MatchStarted(uint256 indexed matchId, address indexed firstPlayer);

    event ShotSubmitted(
        uint256 indexed matchId,
        uint32 indexed moveId,
        address indexed attacker,
        address defender,
        uint8 cellIndex
    );

    event ShotResolutionRequested(
        uint256 indexed matchId,
        uint32 indexed moveId,
        uint256 resultCtHash,
        uint256 sunkShipCtHash
    );

    /// @dev result is the ShotResult enum value (1..4). sunkShipId is 0
    ///      unless the shot sank a ship.
    event ShotResolved(
        uint256 indexed matchId,
        uint32 indexed moveId,
        uint8 result,
        uint8 sunkShipId
    );

    event TurnChanged(uint256 indexed matchId, address indexed currentTurn);

    event MatchFinished(
        uint256 indexed matchId,
        address indexed winner,
        uint32 moveCount
    );

    // ---------------------------------------------------------------------
    // Errors (docs/contract-api.md)
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
    error NotMatchPlayerAddress();
    error FleetAlreadySubmitted();
    error PlacementValidationPending();
    error NoPendingPlacementValidation();
    error DecryptionResultNotReady();
    error NotYourTurn();
    error InvalidCellIndex();
    error CellAlreadyAttacked();
    error PendingShotExists();
    error NoPendingShot();
    error InvalidMoveId();
    error MoveNotFound();
    error InvalidShotResult();
    error NotBotMatch();
    error BotMatchCannotBeJoined();
    error BotHasNoTarget();

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Id assigned to the next created match. Match ids start at 1 so
    ///         id 0 always means "no match".
    uint256 public nextMatchId = 1;

    // Internal (not private) so the test harness can drive states that only
    // become reachable through the full battle flow.
    mapping(uint256 matchId => Match) internal matches;
    mapping(address player => uint256[] matchIds) internal playerMatchIds;

    /// @dev Enumerable set of open matches still waiting for any opponent.
    ///      Open matches have no invited opponent, so they cannot be found
    ///      through playerMatchIds by a stranger; this index backs the public
    ///      getOpenMatches lobby view. Entries are swap-popped the moment a
    ///      match leaves WaitingForOpponent (joined or cancelled), so the array
    ///      only ever holds currently-joinable open matches.
    uint256[] internal openMatchIds;
    /// @dev matchId => (1-based position in openMatchIds); 0 means "not indexed".
    mapping(uint256 matchId => uint256 indexPlusOne) internal openMatchIndex;

    /// @dev Encrypted fleets, keyed per player. Never exposed by reads.
    mapping(uint256 matchId => mapping(address player => EncryptedFleet)) private fleets;
    mapping(uint256 matchId => mapping(address player => PendingPlacementValidation))
        private pendingValidations;
    mapping(uint256 matchId => PendingShot) private pendingShots;
    /// @dev Move ids start at 1 and equal Match.moveCount at creation time.
    mapping(uint256 matchId => mapping(uint32 moveId => Move)) private moves;

    /// @dev Per-defender bitmap of sunk ship ids (bit s set == ship index s is
    ///      sunk). Maintained on every finalized Sunk/Win shot and read by the
    ///      on-chain hard bot to size its placement heatmap (remaining ship
    ///      lengths). Kept off the public views to avoid read-ABI churn.
    mapping(uint256 matchId => mapping(address defender => uint16 bitmap))
        internal sunkShipsBitmap;

    // ---------------------------------------------------------------------
    // Match creation
    // ---------------------------------------------------------------------

    /// @notice Create a strict friend match that only `invitedOpponent` can join.
    function createMatch(address invitedOpponent) external returns (uint256 matchId) {
        matchId = _createMatchBase(MatchType.Friend, invitedOpponent);
    }

    /// @notice Create a friend match and submit the creator's encrypted fleet
    ///         in a single transaction (placement-first UX, GAME-505/506).
    ///         The match stays WaitingForOpponent so the invited player can
    ///         still join; the creator's fleet validation runs concurrently
    ///         and may finalize before anyone joins.
    function createWithFleet(
        address invitedOpponent,
        InEuint8[20] calldata segments
    ) external returns (uint256 matchId) {
        matchId = _createMatchBase(MatchType.Friend, invitedOpponent);
        Match storage m = matches[matchId];
        // Status intentionally stays WaitingForOpponent: joinMatch/joinWithFleet
        // still require it, and finalizeFleetValidation accepts it.
        _storeAndValidateFleet(matchId, m, msg.sender, segments);
    }

    /// @notice Create an open match that ANY other player may join. There is no
    ///         invited opponent (invitedOpponent stays address(0)); the match is
    ///         pushed to the public open-match index so the lobby can find it.
    function createOpenMatch() external returns (uint256 matchId) {
        matchId = _createMatchBase(MatchType.Open, address(0));
    }

    /// @notice Create an open match and submit the creator's encrypted fleet in
    ///         a single transaction (placement-first UX). Mirrors createWithFleet
    ///         with no invited opponent: any stranger can join via joinWithFleet
    ///         while the creator's fleet validates concurrently.
    function createOpenWithFleet(
        InEuint8[20] calldata segments
    ) external returns (uint256 matchId) {
        matchId = _createMatchBase(MatchType.Open, address(0));
        Match storage m = matches[matchId];
        _storeAndValidateFleet(matchId, m, msg.sender, segments);
    }

    /// @notice Create a single-player practice match against the on-chain hard
    ///         bot in one transaction. The caller submits BOTH encrypted
    ///         fleets: their own (validated asynchronously, exactly as PvP) and
    ///         the bot's (client auto-placed, trusted, stored without
    ///         validation). The bot fills the opponent slot under BOT_OPPONENT
    ///         and the human moves first once their own fleet validates.
    ///
    ///         The bot fleet is client-supplied because the current CoFHE stack
    ///         has no usable on-chain randomness, so a value hidden from all
    ///         parties cannot be generated on-chain (see
    ///         docs/computer-opponent-design.md). This is a stakeless practice
    ///         mode: a determined player could inspect their own bot's layout,
    ///         which only weakens their practice opponent. Every shot is still
    ///         resolved by the contract under FHE; nothing is decrypted
    ///         client-side, and the bot's target is always chosen on-chain.
    function createBotMatch(
        InEuint8[20] calldata playerFleet,
        InEuint8[20] calldata botFleet
    ) external returns (uint256 matchId) {
        matchId = _createMatchBase(MatchType.Bot, address(0));
        Match storage m = matches[matchId];

        // Seat the virtual bot in the opponent slot.
        uint64 nowTs = uint64(block.timestamp);
        m.opponent = BOT_OPPONENT;
        m.joinedAt = nowTs;
        m.opponentState.player = BOT_OPPONENT;
        m.opponentState.joined = true;

        // Player fleet: stored and validated asynchronously, as in PvP.
        _storeAndValidateFleet(matchId, m, msg.sender, playerFleet);
        // Bot fleet: trusted client placement, stored and marked valid now.
        _storeBotFleet(m, matchId, botFleet);

        m.status = MatchStatus.ValidatingPlacement;

        emit MatchJoined(matchId, BOT_OPPONENT);
        emit BotMatchCreated(matchId, msg.sender);
    }

    /// @dev Store the bot's client-supplied encrypted fleet under BOT_OPPONENT
    ///      and mark it valid immediately. No encrypted placement validation
    ///      runs: the bot fleet is trusted client auto-placement and an invalid
    ///      layout would only handicap the bot. Mirrors the storage half of
    ///      _storeAndValidateFleet.
    function _storeBotFleet(
        Match storage m,
        uint256 matchId,
        InEuint8[20] calldata botFleet
    ) private {
        EncryptedFleet storage fleet = fleets[matchId][BOT_OPPONENT];
        for (uint256 i = 0; i < TOTAL_SHIP_CELLS; i++) {
            euint8 segment = FHE.asEuint8(botFleet[i]);
            FHE.allowThis(segment);
            fleet.segments[i] = segment;
        }
        for (uint256 s = 0; s < MAX_SHIPS; s++) {
            euint8 health = FHE.asEuint8(uint8(SHIP_LENGTHS[s]));
            FHE.allowThis(health);
            fleet.shipHealth[s] = health;
        }
        fleet.initialized = true;

        uint64 nowTs = uint64(block.timestamp);
        PlayerState storage bot = m.opponentState;
        bot.fleetSubmitted = true;
        bot.fleetValid = true;
        bot.placementStatus = PlacementStatus.Valid;
        bot.fleetSubmittedAt = nowTs;
        bot.fleetValidatedAt = nowTs;

        emit FleetSubmitted(matchId, BOT_OPPONENT);
        emit FleetValidated(matchId, BOT_OPPONENT, true);
    }

    /// @dev Shared match-creation core. Friend matches require a strict invited
    ///      opponent (enforced again on join); Open matches keep invitedOpponent
    ///      at address(0) and are added to the enumerable open-match index.
    function _createMatchBase(
        MatchType matchType,
        address invitedOpponent
    ) private returns (uint256 matchId) {
        if (matchType == MatchType.Friend) {
            if (invitedOpponent == address(0)) revert InvalidInvitedOpponent();
            if (invitedOpponent == msg.sender) revert SelfInviteNotAllowed();
        }

        matchId = nextMatchId;
        nextMatchId = matchId + 1;

        uint64 nowTs = uint64(block.timestamp);
        Match storage m = matches[matchId];
        m.id = matchId;
        m.matchType = matchType;
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

        if (matchType == MatchType.Open) {
            _addOpenMatch(matchId);
        }

        emit MatchCreated(matchId, msg.sender, invitedOpponent);
    }

    // ---------------------------------------------------------------------
    // Opponent joining
    // ---------------------------------------------------------------------

    /// @notice Join a match as the invited opponent before the join deadline.
    function joinMatch(uint256 matchId) external {
        Match storage m = _getMatch(matchId);
        _joinMatchBase(matchId, m);
    }

    /// @notice Join a match and submit the encrypted fleet in a single
    ///         transaction (placement-first UX). Validation for each player
    ///         proceeds asynchronously; the match starts once both fleets are
    ///         valid (invited opponent moves first).
    function joinWithFleet(uint256 matchId, InEuint8[20] calldata segments) external {
        Match storage m = _getMatch(matchId);
        _joinMatchBase(matchId, m);
        _storeAndValidateFleet(matchId, m, msg.sender, segments);
        m.status = MatchStatus.ValidatingPlacement;
    }

    /// @dev Shared join core for joinMatch and joinWithFleet. Friend matches
    ///      stay strictly invite-gated; Open matches accept any non-creator
    ///      before the join deadline (the creator is still blocked above).
    function _joinMatchBase(uint256 matchId, Match storage m) private {
        if (m.matchType == MatchType.Bot) revert BotMatchCannotBeJoined();
        if (msg.sender == m.creator) revert CreatorCannotJoinOwnMatch();
        if (m.status != MatchStatus.WaitingForOpponent) {
            if (m.opponent != address(0)) revert OpponentAlreadyJoined();
            revert InvalidMatchStatus();
        }
        if (m.matchType == MatchType.Friend && msg.sender != m.invitedOpponent) {
            revert NotInvitedOpponent();
        }
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

        // The match has left WaitingForOpponent; drop it from the lobby index.
        if (m.matchType == MatchType.Open) {
            _removeOpenMatch(matchId);
        }

        emit MatchJoined(matchId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Encrypted fleet submission and validation (GAME-405, GAME-406)
    // ---------------------------------------------------------------------

    /// @notice Submit the caller's encrypted fleet: 20 encrypted cell indexes
    ///         grouped by ship in the fixed SHIP_LENGTHS order. Placement
    ///         validity (range, straightness, contiguity, row bounds) is
    ///         computed encrypted in this transaction and resolved
    ///         asynchronously; finalizeFleetValidation publishes the result.
    ///         A fleet judged Invalid can be resubmitted.
    function submitFleet(uint256 matchId, InEuint8[20] calldata segments) external {
        Match storage m = _getMatch(matchId);
        if (
            m.status != MatchStatus.WaitingForPlacement &&
            m.status != MatchStatus.ValidatingPlacement
        ) revert InvalidMatchStatus();

        _storeAndValidateFleet(matchId, m, msg.sender, segments);
        m.status = MatchStatus.ValidatingPlacement;
    }

    /// @dev Stores `player`'s encrypted fleet, runs encrypted placement
    ///      validation (~130 FHE ops), and records the pending validity
    ///      decryption. Deliberately does NOT set m.status — each caller owns
    ///      the lifecycle transition, because the creator's fleet may validate
    ///      while the match is still WaitingForOpponent. Reverts if the player
    ///      already has a pending or already-valid placement.
    function _storeAndValidateFleet(
        uint256 matchId,
        Match storage m,
        address player,
        InEuint8[20] calldata segments
    ) private {
        PlayerState storage ps = _playerStateOf(m, player);
        if (ps.placementStatus == PlacementStatus.ResolvingValidation) {
            revert PlacementValidationPending();
        }
        if (ps.placementStatus == PlacementStatus.Valid) revert FleetAlreadySubmitted();

        EncryptedFleet storage fleet = fleets[matchId][player];
        for (uint256 i = 0; i < TOTAL_SHIP_CELLS; i++) {
            euint8 segment = FHE.asEuint8(segments[i]);
            FHE.allowThis(segment);
            fleet.segments[i] = segment;
        }
        for (uint256 s = 0; s < MAX_SHIPS; s++) {
            euint8 health = FHE.asEuint8(uint8(SHIP_LENGTHS[s]));
            FHE.allowThis(health);
            fleet.shipHealth[s] = health;
        }
        fleet.initialized = true;

        ebool valid = _validatePlacement(fleet);
        FHE.allowThis(valid);
        // The validity flag is public by design: anyone may fetch the
        // threshold-network decrypt signature for it and publish it.
        FHE.allowGlobal(valid);

        uint256 validityCtHash = uint256(ebool.unwrap(valid));
        pendingValidations[matchId][player] = PendingPlacementValidation({
            exists: true,
            validityCtHash: validityCtHash,
            requestedAt: uint64(block.timestamp)
        });

        uint64 nowTs = uint64(block.timestamp);
        ps.placementStatus = PlacementStatus.ResolvingValidation;
        ps.fleetSubmitted = true;
        ps.fleetValid = false;
        ps.fleetSubmittedAt = nowTs;
        m.lastActionAt = nowTs;

        emit FleetSubmitted(matchId, player);
        emit FleetValidationRequested(matchId, player, validityCtHash);
    }

    /// @notice Publish a resolved placement-validity result. Permissionless:
    ///         the plaintext comes from the on-chain decrypt result whose
    ///         threshold-network signature the TaskManager verified, never
    ///         from the caller. Starts the match when both fleets are valid
    ///         (invited opponent moves first).
    function finalizeFleetValidation(uint256 matchId, address player) public {
        Match storage m = _getMatch(matchId);
        // createWithFleet validates the creator's fleet while the match is
        // still WaitingForOpponent, so all three placement-phase statuses are
        // accepted; the pending-existence check below gates the real work.
        if (
            m.status != MatchStatus.WaitingForOpponent &&
            m.status != MatchStatus.WaitingForPlacement &&
            m.status != MatchStatus.ValidatingPlacement
        ) revert InvalidMatchStatus();

        PlayerState storage ps = _playerStateOf(m, player);
        PendingPlacementValidation storage pending = pendingValidations[matchId][player];
        if (!pending.exists) revert NoPendingPlacementValidation();

        (bool valid, bool ready) = FHE.getDecryptResultSafe(
            ebool.wrap(bytes32(pending.validityCtHash))
        );
        if (!ready) revert DecryptionResultNotReady();

        delete pendingValidations[matchId][player];

        uint64 nowTs = uint64(block.timestamp);
        ps.fleetValidatedAt = nowTs;
        m.lastActionAt = nowTs;
        if (valid) {
            ps.placementStatus = PlacementStatus.Valid;
            ps.fleetValid = true;
        } else {
            ps.placementStatus = PlacementStatus.Invalid;
            ps.fleetValid = false;
            // Resubmission replaces the fleet; the stale handles are unusable
            // because every read path checks placementStatus first.
            ps.fleetSubmitted = false;
        }

        emit FleetValidated(matchId, player, valid);

        if (m.creatorState.fleetValid && m.opponentState.fleetValid) {
            _startMatch(m);
        }
    }

    /// @notice Publish the threshold-network decrypt signature for a pending
    ///         placement validation and finalize it in one transaction.
    ///         Permissionless: the TaskManager verifies the network
    ///         signature over (ctHash, result) on-chain, so a forged result
    ///         reverts. Skips the publish when the result already landed.
    function finalizeFleetValidationWithProof(
        uint256 matchId,
        address player,
        uint256 result,
        bytes calldata signature
    ) external {
        Match storage m = _getMatch(matchId);
        if (
            m.status != MatchStatus.WaitingForOpponent &&
            m.status != MatchStatus.WaitingForPlacement &&
            m.status != MatchStatus.ValidatingPlacement
        ) revert InvalidMatchStatus();
        _playerStateOf(m, player);

        PendingPlacementValidation storage pending = pendingValidations[matchId][player];
        if (!pending.exists) revert NoPendingPlacementValidation();

        _publishIfNeeded(pending.validityCtHash, result, signature);
        finalizeFleetValidation(matchId, player);
    }

    // ---------------------------------------------------------------------
    // Attack and shot finalization (GAME-407, GAME-408)
    // ---------------------------------------------------------------------

    /// @notice Attack a public cell on the opponent's board. Computes the
    ///         encrypted Miss/Hit/Sunk/Win result and the encrypted sunk ship
    ///         id, requests their decryption, and freezes the match in
    ///         ResolvingShot until finalizeAttack.
    function attack(uint256 matchId, uint8 cellIndex) external returns (uint32 moveId) {
        Match storage m = _getMatch(matchId);
        if (m.status != MatchStatus.InProgress) revert InvalidMatchStatus();
        if (msg.sender != m.currentTurn) revert NotYourTurn();
        if (cellIndex >= CELL_COUNT) revert InvalidCellIndex();
        if (pendingShots[matchId].exists) revert PendingShotExists();

        address defender = msg.sender == m.creator ? m.opponent : m.creator;
        moveId = _submitShot(m, matchId, msg.sender, defender, cellIndex);
    }

    /// @notice Advance the bot's turn in a Bot match. PERMISSIONLESS by design
    ///         (docs/computer-opponent-design.md): any caller may trigger the
    ///         bot move, but the caller does NOT choose the target — the
    ///         contract derives it from the player's public board with the same
    ///         hard heatmap as the local practice bot. The bot's shot is then
    ///         resolved through the identical encrypted pipeline and finalized
    ///         with finalizeAttack / finalizeAttackWithProof.
    function executeBotMove(uint256 matchId) external returns (uint32 moveId) {
        Match storage m = _getMatch(matchId);
        if (m.matchType != MatchType.Bot) revert NotBotMatch();
        if (m.status != MatchStatus.InProgress) revert InvalidMatchStatus();
        if (m.currentTurn != BOT_OPPONENT) revert NotYourTurn();
        if (pendingShots[matchId].exists) revert PendingShotExists();

        uint8 cellIndex = _chooseBotTargetForMatch(m, matchId);
        moveId = _submitShot(m, matchId, BOT_OPPONENT, m.creator, cellIndex);
        emit BotMoveTriggered(matchId, moveId, msg.sender);
    }

    /// @dev Shared shot submission for both human attacks and bot moves. Marks
    ///      the public cell attacked, records the pending Move, runs the
    ///      encrypted resolution, and freezes the match in ResolvingShot until
    ///      finalizeAttack. The caller has already validated turn/cell.
    function _submitShot(
        Match storage m,
        uint256 matchId,
        address attacker,
        address defender,
        uint8 cellIndex
    ) private returns (uint32 moveId) {
        PlayerState storage defenderState = _playerStateOf(m, defender);

        uint128 cellBit = uint128(1) << cellIndex;
        if (defenderState.publicBoard.attackedMask & cellBit != 0) {
            revert CellAlreadyAttacked();
        }
        defenderState.publicBoard.attackedMask |= cellBit;

        moveId = m.moveCount + 1;
        m.moveCount = moveId;

        uint64 nowTs = uint64(block.timestamp);
        moves[matchId][moveId] = Move({
            moveId: moveId,
            attacker: attacker,
            defender: defender,
            cellIndex: cellIndex,
            result: ShotResult.None,
            sunkShipId: 0,
            submittedAt: nowTs,
            resolvedAt: 0,
            finalized: false
        });

        (euint8 eResult, euint8 eSunkShipId) = _resolveShotEncrypted(
            fleets[matchId][defender],
            cellIndex
        );
        FHE.allowThis(eResult);
        FHE.allowThis(eSunkShipId);
        // Shot outcomes are public by design: anyone may fetch and publish
        // their threshold-network decrypt signatures.
        FHE.allowGlobal(eResult);
        FHE.allowGlobal(eSunkShipId);

        uint256 resultCtHash = uint256(euint8.unwrap(eResult));
        uint256 sunkShipCtHash = uint256(euint8.unwrap(eSunkShipId));
        pendingShots[matchId] = PendingShot({
            exists: true,
            moveId: moveId,
            attacker: attacker,
            defender: defender,
            cellIndex: cellIndex,
            resultCtHash: resultCtHash,
            sunkShipCtHash: sunkShipCtHash,
            submittedAt: nowTs
        });

        m.status = MatchStatus.ResolvingShot;
        m.pendingMoveId = moveId;
        m.lastActionAt = nowTs;
        m.timeoutState.resolvingDeadline = nowTs + RESOLVING_TIMEOUT;

        emit ShotSubmitted(matchId, moveId, attacker, defender, cellIndex);
        emit ShotResolutionRequested(matchId, moveId, resultCtHash, sunkShipCtHash);
    }

    /// @notice Publish a resolved shot. Permissionless: the result is read
    ///         from the on-chain decrypt results, never from the caller.
    ///         Miss passes the turn to the defender; Hit and Sunk keep the
    ///         attacker on turn; Win finishes the match.
    function finalizeAttack(uint256 matchId, uint32 moveId) public {
        Match storage m = _getMatch(matchId);
        if (m.status != MatchStatus.ResolvingShot) revert InvalidMatchStatus();

        PendingShot memory pending = pendingShots[matchId];
        if (!pending.exists) revert NoPendingShot();
        if (moveId != pending.moveId) revert InvalidMoveId();

        (ShotResult result, uint8 sunkShipId) = _readShotDecryptResults(pending);

        delete pendingShots[matchId];
        _recordResolvedMove(matchId, moveId, result, sunkShipId);
        _applyShotResult(m, pending, result, sunkShipId);
    }

    /// @dev Reads both on-chain decrypt results for a pending shot, failing
    ///      closed on unfinished decryption or an out-of-range result.
    function _readShotDecryptResults(
        PendingShot memory pending
    ) private view returns (ShotResult result, uint8 sunkShipId) {
        (uint8 rawResult, bool resultReady) = FHE.getDecryptResultSafe(
            euint8.wrap(bytes32(pending.resultCtHash))
        );
        (uint8 rawSunkShipId, bool sunkReady) = FHE.getDecryptResultSafe(
            euint8.wrap(bytes32(pending.sunkShipCtHash))
        );
        if (!resultReady || !sunkReady) revert DecryptionResultNotReady();

        // The encrypted pipeline only emits 1..4; fail closed regardless.
        if (rawResult < uint8(ShotResult.Miss) || rawResult > uint8(ShotResult.Win)) {
            revert InvalidShotResult();
        }
        result = ShotResult(rawResult);
        sunkShipId = (result == ShotResult.Sunk || result == ShotResult.Win)
            ? rawSunkShipId
            : 0;
    }

    function _recordResolvedMove(
        uint256 matchId,
        uint32 moveId,
        ShotResult result,
        uint8 sunkShipId
    ) private {
        Move storage move = moves[matchId][moveId];
        move.result = result;
        move.sunkShipId = sunkShipId;
        move.resolvedAt = uint64(block.timestamp);
        move.finalized = true;
    }

    function _applyShotResult(
        Match storage m,
        PendingShot memory pending,
        ShotResult result,
        uint8 sunkShipId
    ) private {
        PlayerState storage defenderState = _playerStateOf(m, pending.defender);
        uint128 cellBit = uint128(1) << pending.cellIndex;
        if (result == ShotResult.Miss) {
            defenderState.publicBoard.missMask |= cellBit;
        } else {
            defenderState.publicBoard.hitMask |= cellBit;
            if (result != ShotResult.Hit) {
                // MVP sunk reveal rule (docs/contract-data-model.md): only
                // the final attacked cell is marked sunk.
                defenderState.publicBoard.sunkMask |= cellBit;
                // Track which of the defender's ships are sunk so the on-chain
                // bot can size its heatmap to the surviving lengths.
                if (sunkShipId >= 1 && sunkShipId <= MAX_SHIPS) {
                    sunkShipsBitmap[m.id][pending.defender] |= uint16(uint256(1) << (sunkShipId - 1));
                }
            }
        }

        uint64 nowTs = uint64(block.timestamp);
        m.pendingMoveId = 0;
        m.lastActionAt = nowTs;
        m.timeoutState.resolvingDeadline = 0;

        emit ShotResolved(m.id, pending.moveId, uint8(result), sunkShipId);

        if (result == ShotResult.Win) {
            m.status = MatchStatus.Finished;
            m.winner = pending.attacker;
            m.finishedAt = nowTs;
            m.currentTurn = address(0);
            emit MatchFinished(m.id, pending.attacker, m.moveCount);
        } else {
            m.status = MatchStatus.InProgress;
            m.timeoutState.turnDeadline = nowTs + TURN_TIMEOUT;
            if (result == ShotResult.Miss) {
                m.currentTurn = pending.defender;
                emit TurnChanged(m.id, pending.defender);
            }
        }
    }

    /// @notice Publish the threshold-network decrypt signatures for the
    ///         pending shot and finalize it in one transaction.
    ///         Permissionless: the TaskManager verifies each network
    ///         signature over (ctHash, result) on-chain, so a forged result
    ///         reverts. Skips publishes whose result already landed.
    function finalizeAttackWithProof(
        uint256 matchId,
        uint32 moveId,
        uint256 result,
        bytes calldata resultSignature,
        uint256 sunkShipId,
        bytes calldata sunkShipSignature
    ) external {
        Match storage m = _getMatch(matchId);
        if (m.status != MatchStatus.ResolvingShot) revert InvalidMatchStatus();

        PendingShot storage pending = pendingShots[matchId];
        if (!pending.exists) revert NoPendingShot();
        if (moveId != pending.moveId) revert InvalidMoveId();

        _publishIfNeeded(pending.resultCtHash, result, resultSignature);
        _publishIfNeeded(pending.sunkShipCtHash, sunkShipId, sunkShipSignature);
        finalizeAttack(matchId, moveId);
    }

    /// @dev Publishes a threshold-network decrypt result unless it is
    ///      already readable. The TaskManager rejects invalid signatures, so
    ///      the caller never holds result authority.
    function _publishIfNeeded(
        uint256 ctHash,
        uint256 result,
        bytes calldata signature
    ) private {
        (, bool ready) = FHE.getDecryptResultSafe(bytes32(ctHash));
        if (!ready) {
            FHE.publishDecryptResult(ctHash, result, signature);
        }
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

        // No-op when the match was never (or is no longer) indexed as open.
        if (m.matchType == MatchType.Open) {
            _removeOpenMatch(matchId);
        }

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
        // Bot matches are paced entirely by the human (the bot only moves when
        // someone calls executeBotMove), so deadline-based wins do not apply.
        if (m.matchType == MatchType.Bot) revert NoTimeoutAvailable();

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

    /// @notice Paginated ids of open matches currently waiting for any
    ///         opponent, backing the matchmaking lobby. The index is maintained
    ///         by swap-pop, so order is not guaranteed stable across joins;
    ///         clients hydrate each id with getMatch and sort/filter (e.g. by
    ///         createdAt or join deadline) as needed.
    function getOpenMatches(
        uint32 offset,
        uint32 limit
    ) external view returns (uint256[] memory matchIds) {
        if (limit == 0 || limit > MAX_PAGE_LIMIT) revert InvalidPaginationLimit();

        uint256 total = openMatchIds.length;
        if (offset >= total) return new uint256[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;

        matchIds = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            matchIds[i - offset] = openMatchIds[i];
        }
    }

    /// @notice Number of open matches currently waiting for an opponent.
    function getOpenMatchCount() external view returns (uint256) {
        return openMatchIds.length;
    }

    /// @notice One public move. Move ids start at 1.
    function getMove(uint256 matchId, uint32 moveId) external view returns (MoveView memory) {
        Match storage m = _getMatch(matchId);
        if (moveId == 0 || moveId > m.moveCount) revert MoveNotFound();
        return _toMoveView(moves[matchId][moveId]);
    }

    /// @notice Paginated public move history, oldest first.
    function getMoveHistory(
        uint256 matchId,
        uint32 offset,
        uint32 limit
    ) external view returns (MoveView[] memory result) {
        if (limit == 0 || limit > MAX_PAGE_LIMIT) revert InvalidPaginationLimit();
        Match storage m = _getMatch(matchId);

        uint32 total = m.moveCount;
        if (offset >= total) return new MoveView[](0);

        uint32 end = offset + limit;
        if (end > total) end = total;

        result = new MoveView[](end - offset);
        for (uint32 i = offset; i < end; i++) {
            // Stored move ids are 1-based.
            result[i - offset] = _toMoveView(moves[matchId][i + 1]);
        }
    }

    /// @notice Pending shot state for refresh recovery. The ct hashes are
    ///         public handle identifiers; decryption stays ACL-gated.
    function getPendingShot(uint256 matchId) external view returns (PendingShotView memory) {
        _getMatch(matchId);
        PendingShot storage pending = pendingShots[matchId];
        return
            PendingShotView({
                exists: pending.exists,
                moveId: pending.moveId,
                attacker: pending.attacker,
                defender: pending.defender,
                cellIndex: pending.cellIndex,
                resultCtHash: pending.resultCtHash,
                sunkShipCtHash: pending.sunkShipCtHash,
                submittedAt: pending.submittedAt
            });
    }

    /// @notice Pending placement-validation state for refresh recovery. The
    ///         ct hash is a public handle identifier whose plaintext is
    ///         globally decryptable by design.
    function getPendingPlacementValidation(
        uint256 matchId,
        address player
    ) external view returns (PendingPlacementValidation memory) {
        Match storage m = _getMatch(matchId);
        _playerStateOf(m, player);
        return pendingValidations[matchId][player];
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _getMatch(uint256 matchId) private view returns (Match storage m) {
        m = matches[matchId];
        if (m.status == MatchStatus.None) revert MatchNotFound();
    }

    /// @dev Append a match to the open-match lobby index, recording its 1-based
    ///      position so _removeOpenMatch can find it in O(1).
    function _addOpenMatch(uint256 matchId) private {
        openMatchIds.push(matchId);
        openMatchIndex[matchId] = openMatchIds.length;
    }

    /// @dev Remove a match from the open-match index via swap-and-pop. No-op
    ///      when the match is not currently indexed (a Friend match, or an open
    ///      match already joined or cancelled), so callers may invoke it freely.
    function _removeOpenMatch(uint256 matchId) private {
        uint256 indexPlusOne = openMatchIndex[matchId];
        if (indexPlusOne == 0) return;

        uint256 i = indexPlusOne - 1;
        uint256 lastIndex = openMatchIds.length - 1;
        if (i != lastIndex) {
            uint256 moved = openMatchIds[lastIndex];
            openMatchIds[i] = moved;
            openMatchIndex[moved] = i + 1;
        }
        openMatchIds.pop();
        openMatchIndex[matchId] = 0;
    }

    /// @dev Player state by address; reverts for non-players. The error
    ///      distinguishes caller checks (NotMatchPlayer via msg.sender) from
    ///      address-argument checks per docs/contract-api.md.
    function _playerStateOf(
        Match storage m,
        address player
    ) private view returns (PlayerState storage) {
        if (player == m.creator) return m.creatorState;
        if (player != address(0) && player == m.opponent) return m.opponentState;
        if (player == msg.sender) revert NotMatchPlayer();
        revert NotMatchPlayerAddress();
    }

    /// @dev Both fleets valid: PvP gives the first turn to the invited
    ///      opponent; a Bot match gives it to the human (creator) so the player
    ///      always opens.
    function _startMatch(Match storage m) private {
        uint64 nowTs = uint64(block.timestamp);
        m.status = MatchStatus.InProgress;
        m.startedAt = nowTs;
        m.lastActionAt = nowTs;
        address first = m.matchType == MatchType.Bot ? m.creator : m.opponent;
        m.currentTurn = first;
        m.timeoutState.turnDeadline = nowTs + TURN_TIMEOUT;
        m.timeoutState.placementDeadline = 0;

        emit MatchStarted(m.id, first);
        emit TurnChanged(m.id, first);
    }

    /// @dev Encrypted placement validation (GAME-406), ~130 FHE operations:
    ///      every segment in range, every multi-cell ship straight and
    ///      contiguous (consecutive deltas of exactly 1 or 10, which also
    ///      forces distinct cells per ship), and horizontal ships inside one
    ///      row. Cross-ship overlap is intentionally not checked: it only
    ///      harms the player who does it (docs/cofhe-feasibility-results.md).
    function _validatePlacement(EncryptedFleet storage fleet) private returns (ebool valid) {
        euint8 one = FHE.asEuint8(1);
        euint8 ten = FHE.asEuint8(BOARD_SIZE);
        euint8 cellLimit = FHE.asEuint8(CELL_COUNT);

        valid = FHE.lt(fleet.segments[0], cellLimit);
        for (uint256 i = 1; i < TOTAL_SHIP_CELLS; i++) {
            valid = FHE.and(valid, FHE.lt(fleet.segments[i], cellLimit));
        }

        uint256 offset = 0;
        for (uint256 s = 0; s < MAX_SHIPS; s++) {
            uint256 length = uint8(SHIP_LENGTHS[s]);
            if (length > 1) {
                valid = FHE.and(valid, _validateShipShape(fleet, offset, length, one, ten));
            }
            offset += length;
        }
    }

    /// @dev One multi-cell ship: consecutive segments differ by exactly 1
    ///      (horizontal) or exactly 10 (vertical) throughout, and a
    ///      horizontal ship's first column leaves room for its full length
    ///      so it cannot wrap across rows. euint8 subtraction wraps modulo
    ///      256, so out-of-order segments simply fail the equality checks.
    function _validateShipShape(
        EncryptedFleet storage fleet,
        uint256 offset,
        uint256 length,
        euint8 one,
        euint8 ten
    ) private returns (ebool) {
        euint8 gap = FHE.sub(fleet.segments[offset + 1], fleet.segments[offset]);
        ebool horizontalOk = FHE.eq(gap, one);
        ebool verticalOk = FHE.eq(gap, ten);
        for (uint256 i = 2; i < length; i++) {
            gap = FHE.sub(fleet.segments[offset + i], fleet.segments[offset + i - 1]);
            horizontalOk = FHE.and(horizontalOk, FHE.eq(gap, one));
            verticalOk = FHE.and(verticalOk, FHE.eq(gap, ten));
        }

        ebool columnOk = FHE.lt(
            FHE.rem(fleet.segments[offset], ten),
            FHE.asEuint8(uint8(BOARD_SIZE + 1 - length))
        );
        return FHE.or(FHE.and(horizontalOk, columnOk), verticalOk);
    }

    /// @dev Memory-only accumulator for the encrypted shot pipeline; keeps
    ///      the per-ship loop within the EVM stack limit.
    struct ShotScratch {
        euint8 target;
        euint8 zero;
        euint8 one;
        ebool anyHit;
        ebool anySunk;
        ebool allShipsDead;
        euint8 sunkShipId;
    }

    /// @dev Encrypted shot pipeline (GAME-407), ~110 FHE operations: per-ship
    ///      hit flags from 20 segment comparisons, encrypted health
    ///      decrement, sunk detection, all-ships-dead win detection, and the
    ///      public result enum. Only eResult and eSunkShipId ever leave this
    ///      computation, through an explicit decrypt request; every
    ///      intermediate value stays transient inside this transaction.
    function _resolveShotEncrypted(
        EncryptedFleet storage fleet,
        uint8 cellIndex
    ) private returns (euint8 eResult, euint8 eSunkShipId) {
        ShotScratch memory scratch;
        scratch.target = FHE.asEuint8(cellIndex);
        scratch.zero = FHE.asEuint8(0);
        scratch.one = FHE.asEuint8(1);
        scratch.sunkShipId = scratch.zero;

        uint256 offset = 0;
        for (uint256 s = 0; s < MAX_SHIPS; s++) {
            uint256 length = uint8(SHIP_LENGTHS[s]);
            _resolveShipShot(fleet, scratch, s, offset, length);
            offset += length;
        }

        eResult = FHE.select(
            scratch.anyHit,
            FHE.asEuint8(uint8(ShotResult.Hit)),
            scratch.one
        );
        eResult = FHE.select(scratch.anySunk, FHE.asEuint8(uint8(ShotResult.Sunk)), eResult);
        eResult = FHE.select(
            FHE.and(scratch.allShipsDead, scratch.anyHit),
            FHE.asEuint8(uint8(ShotResult.Win)),
            eResult
        );
        eSunkShipId = scratch.sunkShipId;
    }

    function _resolveShipShot(
        EncryptedFleet storage fleet,
        ShotScratch memory scratch,
        uint256 shipIndex,
        uint256 offset,
        uint256 length
    ) private {
        ebool shipHit = FHE.eq(fleet.segments[offset], scratch.target);
        for (uint256 i = 1; i < length; i++) {
            shipHit = FHE.or(shipHit, FHE.eq(fleet.segments[offset + i], scratch.target));
        }

        // Validated ships occupy distinct cells and each public cell is
        // attackable once, so health never underflows.
        euint8 newHealth = FHE.sub(
            fleet.shipHealth[shipIndex],
            FHE.select(shipHit, scratch.one, scratch.zero)
        );
        FHE.allowThis(newHealth);
        fleet.shipHealth[shipIndex] = newHealth;

        ebool shipDead = FHE.eq(newHealth, scratch.zero);
        ebool sunkNow = FHE.and(shipHit, shipDead);
        scratch.sunkShipId = FHE.select(
            sunkNow,
            FHE.asEuint8(uint8(shipIndex + 1)),
            scratch.sunkShipId
        );

        if (shipIndex == 0) {
            scratch.anyHit = shipHit;
            scratch.anySunk = sunkNow;
            scratch.allShipsDead = shipDead;
        } else {
            scratch.anyHit = FHE.or(scratch.anyHit, shipHit);
            scratch.anySunk = FHE.or(scratch.anySunk, sunkNow);
            scratch.allShipsDead = FHE.and(scratch.allShipsDead, shipDead);
        }
    }

    // ---------------------------------------------------------------------
    // On-chain bot target selection (hard heatmap, public board only)
    // ---------------------------------------------------------------------

    /// @dev Gather the human board's public masks and surviving ship set, then
    ///      pick the bot's next target. Reads only public state. The seed only
    ///      breaks ties between equally-likely cells, and the chosen target is
    ///      public regardless (every attack coordinate is), so plaintext block
    ///      randomness suffices and manipulation is meaningless in a solo
    ///      practice match.
    function _chooseBotTargetForMatch(
        Match storage m,
        uint256 matchId
    ) private view returns (uint8) {
        PublicBoard storage board = m.creatorState.publicBoard;
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    blockhash(block.number - 1),
                    block.prevrandao,
                    matchId,
                    m.moveCount
                )
            )
        );
        (uint8 target, bool found) = _chooseBotTarget(
            board.attackedMask,
            board.missMask,
            board.hitMask,
            board.sunkMask,
            sunkShipsBitmap[matchId][m.creator],
            seed
        );
        if (!found) revert BotHasNoTarget();
        return target;
    }

    /// @dev Faithful port of the local hard bot (src/game/bot.ts): count every
    ///      legal placement of each surviving ship length consistent with the
    ///      public shot map, weight placements that explain open hits, and aim
    ///      at the highest-scoring untried cell. Ships of equal length are
    ///      collapsed into one weighted pass to bound gas.
    function _chooseBotTarget(
        uint128 attacked,
        uint128 missMask,
        uint128 hitMask,
        uint128 sunkMask,
        uint16 sunkShips,
        uint256 seed
    ) internal pure returns (uint8 target, bool found) {
        uint128 untried = (~attacked) & BOARD_MASK;
        // Only the finishing cell of a sunk ship is publicly marked sunk, but
        // the whole hull is the contiguous run of hits through it. Expand to the
        // full footprint so a sunk ship is fully haloed and its body no longer
        // attracts follow-up — matching the local engine, which marks every
        // sunk cell and halos the entire hull (engine.ts sunkHalo).
        uint128 sunk = _expandSunk(sunkMask, hitMask);
        uint128 halo = _halo(sunk);
        // A placement cell is blocked by a miss, a sunk cell, or an untried cell
        // adjacent to a sunk ship. Open hits are NOT blocked: they are what
        // follow-up placements are built around.
        uint128 blocked = missMask | sunk | (halo & untried);
        uint128 openHit = hitMask & (~sunk);

        // Surviving ship counts grouped by length (1..4).
        uint256[5] memory countByLen;
        for (uint256 s = 0; s < MAX_SHIPS; s++) {
            if ((uint256(sunkShips) >> s) & 1 == 1) continue;
            countByLen[uint8(SHIP_LENGTHS[s])]++;
        }

        HeatScratch memory hs = HeatScratch({blocked: blocked, openHit: openHit});
        uint32[100] memory heat;
        for (uint256 length = 1; length <= 4; length++) {
            if (countByLen[length] == 0) continue;
            _accumulate(heat, hs, length, uint32(countByLen[length]));
        }

        // Prefer untried cells away from sunk ships; fall back to any untried.
        uint128 pool = untried & (~halo);
        if (pool == 0) pool = untried;
        if (pool == 0) return (0, false);

        return (_argmax(heat, pool, seed), true);
    }

    /// @dev Memory-held board masks for the heatmap pass, so the per-placement
    ///      helper stays inside the EVM stack limit.
    struct HeatScratch {
        uint128 blocked;
        uint128 openHit;
    }

    /// @dev Accumulate weighted placement counts for one ship length over both
    ///      axes. A placement is a (start, stride) pair: stride 1 is horizontal,
    ///      stride BOARD_SIZE is vertical. `count` is how many surviving ships
    ///      share this length.
    function _accumulate(
        uint32[100] memory heat,
        HeatScratch memory hs,
        uint256 length,
        uint32 count
    ) private pure {
        // Horizontal: every row, columns that leave room for the full length.
        for (uint256 row = 0; row < BOARD_SIZE; row++) {
            uint256 base = row * BOARD_SIZE;
            for (uint256 col = 0; col + length <= BOARD_SIZE; col++) {
                _addPlacement(heat, hs, base + col, 1, length, count);
            }
        }
        // A length-1 ship is axis-agnostic; the horizontal pass already covered
        // every cell once.
        if (length == 1) return;
        // Vertical: every column, rows that leave room for the full length.
        for (uint256 row = 0; row + length <= BOARD_SIZE; row++) {
            uint256 base = row * BOARD_SIZE;
            for (uint256 col = 0; col < BOARD_SIZE; col++) {
                _addPlacement(heat, hs, base + col, BOARD_SIZE, length, count);
            }
        }
    }

    /// @dev Score one candidate placement (start + stride*i for i in [0,length)):
    ///      skip it if any cell is blocked, otherwise add its weight to every
    ///      non-open-hit cell. Placements covering open hits dominate so
    ///      follow-up beats the hunt, exactly as the local bot.
    function _addPlacement(
        uint32[100] memory heat,
        HeatScratch memory hs,
        uint256 start,
        uint256 stride,
        uint256 length,
        uint32 count
    ) private pure {
        uint256 blockedBits = uint256(hs.blocked);
        uint256 openHitBits = uint256(hs.openHit);

        uint256 hits = 0;
        for (uint256 i = 0; i < length; i++) {
            uint256 cell = start + stride * i;
            if ((blockedBits >> cell) & 1 == 1) return;
            if ((openHitBits >> cell) & 1 == 1) hits++;
        }

        uint32 weight = (hits > 0 ? uint32(50 * hits) : 1) * count;
        for (uint256 i = 0; i < length; i++) {
            uint256 cell = start + stride * i;
            if ((openHitBits >> cell) & 1 == 1) continue;
            heat[cell] += weight;
        }
    }

    /// @dev Highest-heat cell within `pool`, ties broken with a reservoir pick.
    function _argmax(
        uint32[100] memory heat,
        uint128 pool,
        uint256 seed
    ) private pure returns (uint8 chosen) {
        uint256 poolBits = uint256(pool);
        int256 best = -1;
        uint256 ties = 0;
        for (uint256 cell = 0; cell < CELL_COUNT; cell++) {
            if ((poolBits >> cell) & 1 == 0) continue;
            int256 value = int256(uint256(heat[cell]));
            if (value > best) {
                best = value;
                ties = 1;
                chosen = uint8(cell);
            } else if (value == best) {
                ties++;
                if (seed % ties == 0) chosen = uint8(cell);
            }
        }
    }

    /// @dev Expand each publicly-sunk finishing cell to its full hull: the
    ///      contiguous run of hit cells through it along each axis. Lets the
    ///      heatmap halo the whole ship and drop its body from the open-hit set,
    ///      reproducing the local engine's full sunk reveal from public masks.
    ///      (For typical no-touch boards the run is exactly one ship; collinear
    ///      touching ships are a rare self-imposed edge that only mildly misleads
    ///      the bot, never a correctness issue.)
    function _expandSunk(
        uint128 sunkMask,
        uint128 hitMask
    ) internal pure returns (uint128 expanded) {
        expanded = sunkMask;
        uint256 sunkBits = uint256(sunkMask);
        uint256 hitBits = uint256(hitMask);
        for (uint256 cell = 0; cell < CELL_COUNT; cell++) {
            if ((sunkBits >> cell) & 1 == 0) continue;
            uint256 row = cell / BOARD_SIZE;
            uint256 col = cell % BOARD_SIZE;
            // Walk the contiguous hit run left, right, up, and down.
            for (uint256 c = col; c > 0; ) {
                c--;
                uint256 nc = row * BOARD_SIZE + c;
                if ((hitBits >> nc) & 1 == 0) break;
                expanded |= uint128(uint256(1) << nc);
            }
            for (uint256 c = col + 1; c < BOARD_SIZE; c++) {
                uint256 nc = row * BOARD_SIZE + c;
                if ((hitBits >> nc) & 1 == 0) break;
                expanded |= uint128(uint256(1) << nc);
            }
            for (uint256 r = row; r > 0; ) {
                r--;
                uint256 nc = r * BOARD_SIZE + col;
                if ((hitBits >> nc) & 1 == 0) break;
                expanded |= uint128(uint256(1) << nc);
            }
            for (uint256 r = row + 1; r < BOARD_SIZE; r++) {
                uint256 nc = r * BOARD_SIZE + col;
                if ((hitBits >> nc) & 1 == 0) break;
                expanded |= uint128(uint256(1) << nc);
            }
        }
    }

    /// @dev 8-neighbour halo around every revealed sunk cell.
    function _halo(uint128 sunkMask) private pure returns (uint128 halo) {
        uint256 bits = uint256(sunkMask);
        for (uint256 cell = 0; cell < CELL_COUNT; cell++) {
            if ((bits >> cell) & 1 == 0) continue;
            uint256 row = cell / BOARD_SIZE;
            uint256 col = cell % BOARD_SIZE;
            for (uint256 d = 0; d < 9; d++) {
                if (d == 4) continue; // the cell itself
                int256 nRow = int256(row) + (int256(d / 3) - 1);
                int256 nCol = int256(col) + (int256(d % 3) - 1);
                if (nRow < 0 || nRow >= int256(uint256(BOARD_SIZE))) continue;
                if (nCol < 0 || nCol >= int256(uint256(BOARD_SIZE))) continue;
                halo |= uint128(uint256(1) << (uint256(nRow) * BOARD_SIZE + uint256(nCol)));
            }
        }
    }

    function _toMoveView(Move storage move) private view returns (MoveView memory) {
        return
            MoveView({
                moveId: move.moveId,
                attacker: move.attacker,
                defender: move.defender,
                cellIndex: move.cellIndex,
                result: move.result,
                sunkShipId: move.sunkShipId,
                submittedAt: move.submittedAt,
                resolvedAt: move.resolvedAt,
                finalized: move.finalized
            });
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
