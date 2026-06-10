## Summary

PR #14 completes Phase 2 (GAME-201..211) by landing P1 items on top of the prior Privy+viem+network-guard foundation: account-epoch + disconnect cleanup (GAME-208), zero-balance funding notice + live getBalance (GAME-209), mobile handoff intent persistence in sessionStorage + visibility/focus + history-restore + transient `handoffRestored` signal (GAME-210), plus supporting test/docs/haptics/sfx updates (GAME-211 matrix exercised via Privy).

The changes are additive and the core wallet session model, network guard, and write guard remain unchanged and correctly factored. All touched tests pass. Dominant risk areas are (1) the handoff restore path (uses history.replaceState + synthetic popstate above the Router with no unit coverage of the navigation effect), (2) the LowBalanceNotice integration (onFund callback in MatchRouteShell only primes handoff and never opens a faucet or performs funding) — **FIXED**, and (3) lightly-tested new state (balance fetch, accountEpoch, handoffRestored signal) and their cross-module wiring.

No unwraps of user data, no obvious races in the cancel-token effects, and storage ops are all try/catch. A few docstring/test-name mismatches and one mock pollution were introduced in the changed files.

**Follow-up (post-review):** Two bugs identified in the initial review have been fixed and pushed in commit 1494c32 on feat/phase-2.

## Issues

### Issue 1 -- Severity: bug
- File: src/onchain/MatchRouteShell.tsx:254
- Description: When LowBalanceNotice is rendered on a real (non-demo) match route, the onFund prop is supplied with a callback that *only* calls prepareHandoff(). Because LowBalanceNotice's handleFund does `if (onFund) { onFund(); return; }` (never reaching the window.open fallback), clicking "Get Arbitrum Sepolia ETH" has no visible effect and never opens a faucet. The comment acknowledges this is "in a real flow" but the current implementation leaves the primary action dead for GAME-209.
- Suggestion: Either omit onFund (so default open happens) or make the provided onFund also perform the open (and optionally prepare only for true wallet handoffs). Consider whether prepareHandoff is even appropriate for a web faucet tab vs. a mobile wallet app switch.
- Status: completed
- Fixed in: commit 1494c32 — Now calls `prepareHandoff()` then `window.open(FAUCET_URL, ...)` using the shared exported constant. Added explanatory comment referencing GAME-209 + GAME-210.

### Issue 2 -- Severity: bug
- File: src/onchain/wallet/LowBalanceNotice.tsx:48
- Description: The balance suffix always renders the literal string " · 0 wei" whenever balanceWei is truthy (non-undefined and non-null). The raw value of the bigint prop is ignored; the text is not derived from balanceWei. The JSDoc claims the prop is "for title/tooltip", but the title attribute on the address element is always the full address and the wei text is inline body content. This is only exercised for the zero case today, but is still incorrect vs. the stated contract and the testid name.
- Suggestion: Either remove the conditional wei span (the zero status is already known by the caller), render the actual value (` · ${balanceWei} wei`), or update the prop JSDoc and callers. At minimum make the rendered text match what was passed.
- Status: completed
- Fixed in: commit 1494c32 — Now renders ` · {balanceWei.toString()} wei` dynamically. Updated JSDoc for accuracy. Exported `FAUCET_URL` constant. Added tests asserting the dynamic value for 0n and large bigints.

### Issue 3 -- Severity: suggestion
- File: src/onchain/wallet/WalletProvider.tsx:174
- Description: The GAME-210 handoff restore useEffect (visibility/focus + immediate onResume + consume + optional history.replaceState + PopStateEvent) has no coverage that exercises the restore navigation or the handoffRestored flag being raised and later cleared when a real WalletProvider + BrowserRouter tree is mounted. matchRouteWalletGate.test.tsx and routes.test.tsx only ever supply pre-canned context values or bypass the provider entirely (MemoryRouter + appRoutes); handoff.test.ts only covers the storage helpers. The replaceState + synthetic popstate hack (necessary because provider is above Router) is therefore untested in the PR.
- Suggestion: Add at least a test that mounts a real provider (or sufficiently fakes the handoff path) and asserts that handoffRestored becomes true and the data-testid="handoff-restored" node appears (and disappears after clear). Consider a jsdom-based visibility/focus simulation if full e2e is out of scope.
- Status: open

### Issue 4 -- Severity: suggestion
- File: src/onchain/MatchRouteShell.tsx:209
- Description: The useEffect that consumes handoffRestored depends on `wallet.actions` (the whole object). In WalletSessionBridge the value object (and thus actions: {...}) is freshly allocated on every render even though the individual callbacks are useCallback-stable. This causes the effect to re-evaluate on many unrelated provider re-renders while handoffRestored is (transiently) true.
- Suggestion: Change the dependency to `wallet.actions.clearHandoffRestore` (or the whole wallet object if preferred) to avoid unnecessary effect runs. The current code is not incorrect but is fragile and will become more expensive once real re-renders (balance polls, session updates) occur inside the provider.
- Status: open

### Issue 5 -- Severity: suggestion
- File: src/app/routes/routes.test.tsx:24
- Description: The sfx mock factory places `ensureAudio: vi.fn()` inside the `sfx: { ... }` object. The real module exports `ensureAudio` as a *named export* at the top level (`export function ensureAudio`), not as `sfx.ensureAudio`. (Same pattern appears in the hoisted mock in src/ui/screens.test.tsx:1271.) Because every test file that now imports code pulling in haptics also supplies a full haptics mock, the real haptics.ts (which does `import { ensureAudio } from './sfx'`) is never executed under the sfx mock, so the bug is not triggered today. It is still a latent mock contract error introduced by this PR.
- Suggestion: Move ensureAudio (and any future named exports) to the top level of the mock return value:
  `vi.mock(..., () => ({ sfx: { ui:..., ... }, ensureAudio: vi.fn() }))`.
- Status: open

### Issue 6 -- Severity: nit
- File: src/onchain/wallet/LowBalanceNotice.test.tsx:22
- Description: The test description claims it verifies both "invokes onFund when provided *and falls back to opening a faucet tab*", but the body only ever supplies an onFund and asserts the callback; the fallback window.open path is never executed (and is commented as untestable in jsdom). The LowBalanceNotice unit test therefore does not actually cover the default faucet behavior.
- Suggestion: Either split into two tests (one with onFund, one without) or update the description to match what is asserted. Add a jsdom-friendly spy on window.open for the no-callback case if desired.
- Status: open

### Issue 7 -- Severity: nit
- File: src/onchain/wallet/WalletProvider.tsx:133
- Description: Balance query does `getBalance({ address: balanceKey as \`0x${string}\` })`. This is a cast rather than a runtime guard or branded type. While address comes from the wallet and is later normalized by deriveWalletSession, a malformed value from Privy would produce a runtime error from viem (caught and turned into null balance).
- Suggestion: Consider a small helper `toViemAddress(a: string | null): \`0x${string}\` | null` that returns null (or throws a controlled error) for non-matching strings instead of an assertion cast at the call site. Not a current failure but worth tightening alongside the existing normalizeAddress logic.
- Status: open

### Issue 8 -- Severity: nit
- File: src/onchain/wallet/WalletProvider.tsx:145
- Description: `isSupportedChainForBalance` is defined (as a function declaration) after the balance useEffect and the readyForBalance expression that calls it. While function declarations are hoisted within the component body (so no TDZ), the definition order is surprising and would become a bug if the helper were ever rewritten as a const arrow.
- Suggestion: Move the tiny helper (or just inline the `=== ARBITRUM_SEPOLIA_CHAIN_ID` test) before the first use at render time.
- Status: open

### Issue 9 -- Severity: nit
- File: src/copy/errors.ts:18
- Description: `'no-test-eth'` error code and message were added (and the docs table updated) but nothing in the PR ever produces that code as a lastError (the balance notice is a separate presentational path; evaluateWriteReadiness still only returns its three reasons). The string is therefore dead code in this slice.
- Suggestion: Either wire a future write path to surface it when balanceStatus==='zero', or document that it is reserved for Phase 5+ and keep the addition. At present it is an unused export addition.
- Status: open

## Additional Observations (no issues filed)

- Handoff storage (handoff.ts) is correctly isolated to sessionStorage + try/catch, always clears on consume, discards stale entries, and only records /match/* paths. The 10-minute default maxAge and the 30s test override are sensible.
- Balance polling and wallet-client rebuild use the standard cancelled-flag + early return pattern; no setState-after-unmount risk.
- All new context fields (balance, balanceStatus, handoffRestored, accountEpoch, the two action fns) are present in DISCONNECTED_CONTEXT and the config-missing path.
- sfx/haptics priming changes (unconditional prime, added mousedown, capture opts, muted guards moved) are well-commented and appear to achieve the stated goal of sharing one unlocked AudioContext for both sound and iOS Taptic haptics.
- Docs updates (roadmap + network-and-wallet-requirements) accurately reflect the landed tasks and the new surface area (LowBalanceNotice, prepareHandoff, accountEpoch, handoffRestored).
- No direct tests exist for the provider's balance effect, epoch bumping, or the visibility-driven restore (understandable given Privy + real DOM events); the unit tests for the pure pieces are solid.

## Fix Summary (post-review)

- **Bugs fixed (2):** Issues 1 and 2 marked completed above. Changes pushed in commit 1494c32 (branch feat/phase-2).
- Build + full test:ci (unit + screen) passes.
- Relevant tests updated and green: LowBalanceNotice.test.tsx (now 4 tests covering dynamic balanceWei), plus gate, handoff, isolation, routes, screens.
- TypeScript clean.

See commit for details: https://github.com/godemodegame/battleship/commit/1494c32
