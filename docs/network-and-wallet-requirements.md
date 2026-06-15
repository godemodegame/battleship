# Network and Wallet Requirements

## Purpose

This document records the wallet and network requirements implemented for the
friend-match flow. Phase 2 added Privy and the Arbitrum Sepolia guard; Phases
5 through 9 connected those clients to every contract write, recovery path,
security test, and release check.

> **Update (2026-06): social/email login + sponsored gas enabled.** The
> wallet-only / user-pays-gas constraints below were the original first-milestone
> scope. The app now also offers social/email sign-in and mints a Privy embedded
> wallet for users without an external wallet, and sponsors gas (EIP-7702) for
> those embedded wallets. External-wallet users are unchanged and keep paying
> their own gas. Lines marked _(superseded)_ describe the original scope.

## Decision Summary

- Use Privy as the only login, connection, and session UI.
- Offer external EVM wallets **and** social/email sign-in (the full set of
  dashboard-enabled Privy login methods).
- Mint a Privy embedded EVM wallet for any user who signs in without an external
  wallet (`createOnLogin: 'users-without-wallets'`).
- Use Arbitrum Sepolia only.
- Treat the connected EVM address, not the Privy user id, as the on-chain match
  identity. This holds for embedded wallets too: gas sponsorship uses EIP-7702,
  which keeps the embedded wallet's address identical to the EOA the contract
  sees as `msg.sender` and that CoFHE binds permits to — so identity and
  encryption are unchanged. (A separate smart-account address, e.g. classic
  ERC-4337, would break both and must not be introduced.)
- Sponsor gas for embedded-wallet sessions via Privy native "App pays"
  (EIP-7702). External-wallet sessions pay their own gas.
- Use viem-compatible clients for contract and CoFHE calls.
- wagmi may be used through Privy's wagmi integration for React hooks, but it
  must not introduce a second connection modal.

Smart wallets with a distinct account address and multi-chain gameplay remain
out of scope and require separate product and security decisions.

## Required Network

Arbitrum Sepolia parameters:

| Field | Value |
| --- | --- |
| Network name | `Arbitrum Sepolia` |
| Chain id | `421614` |
| Native currency | `ETH` |
| Public RPC | `https://sepolia-rollup.arbitrum.io/rpc` |
| Explorer | `https://sepolia.arbiscan.io` |

The public RPC is suitable as a development fallback. A public demo should use
a configured RPC provider with monitoring and rate limits appropriate for the
expected traffic.

Every contract address, transaction link, and match link must be associated
with chain id `421614`. A deployment from another chain must never be accepted
only because its contract address has the expected shape.

## Privy Configuration

Install and initialize the Privy React SDK at the application root.

Required configuration:

- Privy app id supplied through `VITE_PRIVY_APP_ID`;
- wallet login plus social/email login enabled in the Privy dashboard;
- `defaultChain` set to Arbitrum Sepolia;
- `supportedChains` limited to Arbitrum Sepolia;
- embedded wallet creation for users without an external wallet
  (`createOnLogin: 'users-without-wallets'`);
- gas sponsorship ("App pays") enabled for Arbitrum Sepolia, so embedded-wallet
  writes are gasless (EIP-7702);
- Ethereum/EVM wallets shown, with non-EVM wallet families hidden;
- one active wallet identity per session — the embedded wallet is preferred when
  present (see `activeWallet.ts`).

`defaultChain` improves the connection prompt but is not a security boundary.
An external wallet can decline the chain switch and remain connected on another
network. The app must independently check the active chain before enabling any
contract write.

Do not include a second RainbowKit, Web3Modal, or direct WalletConnect
connection surface. Privy's connect UI owns wallet discovery and connection.

### Dashboard Setup Checklist (GAME-201)

Per Privy app (one for development, one for staging):

- enable wallet login **and** the social/email methods you want to surface
  (Email needs no OAuth setup; each social provider needs its own dashboard
  credentials — Twitter/X additionally needs an X developer app);
- enable embedded wallets (required for `createOnLogin: 'users-without-wallets'`
  to take effect);
- under Wallet Infrastructure → Gas sponsorship, set mode to **App pays** and
  enable Arbitrum Sepolia (`421614`) so embedded-wallet writes are gasless;
- set the allowed origins to the local dev origin and the staging domain;
- copy the app id into `VITE_PRIVY_APP_ID` (local `.env.local`, staging env).

The code-side configuration that backs these choices lives in
`src/onchain/wallet/privyConfig.ts` (`loginMethods: ENABLED_LOGIN_METHODS`,
`embeddedWallets.ethereum.createOnLogin: 'users-without-wallets'`,
`walletChainType: 'ethereum-only'`, `supportedChains`/`defaultChain` = Arbitrum
Sepolia). The sponsored send itself is wired in `PrivyWalletBridge.tsx` via
`useSendTransaction({ sponsor: true })`. When `VITE_PRIVY_APP_ID` is unset the
app runs practice-only and on-chain routes show a recoverable "wallet not
configured" message; see `.env.example`.

### Implementation Status

- All of Phase 2 (`GAME-201` through `GAME-211`) is complete.
- `src/onchain/wallet/` contains: wallet-only Privy + viem bridge, pure session
  derivation, `421614` guard, `evaluateWriteReadiness`, wrong-network recovery,
  account-epoch + disconnect cleanup (GAME-208), live balance fetch + zero-balance
  funding notice (GAME-209), handoff intent persistence + visibility/focus restore
  with route target (GAME-210), and the supported wallet matrix exercised via Privy
  (GAME-211, MetaMask + Coinbase on desktop + mobile handoff paths).
- LowBalanceNotice, prepareHandoff / handoffRestored signals, and accountEpoch are
  available for Phase 5+ contract write paths to consume.

## Supported Wallet Scope

The tested MVP support matrix is:

| Environment | Required support |
| --- | --- |
| Desktop Chromium | MetaMask, Coinbase Wallet, detected EIP-1193 wallets |
| Desktop Safari | Coinbase Wallet or another Privy-supported external wallet |
| iOS Safari | MetaMask mobile and Coinbase Wallet mobile handoff/return |
| Android Chrome | MetaMask mobile and Coinbase Wallet mobile handoff/return |
| Other wallets | Best effort through Privy's WalletConnect registry |

Wallets that cannot operate on Arbitrum Sepolia are not supported for the
testnet milestone even if Privy can display them.

On desktop, a WalletConnect QR fallback may be offered. On mobile, prefer named
mobile wallets and Privy's mobile WalletConnect flow; do not present a
QR-only option on the same device.

## Connection Flow

Required flow:

1. The player opens an on-chain route or chooses `Play Against Friend`.
2. The app opens Privy's login/connect UI.
3. The player selects an external wallet.
4. Privy authenticates the wallet session.
5. The app resolves the active EVM wallet and address.
6. The app checks chain id `421614`.
7. If needed, the app asks the wallet to switch to Arbitrum Sepolia.
8. The app creates viem-compatible public and wallet clients.
9. The app initializes or reconnects the CoFHE client.
10. The app refetches contract state before enabling match actions.

Do not treat `authenticated === true` as sufficient for gameplay. The app also
needs:

- an active external EVM wallet;
- a non-empty address;
- Arbitrum Sepolia as the active chain;
- a working public client;
- a working wallet client;
- a successful contract read;
- a ready CoFHE client for encrypted operations.

## Wrong-Network Recovery

When the wallet is connected to another chain:

- keep the account visible;
- block all contract writes;
- show `Wrong Network`;
- make `Switch to Arbitrum Sepolia` the primary action;
- preserve the intended route and match id;
- call Privy's wallet `switchChain(421614)` action;
- re-read the active chain after the wallet resolves the request;
- rebuild public, wallet, and CoFHE clients;
- refetch match state.

If the player rejects the switch:

- remain connected;
- keep writes disabled;
- show a recoverable message;
- allow another switch attempt;
- allow disconnecting or choosing another wallet.

Never silently write to a contract on the wallet's previous chain.

## Mobile Wallet Return

Before opening a mobile wallet:

- persist only the intended route, match id, and pending action type;
- do not persist plaintext fleet cells or encrypted input secrets;
- mark the action as waiting for wallet confirmation.

After the browser regains focus or visibility:

1. ask Privy for the current session and active wallet;
2. re-check account and chain;
3. query the transaction receipt if a hash is known;
4. refetch contract match state;
5. reconnect CoFHE if the account or chain changed;
6. resume the correct UI phase from contract state.

The app must tolerate the mobile browser being suspended or reloaded while the
wallet application is open.

## Funded Test Wallets

Every manual test wallet must hold Arbitrum Sepolia ETH for gas.

Requirements:

- check the balance before entering a multi-transaction friend-match flow;
- show a clear testnet-funding message when the balance is zero or obviously
  insufficient;
- fund both players before an end-to-end test;
- keep enough buffer for create, join, fleet submission, attack, finalize,
  forfeit, and retry transactions;
- do not define a permanent ETH minimum because gas prices and contract costs
  can change;
- never commit test-wallet private keys or seed phrases;
- use separate disposable test wallets for automated or shared testing.

The UI may link to an approved faucet or bridge from help text, but it must not
request, store, or transmit a player's private key.

## Transaction Rejection and Retry

Before submission:

- show the action and match it affects;
- require the active account and chain to pass the guard;
- disable duplicate submissions while the wallet prompt is open.

If the player rejects the wallet request:

- do not mark the action as submitted;
- restore the action button;
- show an English recoverable message;
- preserve safe form or target-selection state;
- do not preserve plaintext fleet state outside memory.

After a transaction hash exists:

- show a pending state and explorer link;
- prevent duplicate writes for the same action;
- track replacement, revert, drop, and confirmation outcomes;
- refetch contract state after confirmation;
- wait for required Fhenix finalization rather than assuming a receipt is the
  final game result.

A retry must first read contract state. The app must not resubmit an action that
the contract already accepted during a lost browser session.

## Account Switch Recovery

When the active wallet address changes:

- stop pending local action orchestration;
- clear selected target and transient transaction forms;
- clear plaintext placement state immediately;
- invalidate account-bound CoFHE clients, permits, and encrypted inputs;
- rebuild viem clients;
- refetch player matches for the new address;
- refetch the open match before choosing a screen;
- route to a read-only or access-denied state if the new address is not a
  player in that match.

The app must never continue a transaction prepared for the previous account.

If Privy reports several linked wallets, the UI must make the active wallet
explicit. The first milestone should avoid account ambiguity by restricting the
session to one active external wallet.

## Disconnect and Session Expiry

On disconnect or expired Privy session:

- clear account-scoped caches;
- clear plaintext placement and selected target state;
- disconnect CoFHE account-bound state;
- preserve only non-sensitive settings such as sound and graphics quality;
- return to the wallet-required screen for on-chain routes;
- keep local practice mode available.

A local practice match must not be converted into an on-chain match after
reconnection.

## Security and Privacy Rules

- Never log signatures, authorization payloads, encrypted input secrets, or
  plaintext fleet cells.
- Never use the Privy user id as an authorization substitute for the wallet
  address checked by the contract.
- Never trust a cached account or chain value before a write.
- Never expose raw provider, RPC, Privy, viem, Solidity, or CoFHE errors to the
  player.
- Never ask the player to import a seed phrase into the application.
- Clear account-bound private state on account, chain, logout, and match
  changes.

## Player-Facing Error Mapping

Minimum recoverable states:

| Condition | UI copy |
| --- | --- |
| Privy modal closed | `Wallet connection cancelled.` |
| Signature rejected | `Action cancelled in wallet.` |
| Unsupported or unavailable wallet | `This wallet is not available. Choose another wallet.` |
| Wrong chain | `Switch to Arbitrum Sepolia to continue.` |
| Chain switch rejected | `Network switch cancelled. Try again to continue.` |
| No test ETH | `Add Arbitrum Sepolia ETH before sending transactions.` |
| RPC unavailable | `Network request failed. Try again.` |
| Transaction reverted | `Transaction failed. Match state was refreshed.` |
| Account changed | `Wallet changed. Match state was refreshed.` |
| Session expired | `Reconnect your wallet to continue.` |

These strings should be centralized in the future `src/copy/` module.

## Acceptance Criteria

The wallet/network milestone is complete when:

- Privy is the only connection UI;
- wallet, social, and email sign-in all work; a user without an external wallet
  receives a Privy embedded wallet;
- embedded-wallet writes are gasless (sponsored, EIP-7702); external-wallet
  writes are paid by the wallet;
- MetaMask and Coinbase Wallet complete desktop and mobile connection tests;
- the app blocks writes on every chain except `421614`;
- rejected connection, signature, and chain-switch requests are recoverable;
- browser return from a mobile wallet restores the intended match route;
- account switching clears private local state and refetches contract state;
- zero-balance external wallets receive a funding message before the match flow
  (suppressed for sponsored embedded-wallet sessions);
- confirmed transactions trigger contract refetches;
- local practice remains playable without a wallet.

## Official References

Verified on June 10, 2026:

- Privy React setup:
  https://docs.privy.io/basics/react/setup
- Privy EVM network configuration:
  https://docs.privy.io/basics/react/advanced/configuring-evm-networks
- Privy external wallet configuration:
  https://docs.privy.io/basics/react/advanced/configuring-external-wallets
- Privy chain switching:
  https://docs.privy.io/wallets/using-wallets/ethereum/switch-chain
- Privy mobile wallet behavior:
  https://docs.privy.io/wallets/connectors/usage/mobile
- Arbitrum chain information:
  https://docs.arbitrum.io/build-decentralized-apps/reference/node-providers

Recheck SDK configuration names and wallet compatibility when implementation
starts; provider APIs and wallet support can change.
