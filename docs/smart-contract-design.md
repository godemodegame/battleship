# Smart Contract Design

## Contract Purpose

The smart contract manages PvP matches for a Battleship-style game. It is responsible for match creation, opponent joining, encrypted fleet placement, turn order, attack validation, authorized result publication, and winner detection.

The contract must be the main source of truth. The frontend, 3D client, indexer, or mobile app must not be able to decide whether a shot was a hit, whose turn it is, or who won the match.

## Network

The first version must run on the Arbitrum testnet.

Exact network for the MVP:

- network: Arbitrum Sepolia;
- Fhenix/CoFHE plugin name: `arb-sepolia`;
- purpose: testing real FHE flows with lower gas costs than Ethereum Sepolia.

If the connected wallet is on a different network, the game must ask the player to switch to Arbitrum Sepolia.

## Required Fhenix Usage

The contract must use Fhenix/CoFHE under the hood.

Fhenix is responsible for:

- hiding ship placement;
- storing private board state in encrypted form;
- performing checks over encrypted data;
- revealing only the minimum required turn result;
- keeping unattacked board cells hidden.

The client must use `@cofhe/sdk` to encrypt data before sending it to the contract, manage permits, and work with authorized decryption. The Solidity contract must use `FHE.sol` from CoFHE contracts to work with encrypted types and FHE operations.

## Privacy Model

In a normal on-chain contract, all stored data is public. Because of that, the game cannot simply write ship placement to storage as plaintext. The opponent could read the board through a block explorer or RPC.

For this game, fleet placement must enter the contract only as encrypted input. The contract stores ciphertext handles or encrypted values and performs computation on them through Fhenix/CoFHE.

The following data can be public:

- player addresses;
- match id;
- match status;
- current turn;
- coordinates of already submitted attacks;
- result of already resolved attacks: `miss`, `hit`, `sunk`, `win`;
- final winner.

The following data must remain private:

- location of unattacked ships;
- full player board;
- ship cells that have not been revealed by game rules;
- internal encrypted counters, if they are needed for sunk or win detection.

## Contract Model

For the MVP, the project can start with one main contract:

- `BattleshipGame`

Later, it can be split into:

- `BattleshipLobby` - match creation and discovery;
- `BattleshipGame` - match logic;
- `BattleshipVerifier` - FHE validation helpers;
- `BattleshipEscrow` - stakes or rewards, if they are added.

The first stage should keep the architecture simple, but game decisions must not be mixed into the frontend.

## Match States

A match should move through clear states:

- `WaitingForOpponent` - the match exists, but the second player has not joined yet;
- `WaitingForPlacement` - both players are present and fleet placement is in progress;
- `ValidatingPlacement` - the contract and Fhenix are validating encrypted placement;
- `ReadyToStart` - both fleets have been accepted;
- `InProgress` - players are taking turns;
- `ResolvingShot` - a shot was submitted and the FHE or decryption result has not been published yet;
- `Finished` - the winner has been determined;
- `Cancelled` - the match was cancelled before the start;
- `Forfeited` - one player lost because of a timeout or voluntary forfeit.

At every point in time, the contract must allow only actions that are valid for the current state.

## Playing Against a Friend

A player must be able to create a match against a friend.

The contract should support a private friend match:

- the match creator provides the friend's wallet address;
- only that address can join the match;
- the frontend generates a link such as `/match/{matchId}`;
- the friend opens the link, connects a wallet, and calls `joinMatch(matchId)`;
- the contract verifies that `msg.sender` matches the invited address.

The contract can also support an open match:

- the invited address is `address(0)`;
- any second player can join;
- the creator cannot join their own match as the second player.

For the first version, private friend matches are more important because the user explicitly needs to be able to play against a friend.

## Match Data

The contract needs a match structure with the following meaning:

- `matchId`;
- `creator`;
- `opponent`;
- `invitedOpponent`;
- `status`;
- `currentTurn`;
- `winner`;
- `createdAt`;
- `lastActionAt`;
- `moveCount`;
- `playerAState`;
- `playerBState`.

Each player state should store:

- player address;
- whether the player has joined;
- whether the player has submitted encrypted placement;
- whether placement validation succeeded;
- encrypted fleet state;
- public attacked cells bitset;
- public hit and miss history for attacked cells;
- encrypted ship health or similar encrypted counters;
- public sunk count, if it is only revealed after authorized results.

## Board Representation

The base board is 10 by 10 cells.

Cells can be encoded as indexes from `0` to `99`:

- `0` - top-left cell;
- `9` - top-right cell;
- `90` - bottom-left cell;
- `99` - bottom-right cell.

The frontend can display coordinates as `A1`, `B4`, or `J10`, but the contract should receive a compact `uint8 cellIndex`.

## Encrypted Fleet Placement

The player places ships on the client. Then the client encrypts the placement through `@cofhe/sdk` and sends encrypted input to the contract.

The contract must not accept plaintext placement.

Possible encoding options:

- encrypted array of 100 values, where each cell contains `0` for water or a ship id;
- encrypted list of ships, where each ship has encrypted start cell, encrypted direction, and encrypted length;
- packed encrypted bitmasks, if that becomes cheaper for gas and FHE operations.

For MVP design, an encrypted cell array is preferable because it is easier to understand and use for attack checks. The project can move to a packed representation later for optimization.

## Fleet Validation

The contract must not trust the frontend to validate the fleet.

After encrypted placement is submitted, the contract must check that:

- the board has the correct size;
- ships do not go outside board boundaries;
- ships do not overlap;
- the ship set matches the rules;
- with the classic rule, ships do not touch each other;
- the total number of occupied cells matches the fleet.

Because placement is encrypted, validation must be performed through Fhenix/CoFHE. Only the final boolean should be revealed:

- `placement valid`;
- `placement invalid`.

If placement is invalid, the player can submit a new encrypted placement. The contract must not reveal the reason at the individual-cell level because that could leak part of the hidden board.

If full classic fleet validation is too expensive for the first prototype, a temporary dev-only stage with auto placement is acceptable. Production logic must not rely on client honesty.

## Turn Order

After both placements pass validation, the contract moves the match to `InProgress`.

For the MVP, the rule should match the friend-invite flow:

- the invited opponent goes first.

This creates a clean social flow: the creator prepares the match and sends an invite, then the friend joins, places a fleet, and takes the first shot. Later, the project can add a fair on-chain coin flip or another first-player selection mechanism. The important part is that the rule must be public and the same for both players.

The contract must verify that:

- the match is in `InProgress`;
- `msg.sender` is the current player;
- the selected cell is in the `0..99` range;
- this cell has not already been attacked by this player;
- there is no unresolved pending shot.

## Cell Attack

The player attacks a public coordinate on the opponent's board.

The attack coordinate can be public because Battleship move history is visible to both players. The result must remain hidden until correct FHE resolution, and all unattacked cells must remain hidden.

Basic attack flow:

1. The player calls `attack(matchId, cellIndex)`.
2. The contract checks turn permissions.
3. The contract marks the cell as attacked in a public attacked bitset.
4. The contract uses FHE to compare the selected cell with the opponent's encrypted fleet state.
5. The contract computes the encrypted result: miss or hit.
6. If the attack is a hit, the contract updates encrypted ship health.
7. The contract computes encrypted flags for sunk and win.
8. The contract moves the match to `ResolvingShot`.
9. After authorized decryption, the contract publishes the public result.
10. If win is true, the match ends.
11. If there is no winner, the turn passes to the other player.

Because of the FHE and decryption flow, the attack result may not be instant. The UI should show a state such as `Resolving shot...`.

## Attack Result

The attack result must become public only after the contract receives a valid Fhenix/CoFHE decryption result.

The public result can use these values:

- `Miss`;
- `Hit`;
- `Sunk`;
- `Win`.

The contract should reveal only the final result, not raw encrypted values.

If a ship is sunk, the game may reveal the cells of that ship only if this matches the selected rules. For the MVP, the safer approach is to reveal only the `Sunk` status and build the visual display from cells that were already attacked.

## Victory

Victory must be determined by the contract.

The contract must finish the match when the opponent has no living ships after an attack. This can be tracked with encrypted total health or encrypted remaining ship counters, while only the final `win` value is revealed publicly.

After victory, the contract:

- sets `status = Finished`;
- stores `winner`;
- stores final `moveCount`;
- emits `MatchFinished`;
- blocks new attacks in this match.

Optionally, the contract can allow final board reveal after match completion, but this must not be required for winner detection.

## Main Functions

Preliminary function set:

- `createMatch(address invitedOpponent) returns (uint256 matchId)` - create a private or open match;
- `cancelMatch(uint256 matchId)` - cancel a match before the second player joins;
- `joinMatch(uint256 matchId)` - join a match;
- `submitFleet(uint256 matchId, encryptedPlacement)` - submit encrypted placement;
- `finalizeFleetValidation(uint256 matchId, address player, decryptResult)` - store the public validation result;
- `startMatch(uint256 matchId)` - start the match if both fleets are valid;
- `attack(uint256 matchId, uint8 cellIndex)` - submit a shot;
- `finalizeAttack(uint256 matchId, uint256 moveId, decryptResult)` - publish the shot result;
- `forfeit(uint256 matchId)` - voluntarily forfeit;
- `claimTimeoutWin(uint256 matchId)` - claim victory if the opponent takes too long;
- `getMatch(uint256 matchId)` - read public match information;
- `getMoveHistory(uint256 matchId)` - read public move history.

The exact types for `encryptedPlacement` and `decryptResult` should be selected after a prototype with `@cofhe/sdk` and `FHE.sol`.

## Events

The contract should emit events so the frontend and indexer can update the UI quickly.

Required events:

- `MatchCreated(matchId, creator, invitedOpponent)`;
- `MatchJoined(matchId, opponent)`;
- `FleetSubmitted(matchId, player)`;
- `FleetValidated(matchId, player, valid)`;
- `MatchStarted(matchId, firstPlayer)`;
- `ShotSubmitted(matchId, moveId, attacker, defender, cellIndex)`;
- `ShotResolved(matchId, moveId, result)`;
- `TurnChanged(matchId, currentTurn)`;
- `MatchFinished(matchId, winner, moveCount)`;
- `MatchCancelled(matchId)`;
- `MatchForfeited(matchId, loser, winner)`.

All event names, Solidity errors, and player-facing statuses must be written in English.

## Timeouts

Because the game is PvP and on-chain, it needs protection against a player disappearing.

Minimum timeout rules:

- the match can be cancelled if the friend does not join;
- the opponent can cancel or win if one player does not submit placement;
- a player can win by timeout if the current player does not move for too long;
- a recovery flow is needed if a shot gets stuck in `ResolvingShot`.

MVP timeout values can be constants, for example:

- placement timeout: 24 hours;
- turn timeout: 24 hours;
- resolving timeout: depends on the Fhenix flow and must be clarified after the technical prototype.

## What the Contract Must Not Do

The contract must not:

- store plaintext ship placement;
- accept attack results from the frontend;
- allow a player to move out of turn;
- allow repeated attacks on the same cell;
- allow a third address to interfere with a private match;
- reveal the full map before the game ends;
- depend on a centralized game server;
- use frontend-only validation for the fleet.

## Fhenix Access Control

When working with encrypted values, the contract must explicitly manage access.

General rule:

- encrypted fleet state must be accessible to the contract;
- the player may have access to their own authorized data if the UI needs it;
- the opponent must not have access to the hidden map;
- public decrypt is allowed only for minimum results: placement validity, attack result, sunk, and win;
- all permissions must be set through FHE access-control functions such as `allowThis`, `allowSender`, `allowPublic`, or current equivalents from the CoFHE version being used.

The exact call set must be checked against the current version of `@fhenixprotocol/cofhe-contracts`.

## FHE Asynchronicity

FHE computation and the decryption flow can be asynchronous.

This affects the contract model:

- after an attack, the match can move to `ResolvingShot`;
- the next turn cannot be allowed before the result is published;
- the UI must listen to events and show a pending state;
- the contract must distinguish the latest pending move from old results;
- `finalizeAttack` must verify that the result belongs to the correct `moveId`.

This flow should be built honestly into the MVP instead of pretending that FHE results always appear instantly.

## Testing

Contracts should be tested in two stages:

1. Local mock environment.
2. Arbitrum Sepolia testnet.

Local tests should cover:

- private friend match creation;
- rejected join attempt from the wrong address;
- encrypted fleet submission;
- valid and invalid placement validation;
- match start;
- correct turn order;
- repeated attack rejection;
- hit, miss, sunk, and win flow;
- forfeit;
- timeout win;
- rejected actions after `Finished`.

Arbitrum Sepolia tests should separately verify:

- real wallet transactions;
- real Fhenix/CoFHE encryption and decryption flows;
- delays between attack and resolved result;
- gas usage;
- mobile browser behavior while waiting for transactions.

## MVP Contract Version

The smallest honest MVP should include:

- deployment to Arbitrum Sepolia;
- match creation against a friend by address;
- friend joining flow;
- encrypted fleet submission through Fhenix;
- FHE-based placement validation at least strong enough to prevent obvious cheating;
- turn-based attacks;
- public move history;
- FHE-based hit and miss computation;
- result-only reveal for attacks;
- on-chain win condition;
- timeout or forfeit;
- events for the frontend.

After this, the project can add ranking, wagers, NFT ships, tournaments, and a mobile app.

## Sources

- [Fhenix CoFHE Quick Start](https://cofhe-docs.fhenix.zone/fhe-library/introduction/quick-start)
- [Fhenix Compatibility](https://cofhe-docs.fhenix.zone/get-started/introduction/compatibility)
- [@cofhe/sdk Overview](https://cofhe-docs.fhenix.zone/client-sdk/introduction/overview)
- [FHE.sol Reference](https://cofhe-docs.fhenix.zone/fhe-library/reference/fhe-sol)
- [FHE Data Evaluation](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/data-evaluation)
