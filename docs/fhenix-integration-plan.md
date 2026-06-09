# Fhenix Integration Plan

## Purpose

This document defines how the game should integrate Fhenix/CoFHE for private on-chain Battleship gameplay.

The game requires hidden fleet placement and private board state while keeping match rules fully on-chain. Fhenix/CoFHE is the privacy layer that allows the contract to store and compute over encrypted data without revealing the player's hidden board.

## Goals

The integration must support:

- mobile browser gameplay;
- Arbitrum Sepolia testnet;
- encrypted fleet placement;
- encrypted hit detection;
- encrypted sunk and win checks;
- public reveal of only allowed results;
- asynchronous FHE resolution states in the UI;
- no centralized authoritative game backend;
- optional backendless bot mode later.

## Non-goals

The Fhenix integration must not:

- reveal plaintext ship placement;
- rely on frontend-only validation for game rules;
- let the frontend provide hit, miss, sunk, or win results;
- let an indexer or backend become the source of truth;
- expose hidden cells through permits or broad access grants;
- auto-decrypt values just because they are convenient for UI.

## Target Network

The MVP target network is:

- network: Arbitrum Sepolia;
- chain id: `421614`;
- gas token: ETH;
- Fhenix/CoFHE plugin name: `arb-sepolia`.

Fhenix Compatibility lists Arbitrum Sepolia as a supported network with full support and plugin name `arb-sepolia`.

The app must require the connected wallet to be on Arbitrum Sepolia before starting any match transaction.

## Current Fhenix Components

Use the compatible CoFHE package versions from the Fhenix Compatibility page when implementation begins.

Relevant components:

- `@cofhe/sdk` - browser client SDK for encryption, permits, and decryption requests;
- `@fhenixprotocol/cofhe-contracts` - Solidity contracts and `FHE.sol`;
- `@cofhe/hardhat-plugin` or `@cofhe/foundry-plugin` - local development and testing;
- `@cofhe/mock-contracts` - mock FHE environment for local tests.

The exact versions should be pinned in the implementation repo after package installation.

## High-level Architecture

Fhenix integration spans three layers:

1. Browser client:
   - connects wallet;
   - creates the CoFHE client;
   - encrypts fleet placement;
   - creates permits when needed;
   - requests `decryptForTx` for public game result finalization;
   - requests `decryptForView` only for values the player is allowed to view.

2. Smart contract:
   - accepts encrypted inputs through `InE*` structs;
   - converts them to encrypted values through `FHE.asE*`;
   - stores encrypted board and counters;
   - runs encrypted comparisons and updates;
   - manages access with `FHE.allowThis`, `FHE.allow`, `FHE.allowSender`, and `FHE.allowPublic`;
   - verifies or publishes decrypt results.

3. CoFHE infrastructure:
   - validates encrypted inputs;
   - performs FHE-related off-chain computation;
   - handles threshold decryption requests;
   - returns signed decrypt results for on-chain verification.

## SDK Setup

The browser app should use the web entrypoint:

```ts
import { createCofheClient, createCofheConfig } from '@cofhe/sdk/web';
import { chains } from '@cofhe/sdk/chains';
```

The SDK docs show that browser apps should import from `@cofhe/sdk/web`, create config with `createCofheConfig`, create a client with `createCofheClient`, and connect it using viem-shaped public and wallet clients.

Expected setup:

```ts
const cofheConfig = createCofheConfig({
  supportedChains: [chains.arbitrumSepolia],
  useWorkers: true,
});

const cofheClient = createCofheClient(cofheConfig);

await cofheClient.connect(publicClient, walletClient);
```

Implementation note:

- confirm the exact exported chain key for Arbitrum Sepolia during implementation;
- if the SDK uses a different constant name, keep the project network target as Arbitrum Sepolia with plugin name `arb-sepolia`.

## Wallet Integration

The app should connect wallets through the frontend web3 stack, then pass viem-compatible clients into CoFHE.

Recommended stack:

- `viem` for low-level clients;
- `wagmi` for React wallet state;
- WalletConnect-compatible mobile wallet support;
- CoFHE client connected after the wallet and network are ready.

The CoFHE client must reconnect when:

- wallet account changes;
- chain changes;
- wallet disconnects and reconnects.

UI states:

- `Connect Wallet`;
- `Wallet Connected`;
- `Wrong Network`;
- `Switch to Arbitrum Sepolia`;
- `Fhenix Ready`;
- `Fhenix Connection Failed`.

## Encrypted Input Rules

The Fhenix SDK encrypts plaintext values into encrypted input structs that can be passed into contract calls.

Important rules from the SDK docs:

- call `encryptInputs(...).execute()` to produce encrypted input objects;
- the encrypted type must match the Solidity input type;
- encrypted inputs are authorized for a specific account and chain;
- one encryption call has a plaintext bit limit, so large payloads may need batching;
- proof generation should use Web Workers in the browser to avoid blocking the UI.

Type mapping examples:

- `Encryptable.bool(...)` maps to `InEbool`;
- `Encryptable.uint8(...)` maps to `InEuint8`;
- `Encryptable.uint16(...)` maps to `InEuint16`;
- `Encryptable.uint32(...)` maps to `InEuint32`;
- `Encryptable.uint64(...)` maps to `InEuint64`;
- `Encryptable.address(...)` maps to `InEaddress`.

For the game, cell data should prefer compact encrypted types:

- cell value: `InEuint8`;
- ship id: `InEuint8`;
- hit flag: `InEbool`;
- ship health or total health: `euint8` or `euint16`;
- result enum candidate: `euint8`.

## Fleet Placement Encoding

The MVP should start with an encrypted cell-array model unless a prototype proves it is too expensive.

Board:

- 10 by 10 cells;
- cell indexes `0..99`;
- each encrypted cell value represents water or a ship id.

Candidate encoding:

- `0` = water;
- `1` = carrier;
- `2` = battleship;
- `3` = cruiser;
- `4` = destroyer;
- `5` = submarine;
- `6` = patrol boat.

Client-side data shape before encryption:

```ts
type PlainFleetCell = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type PlainFleet = PlainFleetCell[];
```

Contract-side shape:

```solidity
struct EncryptedFleetInput {
  InEuint8[100] cells;
}
```

Potential issue:

- one `encryptInputs` call may not support the full 100-cell array if the plaintext bit limit or calldata size becomes restrictive.

Fallback encodings:

- batch the 100 cells into multiple encrypted input calls;
- use packed encrypted bitmasks;
- use encrypted ship-list representation;
- use auto placement with encrypted seed for early prototypes.

The exact encoding must be finalized in `docs/contract-data-model.md`.

## Fleet Submission Flow

Flow:

1. Player places ships in the mobile UI.
2. Frontend validates obvious local placement rules for UX only.
3. Frontend creates a plaintext fleet representation.
4. Frontend encrypts fleet data through `@cofhe/sdk`.
5. Player confirms `submitFleet` transaction.
6. Contract converts `InE*` inputs into encrypted values.
7. Contract stores encrypted fleet state.
8. Contract grants itself persistent access through `FHE.allowThis`.
9. Contract starts encrypted validation.
10. Contract publishes only final placement validity.

Contract call:

```solidity
submitFleet(uint256 matchId, EncryptedFleetInput calldata input)
```

UI states:

- `Encrypting fleet`;
- `Confirm in Wallet`;
- `Submitting fleet`;
- `Validating placement`;
- `Fleet confirmed`;
- `Fleet placement invalid`.

## Solidity Input Handling

Contracts should import:

```solidity
import '@fhenixprotocol/cofhe-contracts/FHE.sol';
```

Encrypted inputs are converted through `FHE.asE*` functions.

Example pattern:

```solidity
function submitCell(InEuint8 memory inCell) external {
  euint8 cell = FHE.asEuint8(inCell);
  FHE.allowThis(cell);
}
```

For stored encrypted values:

- always grant contract access with `FHE.allowThis`;
- avoid granting player or public access unless the value is intentionally viewable;
- do not grant opponent access to hidden fleet state.

## Access Control Policy

Fhenix access control is essential because ciphertext handles can otherwise be misused by other contracts or users.

Game access rules:

## Hidden Fleet Cells

Access:

- contract: yes, through `FHE.allowThis`;
- owning player: optional and only if needed;
- opponent: no;
- public: no.

Never use `FHE.allowPublic` for hidden fleet cells.

## Placement Validity Result

Access:

- public result is allowed;
- only the final boolean should be revealed.

Use:

- `FHE.allowPublic` on the encrypted validity result if any caller can finalize the public reveal;
- `decryptForTx(...).withoutPermit()` if publicly allowed;
- verify or publish the result in the contract.

## Shot Result

Access:

- final result should become public;
- raw board state must remain private.

Use:

- `FHE.allowPublic` only for the encrypted result value that encodes `Miss`, `Hit`, `Sunk`, or `Win`;
- do not expose intermediate encrypted comparisons or ship health unless required.

## Player-owned View Data

Access:

- owning player can view only data that the game intentionally allows;
- opponent cannot view hidden state.

Use:

- `FHE.allow(value, playerAddress)` for player-only view data;
- `decryptForView` with a permit on the client.

## Permits

Permits are EIP-712 signatures that authorize decryption of confidential data.

Use permits for:

- `decryptForView`, which always requires a permit;
- restricted `decryptForTx` flows when the contract did not allow public decryption.

Do not use permits to let a player inspect opponent hidden fleet data.

Recommended client flow:

```ts
await cofheClient.connect(publicClient, walletClient);
await cofheClient.permits.getOrCreateSelfPermit();
```

Permit scope:

- chain id;
- wallet account;
- allowed encrypted handle.

Permit UX states:

- `Preparing secure access`;
- `Sign Permit`;
- `Permit Ready`;
- `Permit Rejected`.

## Decrypt for View

Use `decryptForView` only when plaintext is needed locally in the UI and does not need on-chain verification.

Good uses:

- showing the player's own authorized private data;
- optional post-match own-fleet confirmation;
- development diagnostics gated behind safe permissions.

Bad uses:

- deciding hit or miss in the frontend;
- reading opponent fleet;
- revealing game results that must be written on-chain.

Flow:

1. Read encrypted handle from the contract.
2. Ensure the connected wallet has a permit.
3. Call `decryptForView(ctHash, utype).execute()`.
4. Display result locally only.

## Decrypt for Transaction

Use `decryptForTx` when the decrypted value must be verified or published on-chain.

Game uses:

- placement validity;
- shot result;
- sunk flag;
- win flag;
- bot random template reveal only if it is safe to reveal.

Flow:

1. Contract produces encrypted result.
2. Contract grants public or restricted decryption access.
3. Client requests `decryptForTx(ctHash)`.
4. Client receives `{ ctHash, decryptedValue, signature }`.
5. Client submits a transaction with the plaintext and signature.
6. Contract verifies or publishes the result.
7. Contract updates public match state.

Public result example:

```ts
const decryptResult = await cofheClient
  .decryptForTx(ctHash)
  .withoutPermit()
  .execute();
```

Restricted result example:

```ts
const decryptResult = await cofheClient
  .decryptForTx(ctHash)
  .withPermit()
  .execute();
```

## Writing Decrypt Results to Contract

The SDK returns a decrypt result with:

- `ctHash`;
- `decryptedValue`;
- `signature`.

The contract can:

- publish the result through `FHE.publishDecryptResult`;
- verify without global publishing through `FHE.verifyDecryptResult`.

For this game, prefer verify-only for internal match settlement unless there is a reason to publish globally.

Example function shape:

```solidity
function finalizeAttack(
  uint256 matchId,
  uint256 moveId,
  bytes32 ctHash,
  uint8 result,
  bytes calldata signature
) external {
  require(FHE.verifyDecryptResult(ctHash, result, signature), 'Invalid decrypt signature');
  // update public move result and turn state
}
```

The exact plaintext type must match the encrypted type. If the encrypted result is `euint8`, the plaintext should fit in `uint8`.

## Placement Validation Plan

Validation should happen in stages.

## Stage 1: MVP-safe Validation

Minimum checks:

- exactly valid board size;
- no out-of-range ship values;
- total occupied cell count matches fleet size;
- no repeated plaintext submission path;
- placement stored only encrypted.

This stage may still require simplified placement assumptions.

## Stage 2: Full Battleship Validation

Additional checks:

- each ship has correct length;
- ships are straight;
- ships do not overlap;
- ships do not touch if the classic rule is enforced;
- final fleet set matches the game rules.

Full validation may be expensive and must be measured.

## Stage 3: Optimized Encoding

If encrypted cell-array validation is too costly:

- move to encrypted ship-list encoding;
- use compact public commitments plus encrypted proof-like validation;
- use contract-generated auto placement from encrypted randomness for some modes.

## Shot Resolution Plan

Attack coordinate is public. Hidden fleet state is private.

Flow:

1. Current player calls `attack(matchId, cellIndex)`.
2. Contract verifies turn and target.
3. Contract reads defender encrypted fleet cell at `cellIndex`.
4. Contract computes encrypted hit flag.
5. Contract updates encrypted ship health if hit.
6. Contract computes encrypted sunk and win flags.
7. Contract encodes the final encrypted shot result as `euint8`.
8. Contract grants public decrypt access to the final result only.
9. UI enters `Resolving Shot`.
10. Any allowed caller runs `decryptForTx`.
11. Caller submits result and signature through `finalizeAttack`.
12. Contract verifies signature and updates public state.

Public result encoding:

- `0` = `None`;
- `1` = `Miss`;
- `2` = `Hit`;
- `3` = `Sunk`;
- `4` = `Win`.

Finalized shot results must never use `None`.

Do not reveal:

- defender full board;
- ship id for non-sunk hit unless rules require it;
- remaining ship health;
- hidden non-attacked cells.

## Asynchronous UI States

The UI must treat Fhenix operations as asynchronous.

Required states:

- `Encrypting fleet`;
- `Submitting fleet`;
- `Validating placement`;
- `Resolving Shot`;
- `Publishing result`;
- `Result confirmed`;
- `Fhenix request failed`;
- `Retry resolution`.

The app must not unlock the next turn until:

- transaction is confirmed;
- decrypt result is verified or published on-chain;
- contract emits the final event for the move.

## Event Strategy

Contracts should emit events at every Fhenix boundary.

Suggested events:

```solidity
event FleetSubmitted(uint256 indexed matchId, address indexed player);
event FleetValidationRequested(uint256 indexed matchId, address indexed player, bytes32 ctHash);
event FleetValidated(uint256 indexed matchId, address indexed player, bool valid);
event ShotSubmitted(uint256 indexed matchId, uint256 indexed moveId, address indexed attacker, uint8 cellIndex);
event ShotResolutionRequested(uint256 indexed matchId, uint256 indexed moveId, bytes32 ctHash);
event ShotResolved(uint256 indexed matchId, uint256 indexed moveId, uint8 result);
```

The frontend should listen to events rather than assuming immediate state transitions after wallet confirmation.

## Backendless Result Finalization

The project should avoid requiring a centralized backend to finalize Fhenix decrypt results.

Any of these can submit finalization transactions:

- current player;
- opponent;
- any public caller;
- future decentralized keeper;
- optional project relayer if added later as a convenience only.

The caller must not be trusted. The contract must verify the decrypt signature and expected `ctHash`.

## Backendless Bot Integration

Backendless bot mode can reuse the same Fhenix pieces.

Bot fleet:

- ideally generated by contract logic with encrypted randomness;
- or selected from a template pool through encrypted randomness;
- never generated by the player's browser for production.

Bot shot:

- triggered by `executeBotMove(matchId)`;
- target chosen by contract logic;
- hit detection resolved through the same encrypted shot flow;
- final result published through `decryptForTx` and signature verification.

The player may need to confirm the bot-turn transaction in the wallet if no public keeper is available.

## Local Development

Local tests should use CoFHE mock contracts and the Hardhat or Foundry plugin.

Mock goals:

- test contract state transitions;
- test access control rules;
- test encrypted input shape;
- test event flow;
- test frontend against deterministic local data;
- avoid depending on live Fhenix infrastructure for every test.

Important warning:

- mock contracts may simulate FHE behavior differently from testnet;
- always run end-to-end tests on Arbitrum Sepolia before considering a flow valid.

## Arbitrum Sepolia Testing

Testnet testing must verify:

- SDK can connect on Arbitrum Sepolia;
- `encryptInputs` works from mobile browser;
- wallet can submit encrypted placement;
- contract stores encrypted fleet values;
- access control blocks unauthorized decrypt attempts;
- `decryptForTx` returns signed result;
- contract verifies decrypt result;
- shot resolution works end to end;
- UI handles Fhenix pending states;
- gas and latency are acceptable.

## Mobile Browser Requirements

Fhenix integration must be mobile-friendly.

Requirements:

- use Web Workers for encryption when available;
- show progress during encryption and proof generation;
- avoid freezing the 3D scene while encrypting;
- keep wallet actions clear;
- allow retry after failed Fhenix requests;
- recover after page refresh by reading match state from contract;
- never lose pending move context after wallet return.

## Error Handling

Expected error categories:

- wrong network;
- wallet disconnected;
- user rejected wallet signature;
- user rejected transaction;
- encryption failed;
- permit creation failed;
- encrypted input type mismatch;
- Fhenix request failed;
- decrypt denied by ACL;
- decrypt result invalid;
- transaction reverted;
- stale move id;
- stale `ctHash`;
- resolution already finalized.

Player-facing errors should be short:

- `Wrong network`;
- `Wallet disconnected`;
- `Encryption failed`;
- `Secure access denied`;
- `Shot resolution failed`;
- `Move already resolved`;
- `Try again`.

Developer logs can include the raw Fhenix error.

## Security Rules

Must enforce:

- plaintext fleet never goes on-chain;
- plaintext fleet never appears in events;
- hidden fleet cells never use `allowPublic`;
- opponent never receives a permit for hidden fleet;
- final game results are verified through Fhenix signatures;
- frontend does not decide result;
- indexer is read-only;
- match id and move id are checked during finalization;
- `ctHash` must match the pending encrypted result for that move;
- stale decrypt results cannot finalize a newer move.

## Open Decisions

These must be resolved during prototype:

- exact Arbitrum Sepolia chain export name in `@cofhe/sdk/chains`;
- exact encrypted fleet encoding;
- whether fleet validation is full or simplified for MVP;
- whether result uses one `euint8` enum or separate encrypted booleans;
- whether finalization uses `verifyDecryptResult` or `publishDecryptResult`;
- who pays gas for result finalization if the active player leaves;
- whether any keeper is introduced later as optional convenience;
- whether bot fleet uses encrypted template selection or full encrypted generation.

## MVP Integration Checklist

The MVP Fhenix integration is complete when:

- CoFHE client connects on Arbitrum Sepolia;
- wallet network switching works;
- fleet placement is encrypted in the browser;
- contract accepts encrypted fleet input;
- contract stores fleet state without plaintext;
- contract keeps access to encrypted fleet via `FHE.allowThis`;
- opponent cannot decrypt hidden fleet;
- placement validity can be resolved publicly;
- attack result can be resolved publicly;
- result finalization verifies Fhenix signature;
- UI handles pending FHE states;
- friend-match flow works end to end on Arbitrum Sepolia.

## Sources

- [Fhenix Compatibility](https://cofhe-docs.fhenix.zone/get-started/introduction/compatibility)
- [@cofhe/sdk Overview](https://cofhe-docs.fhenix.zone/client-sdk/introduction/overview)
- [Client Setup](https://cofhe-docs.fhenix.zone/client-sdk/guides/client-setup)
- [Encrypting Inputs](https://cofhe-docs.fhenix.zone/client-sdk/guides/encrypting-inputs)
- [Writing Encrypted Data to Contract](https://cofhe-docs.fhenix.zone/client-sdk/guides/writing-encrypted-data)
- [Permits](https://cofhe-docs.fhenix.zone/client-sdk/guides/permits)
- [Decrypt to View](https://cofhe-docs.fhenix.zone/client-sdk/guides/decrypt-to-view)
- [Decrypt to Transact](https://cofhe-docs.fhenix.zone/client-sdk/guides/decrypt-to-tx)
- [Writing Decrypt Result to Contract](https://cofhe-docs.fhenix.zone/client-sdk/guides/writing-decrypt-result)
- [FHE.sol Overview](https://cofhe-docs.fhenix.zone/fhe-library/reference/fhe-sol/overview)
- [Access Control](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/access-control)
- [Decryption Operations](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/decryption-operations)
- [Data Evaluation](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/data-evaluation)
- [Fhenix Randomness](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/randomness)
- [Arbitrum Sepolia Chain Info](https://thirdweb.com/arbitrum-sepolia)
