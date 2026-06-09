# Backendless Computer Opponent Design

## Purpose

This document describes how to support a computer opponent without using a centralized gameplay backend.

The game can have a computer opponent, but every move must still be represented by a blockchain transaction. A smart contract cannot wake itself up and submit a transaction on its own. Therefore, a backendless bot design must separate two responsibilities:

- who triggers the transaction;
- who decides the bot move.

In the preferred backendless design, anyone can trigger the bot transaction, but the smart contract decides the bot move.

## Core Requirement

The computer opponent must not depend on:

- centralized game server;
- private bot wallet controlled by the project;
- off-chain bot service that chooses moves;
- frontend-only bot logic;
- trusted backend randomness;
- hidden plaintext access to the player's board.

The bot can depend on:

- smart contract state;
- public move history;
- Fhenix/CoFHE encrypted state;
- Fhenix encrypted randomness;
- permissionless public transaction triggers;
- the player pressing a button to advance the bot turn.

## Recommended Model

Use an on-chain bot with a permissionless execution function.

Example function:

```solidity
function executeBotMove(uint256 matchId) external;
```

Any address can call this function when the match is waiting for the bot. The caller does not choose the target cell. The contract computes or derives the bot target from public state, encrypted randomness, and the selected bot strategy.

This means:

- the player can trigger the bot move;
- another player can trigger the bot move;
- a public keeper can trigger the bot move later;
- no private backend is required;
- the caller cannot cheat by selecting a favorable target;
- the move still appears as an on-chain transaction.

## User Experience

From the player's point of view, the bot turn can be advanced with a button.

Button label:

- `Advance Opponent Turn`

Alternative labels:

- `Resolve Opponent Turn`
- `Play Bot Turn`

The flow:

1. The player makes a move.
2. The shot result is resolved on-chain through Fhenix/CoFHE.
3. The contract changes the turn to the bot.
4. The UI shows `Opponent Turn`.
5. The player taps `Advance Opponent Turn`.
6. The wallet opens for a transaction.
7. The player confirms the transaction.
8. The contract computes the bot target.
9. The contract resolves the bot attack against the player's encrypted fleet.
10. The contract changes the turn back to the player, unless the bot won.

This is not as seamless as a server-driven bot, but it keeps the game backendless and fully transaction-based.

## Why a Transaction Is Still Needed

Blockchains are passive systems. Contract code runs only when a transaction calls it.

The contract can contain the bot logic, but some address must still submit a transaction to execute that logic. In a backendless design, this transaction can be submitted by:

- the player;
- the opponent if the mode ever supports shared bot matches;
- any public address;
- a decentralized keeper network later.

The important part is that the caller only triggers execution. The caller must not provide the chosen target cell.

## Match Type

Add a separate match type:

- `BotMatch`

The main PvP mode remains:

- `FriendMatch`
- `OpenMatch`

The bot match should be treated as practice or single-player on-chain mode, not as the main competitive PvP mode.

Recommended enum:

```solidity
enum MatchType {
    Friend,
    Open,
    Bot
}
```

## Bot Match State

Bot matches can reuse most of the PvP match structure, but the second player is virtual.

Recommended fields:

- `matchType`;
- `player`;
- `botId`;
- `botDifficulty`;
- `currentTurn`;
- `playerState`;
- `botState`;
- `botStrategyState`;
- `pendingBotRandomness`;
- `lastBotMoveId`.

The bot should not need an externally owned wallet address. It can be represented by a `botId` or a fixed sentinel address such as `address(0)`, as long as contract logic clearly distinguishes bot matches from real player matches.

## Bot Fleet Placement

The bot needs a hidden fleet just like a human opponent.

Preferred backendless options:

## Option A: Contract-generated Placement with Fhenix Randomness

The contract uses Fhenix encrypted randomness to generate the bot fleet in encrypted form.

Benefits:

- no backend;
- no bot wallet;
- no plaintext bot fleet known to the frontend;
- strongest alignment with fully on-chain design.

Challenges:

- generating a valid Battleship fleet fully on-chain with encrypted randomness can be complex;
- placement validation and retries may require multiple transaction steps;
- FHE operations are asynchronous, so the UI needs pending states.

## Option B: Deterministic Public Template Pool

The contract stores a public list of valid fleet templates and chooses one using randomness.

Benefits:

- much simpler;
- no backend;
- easy to test;
- low gas compared to encrypted fleet generation.

Challenges:

- the template pool is public;
- if the selected template index becomes public too early, the bot fleet is revealed;
- to preserve secrecy, the selected template index should stay encrypted or hidden until the game rules reveal cells.

This option can be acceptable for a first prototype if combined with Fhenix encrypted selection and careful reveal rules.

## Option C: Frontend-generated Bot Fleet

The player's browser generates the bot fleet and submits it.

Benefits:

- easy to build.

Problems:

- the player can know the bot fleet;
- this is not fair;
- this should only be used for development testing, not production.

Recommendation:

- MVP prototype: Option B with encrypted random template selection.
- Later stronger version: Option A with fully generated encrypted placement.
- Never use Option C for a real game mode.

## Bot Target Selection

The bot target must be selected by contract logic.

The target selection can use:

- public attacked cells bitset;
- public hit and miss history;
- previous bot hits;
- encrypted or public randomness;
- selected difficulty level.

The caller of `executeBotMove()` must not provide `cellIndex`.

Bad design:

```solidity
function executeBotMove(uint256 matchId, uint8 cellIndex) external;
```

Good design:

```solidity
function executeBotMove(uint256 matchId) external;
```

The contract should internally compute:

```solidity
uint8 target = chooseBotTarget(matchId);
```

## Bot Difficulty Levels

Start with simple deterministic levels.

## Easy

Behavior:

- choose from unattacked cells using randomness;
- do not intelligently follow up hits;
- avoid repeated cells.

This is the safest backendless MVP difficulty.

## Normal

Behavior:

- random search until a hit;
- after a hit, prioritize neighboring unattacked cells;
- after a sunk result, return to random search.

This requires public strategy state:

- last hit cell;
- candidate neighbor cells;
- current hunt or target mode.

## Hard

Behavior:

- parity search;
- probability heatmap based on remaining ship lengths;
- targeted follow-up after hits.

This may be too expensive on-chain for MVP. It should be considered later or approximated with a compact deterministic strategy.

## Randomness

Fhenix supports encrypted random values through functions such as:

- `FHE.randomEuint8()`;
- `FHE.randomEuint16()`;
- `FHE.randomEuint32()`;
- `FHE.randomEuint64()`;
- `FHE.randomEuint128()`.

For a 10 by 10 board, a random target can be derived from an encrypted random value modulo 100.

However, the contract must still avoid already attacked cells. The simplest MVP approach:

1. Generate or derive a random start index.
2. Scan forward through the public attacked bitset.
3. Pick the first unattacked cell.

This makes the final chosen target public because the attack coordinate must be public anyway. That is acceptable: Battleship attacks are public once made.

## Fhenix and Asynchronicity

Fhenix/CoFHE operations can be asynchronous. Encrypted values are represented in contracts as handles, while the heavy FHE computation is performed off-chain by CoFHE infrastructure and coordinated through events.

The bot flow must include pending states:

- `GeneratingBotFleet`;
- `BotFleetReady`;
- `BotTurn`;
- `ResolvingBotShot`;
- `BotShotResolved`.

The UI should not assume the bot move resolves immediately. It should show a pending transaction and FHE resolution state.

## Bot Attack Flow

Backendless bot attack flow:

1. Match is in `BotTurn`.
2. Any caller invokes `executeBotMove(matchId)`.
3. Contract verifies the match is a bot match.
4. Contract verifies there is no unresolved pending bot shot.
5. Contract selects a target cell internally.
6. Contract marks that cell as attacked by the bot.
7. Contract runs FHE hit detection against the player's encrypted fleet.
8. Contract computes encrypted sunk and win flags.
9. Contract enters `ResolvingBotShot`.
10. Authorized Fhenix/CoFHE decryption flow publishes the result.
11. Contract emits `BotShotResolved`.
12. Contract either finishes the match or returns turn to the player.

## Required Functions

Suggested functions:

```solidity
function createBotMatch(BotDifficulty difficulty) external returns (uint256 matchId);
function prepareBotFleet(uint256 matchId) external;
function executeBotMove(uint256 matchId) external;
function finalizeBotMove(uint256 matchId, uint256 moveId, DecryptResult calldata result) external;
```

Depending on the chosen Fhenix flow, `prepareBotFleet` and `finalizeBotMove` may be split into more specific functions.

## Required Events

Suggested events:

```solidity
event BotMatchCreated(uint256 indexed matchId, address indexed player, BotDifficulty difficulty);
event BotFleetGenerationStarted(uint256 indexed matchId);
event BotFleetReady(uint256 indexed matchId);
event BotMoveTriggered(uint256 indexed matchId, uint256 indexed moveId, address indexed caller);
event BotShotSubmitted(uint256 indexed matchId, uint256 indexed moveId, uint8 cellIndex);
event BotShotResolved(uint256 indexed matchId, uint256 indexed moveId, ShotResult result);
```

The event can include the final `cellIndex` after the contract has selected it, because the bot attack coordinate is public once the move is made.

## Anti-cheat Rules

The backendless bot design must enforce these rules:

- caller cannot choose the bot target;
- caller cannot skip the bot turn;
- caller cannot repeat an already attacked cell;
- caller cannot force a favorable random value;
- frontend cannot provide bot attack result;
- player cannot see bot fleet plaintext;
- bot cannot see player fleet plaintext;
- all hit, miss, sunk, and win results come from contract and Fhenix logic.

## Gas and UX Tradeoff

Backendless bot mode is more trustless, but less smooth than a server-triggered bot.

Tradeoffs:

- the player may need to confirm a transaction for the bot turn;
- bot strategy must stay simple enough for on-chain execution;
- bot fleet generation may need multiple pending states;
- Fhenix randomness and encrypted resolution can add asynchronous steps.

For MVP, the best tradeoff is:

- simple `Easy` bot;
- permissionless `executeBotMove`;
- contract-selected target;
- encrypted hit detection;
- public move history;
- clear UI button: `Advance Opponent Turn`.

## Interface Additions

Add a mode to opponent selection:

- `Practice vs Bot`

If the product wants to keep PvP as the primary mode, this can be visually secondary.

Add bot-related labels:

- `Practice vs Bot`;
- `Bot Difficulty`;
- `Easy`;
- `Normal`;
- `Advance Opponent Turn`;
- `Opponent Thinking`;
- `Resolving Bot Shot`;
- `Bot Shot Resolved`.

All labels must remain English-only.

## MVP Recommendation

Do not add bot mode before the friend PvP flow is designed clearly.

Recommended order:

1. Build friend PvP match design.
2. Build contract and Fhenix flow for human attacks.
3. Add `BotMatch` as a separate practice mode.
4. Implement backendless `Easy` bot with `executeBotMove()`.
5. Improve bot strategy only after gas and UX are measured.

## Sources

- [Fhenix Randomness](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/randomness)
- [Fhenix Data Evaluation](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/data-evaluation)
- [FHE.sol Overview](https://cofhe-docs.fhenix.zone/fhe-library/reference/fhe-sol/overview)
