/**
 * GENERATED FILE - do not edit by hand.
 *
 * Source: contracts/artifacts/contracts/BattleshipGame.sol/BattleshipGame.json
 * Regenerate with: cd contracts && npm run generate:abi
 *
 * The `as const` assertion gives viem full ABI type inference for reads,
 * writes, and event decoding (wired in Phase 5, GAME-502/503).
 */

export const BATTLESHIP_GAME_CONTRACT_NAME = 'BattleshipGame'

/** sha256 of the compact ABI JSON; must match `abiSha256` in the active deployment record. */
export const BATTLESHIP_GAME_ABI_SHA256 = 'sha256:8b671aa12409e94651065740b46d9fb0f67336b4a808255aa946ce1b921e30df'

export const battleshipGameAbi = [
  {
    "inputs": [],
    "name": "CannotCancelStartedMatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CreatorCannotJoinOwnMatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidInvitedOpponent",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidMatchStatus",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidPaginationLimit",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "JoinDeadlineExpired",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MatchAlreadyFinished",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MatchNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoTimeoutAvailable",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotInvitedOpponent",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotMatchPlayer",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotTimeoutClaimant",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyCreator",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OpponentAlreadyJoined",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SelfInviteNotAllowed",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "matchId",
        "type": "uint256"
      }
    ],
    "name": "MatchCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "matchId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "invitedOpponent",
        "type": "address"
      }
    ],
    "name": "MatchCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "matchId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "loser",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "winner",
        "type": "address"
      }
    ],
    "name": "MatchForfeited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "matchId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "opponent",
        "type": "address"
      }
    ],
    "name": "MatchJoined",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "matchId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "winner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "reason",
        "type": "uint8"
      }
    ],
    "name": "TimeoutWinClaimed",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "BOARD_SIZE",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "CELL_COUNT",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "JOIN_TIMEOUT",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_PAGE_LIMIT",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_SHIPS",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "NO_CELL",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "PLACEMENT_TIMEOUT",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "RESOLVING_TIMEOUT",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "TOTAL_SHIP_CELLS",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "TURN_TIMEOUT",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "matchId",
        "type": "uint256"
      }
    ],
    "name": "cancelMatch",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "matchId",
        "type": "uint256"
      }
    ],
    "name": "claimTimeoutWin",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "invitedOpponent",
        "type": "address"
      }
    ],
    "name": "createMatch",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "matchId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "matchId",
        "type": "uint256"
      }
    ],
    "name": "forfeit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "matchId",
        "type": "uint256"
      }
    ],
    "name": "getMatch",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "enum BattleshipGame.MatchType",
            "name": "matchType",
            "type": "uint8"
          },
          {
            "internalType": "enum BattleshipGame.MatchStatus",
            "name": "status",
            "type": "uint8"
          },
          {
            "internalType": "address",
            "name": "creator",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "opponent",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "invitedOpponent",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "currentTurn",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "winner",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "createdAt",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "joinedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "startedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "finishedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "lastActionAt",
            "type": "uint64"
          },
          {
            "internalType": "uint32",
            "name": "moveCount",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "pendingMoveId",
            "type": "uint32"
          },
          {
            "components": [
              {
                "internalType": "uint64",
                "name": "joinDeadline",
                "type": "uint64"
              },
              {
                "internalType": "uint64",
                "name": "placementDeadline",
                "type": "uint64"
              },
              {
                "internalType": "uint64",
                "name": "turnDeadline",
                "type": "uint64"
              },
              {
                "internalType": "uint64",
                "name": "resolvingDeadline",
                "type": "uint64"
              }
            ],
            "internalType": "struct BattleshipGame.TimeoutState",
            "name": "timeoutState",
            "type": "tuple"
          }
        ],
        "internalType": "struct BattleshipGame.MatchView",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "player",
        "type": "address"
      }
    ],
    "name": "getPlayerMatchCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "internalType": "uint32",
        "name": "offset",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "limit",
        "type": "uint32"
      }
    ],
    "name": "getPlayerMatches",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "matchIds",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "matchId",
        "type": "uint256"
      }
    ],
    "name": "getPlayers",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "player",
            "type": "address"
          },
          {
            "internalType": "bool",
            "name": "joined",
            "type": "bool"
          },
          {
            "internalType": "enum BattleshipGame.PlacementStatus",
            "name": "placementStatus",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "fleetSubmitted",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "fleetValid",
            "type": "bool"
          },
          {
            "components": [
              {
                "internalType": "uint128",
                "name": "attackedMask",
                "type": "uint128"
              },
              {
                "internalType": "uint128",
                "name": "missMask",
                "type": "uint128"
              },
              {
                "internalType": "uint128",
                "name": "hitMask",
                "type": "uint128"
              },
              {
                "internalType": "uint128",
                "name": "sunkMask",
                "type": "uint128"
              }
            ],
            "internalType": "struct BattleshipGame.PublicBoard",
            "name": "publicBoard",
            "type": "tuple"
          }
        ],
        "internalType": "struct BattleshipGame.PlayerPublicView",
        "name": "creator",
        "type": "tuple"
      },
      {
        "components": [
          {
            "internalType": "address",
            "name": "player",
            "type": "address"
          },
          {
            "internalType": "bool",
            "name": "joined",
            "type": "bool"
          },
          {
            "internalType": "enum BattleshipGame.PlacementStatus",
            "name": "placementStatus",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "fleetSubmitted",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "fleetValid",
            "type": "bool"
          },
          {
            "components": [
              {
                "internalType": "uint128",
                "name": "attackedMask",
                "type": "uint128"
              },
              {
                "internalType": "uint128",
                "name": "missMask",
                "type": "uint128"
              },
              {
                "internalType": "uint128",
                "name": "hitMask",
                "type": "uint128"
              },
              {
                "internalType": "uint128",
                "name": "sunkMask",
                "type": "uint128"
              }
            ],
            "internalType": "struct BattleshipGame.PublicBoard",
            "name": "publicBoard",
            "type": "tuple"
          }
        ],
        "internalType": "struct BattleshipGame.PlayerPublicView",
        "name": "opponent",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "matchId",
        "type": "uint256"
      }
    ],
    "name": "joinMatch",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextMatchId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const
