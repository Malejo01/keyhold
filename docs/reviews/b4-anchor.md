# B4 review: Anchor program `rental_escrow` (security gate)

**Verdict: NO-GO for merging as is. GO after B1.** B1 is a small fix: about 15 lines in `lib.rs`, 3 new tests and one CI run. Everything else on the branch is ready to merge. Deploying is out of scope and stays with Mauro.

- Reviewer: qa-security-reviewer (dev agent). I took part in the design debate (step 3) but did not write this code.
- Date: 2026-10-04 (ART, overnight).
- Target: branch `f3-anchor` at `dc742a8`: `programs/rental_escrow/**`, `tests/anchor/**`, `Anchor.toml`, `Cargo.toml`, `target/idl/rental_escrow.json`, `docs/onchain.md`.
- Method: line-by-line code reading against `docs/onchain.md` and `docs/debates/anchor-accounts/qa-tests.md`, plus the CI logs.
  - This machine has no Solana toolchain, so nothing was built or run locally.
  - Nothing was deployed.
  - The only network calls were read-only devnet `getAccountInfo` lookups.

## Evidence

| Check | Command / source | Result |
|---|---|---|
| CI on `dc742a8` | `gh run view 37181040706 --json jobs,headSha,conclusion` | `success`; jobs anchor-build, build, typecheck, lint, evals, test all `success` |
| Integration suite | CI log, `anchor test --validator legacy` | `ℹ tests 65 / ℹ pass 65 / ℹ fail 0 / ℹ skipped 0 / ℹ todo 0` |
| Pure math | CI log | `test result: ok. 5 passed; 0 failed` (vectors, u64::MAX, due overflow, bps, terms hash) |
| TS parity | CI log, vitest | `tests/anchor/pricing-vectors.test.ts (13 tests)`; whole suite `52 passed (52)` |
| Compute units | CI log | `{"CreateLease":35179,"DepositEscrow":11980,"PayRent":25878,"VoteRelease":28528,"CancelLease":18338}`. These are slightly above the figures in `docs/onchain.md:159` (33 679 / 24 399 / 19 838), from an older run. All are far below 200 000. |
| Committed IDL = built IDL | CI `===IDL-BEGIN===` block diffed against `target/idl/rental_escrow.json` | Identical; the only diff is the closing brace, cut off by the log marker |
| Mint fixture | `tests/anchor/fixtures/tusdc-mint.json` decoded | 82 bytes, owner Tokenkeg, mint authority `9axZsHHm…` (equals the key derived in the test from a public string), supply 0, decimals 6, initialized, **freeze authority None** |
| Devnet tUSDC (read only) | `getAccountInfo GiCyZLFr…` | classic SPL Token, decimals 6, `freezeAuthority: null`, mint authority `4sroL1aF…` (platform), **not** the fixture key, so the public test seed has no power on devnet |
| Placeholder program id | `getAccountInfo BJiwpRFD…` on devnet | `value: null`: nothing is deployed there |
| `anchor test` cannot deploy | `Anchor.toml:21-23` | `[provider] cluster = "localnet"`. CI generates a throwaway wallet and has no deploy step and no secrets |
| Secrets in history | `git log -p ad57ca3..HEAD \| grep -i -E "secret\|private\|keypair"`, `git ls-files`, and a scan for 64-byte arrays | Only docs, test code and the CI dummy `SESSION_SECRET`. No keypair file, no `.env` (only `.env.example`), no secret-key arrays. `.gitignore` ignores `*-keypair.json` and `/target/*` except `target/idl/` |

## Checklist (asked by the lead)

| Item | Result |
|---|---|
| Signer / `has_one` / owner / seeds on every account | OK. Every `Lease` use re-derives the seeds with `bump = lease.bump`. The vault has seeds, `bump = lease.vault_bump` and `token::authority = lease` in deposit, vote and cancel. `has_one = tenant` in deposit and pay; `has_one = landlord` in vote and cancel; `has_one = mint` everywhere after create. The role comes from the signer, never from an argument (R-07). **Exception: B1** (the `associated_token::` recipients and the `SystemAccount` landlord). |
| Mint and token program pinned | OK. `address = PAYMENT_MINT`, `decimals == 6` and `freeze_authority.is_none()` at create (`lib.rs:426-431`), then `has_one = mint`. `Program<'info, Token>` in every instruction. Token-2022 is rejected (C-10). |
| Vault authority, close and sweep (1-unit griefing) | **Fixed.** The payout sends `vault.amount - deposit` to the landlord before closing (`lib.rs:285-293`); cancel sweeps any dust too (`lib.rs:379-395`). Tested in R-15 and X-06. The vault rent goes to `lease.landlord`, who paid it (R-16). |
| Vote slots and terms hash (replacement griefing) | **Fixed for votes.** Each role owns one slot; `terms_hash` binds the split, `reason_hash` and `exit_report_hash` (R-10, R-11, R-12). B1 reopens the same liveness class through accounts. |
| `max_amount` | OK. Checked before any transfer (`lib.rs:178`), Q-08. `amount > 0` (`ZeroAmount`). |
| On-time from `Clock` | OK. `Clock::get()?.unix_timestamp` only, inclusive `now <= due` like `pricing.ts`. The client only sets the upper bound `max_amount`. |
| Integer math vs `computePrice` | OK. u32 bps sum with `checked_add`; u128 intermediate with floor; `min(10_000)` cap equal to `Math.min(MAX_BPS, …)`. The due date of the **last** month is checked at create (`lib.rs:69-74`). `overflow-checks = true` (`Cargo.toml`). The same 12 vectors pass in cargo and vitest, and Q-01..Q-04 compare each on-chain record with `computePrice` at `paid_at`. |
| `cancel_lease` | OK. Landlord only, `Created && !deposit_held` only. Dust goes to the landlord, the vault closes (rent to the landlord), the `Lease` is kept as `Cancelled`, and a re-create fails (X-06). The `Lease` rent (0.00355 SOL) is not recovered, by design. |
| Reinit / `init_if_needed` | None. `Lease`, vault and `PaymentRecord` use plain `init` (C-12, P-02, X-04). |
| Duplicate mutable accounts | No exploitable pair. `tenant != landlord != agency` is enforced at create, so the tenant and landlord token accounts differ by owner. The vault's owner is the PDA. Tested in P-09 and R-14. `voter == landlord` is fine (one is a signer, the other a lamports destination). |
| `remaining_accounts` | Never read. D-06 passes the Solana Pay reference there. |
| Events and PII | OK. Only pubkeys, integers, bools, `[u8; 8]` and `[u8; 32]` (H-01 on the IDL, H-02 on 172 decoded events). No `String` or `Vec` anywhere. No Memo CPI. |
| `Anchor.toml` and placeholder id | OK (see Evidence). Note NB-5. |
| IDL committed | OK, identical to the CI build. |
| Mint fixture on the local validator | OK, and harmless on devnet (see Evidence). |
| Tests assert the reason, not just "throws" | **Mostly yes.** See NB-3. |

## Blocking issues

### B1. One party alone can block the 2-of-3 release indefinitely, and the landlord can make the tenant pay late

**Where**
- `programs/rental_escrow/src/lib.rs:534-545`: `VoteRelease.tenant_token` and `landlord_token` use `associated_token::authority = lease.tenant / lease.landlord`.
- `lib.rs:546-548`: `landlord: SystemAccount<'info>`, the destination of the vault rent.
- `lib.rs:496-501`: `PayRent.landlord_token` uses `associated_token::authority = lease.landlord`.

**Root cause**
- Classic SPL Token (the only token program the program accepts) has **no immutable owner**. When the ATA program creates an ATA, it calls `InitializeImmutableOwner`. On Tokenkeg that call is a no-op ("Please upgrade to SPL Token 2022 for immutable owner support"). So the wallet that owns an ATA can run `SetAuthority(AccountOwner)` on it at any time.
- Anchor's `associated_token::authority = X` checks two things: that the address is the derived ATA, and that `token_account.owner == X` (`ConstraintTokenOwner`).
- After the owner is changed, the address still holds an initialized account. The idempotent create that R-17 relies on is therefore a no-op, and nobody can make that ATA pass again except the new owner.
- Every `vote_release` deserializes both recipient accounts. So even a **non-matching** vote fails at account validation, before the handler runs.

**Scenario 1: the tenant holds the deposit hostage (the most likely one)**
1. Deposit 1 000 USDC. The landlord and the agency agree to keep 300 USDC for damages.
2. Before (or after) the first of their votes, the tenant runs `spl-token authorize <tenant ATA> owner <tenant's second key>`.
3. Every `vote_release` by anyone now fails with `ConstraintTokenOwner` on `tenant_token`.
4. The 1 000 USDC and the vault rent stay locked until the tenant changes the owner back. The tenant can use this to demand a full refund.
5. The landlord can do the same thing to block a tenant + agency refund.

**Scenario 2: the landlord blocks payouts by reassigning its wallet (lower likelihood)**
- The landlord signs `SystemProgram.assign` on its own wallet (empty data), handing it to a program it controls.
- `landlord: SystemAccount` then fails with `AccountOwnedByWrongProgram`, so the release is blocked.
- The landlord can undo this whenever it likes.

**Scenario 3: the landlord turns an on-time payment into a late one and profits**
1. Shortly before `due(m)`, the landlord changes its ATA's owner. The tenant's `pay_rent` fails with `ConstraintTokenOwner`.
2. After `due(m)`, the landlord changes the owner back.
3. The tenant now pays 323 333 333 instead of 316 666 666 (Q-02 vs Q-04), and `on_time_streak` resets to 0.
4. The counterparty now decides the on-time outcome, which the "Clock only, never the client" rule exists to prevent.

**Why this blocks**
- `docs/onchain.md:65` claims "one party re-voting in a loop cannot block the other two" (R-11). B1 is the same liveness failure, reached through accounts instead of votes.
- The fix is far cheaper before the deploy than after it (after the deploy it means an upgrade).
- Disclosure: I recommended `associated_token::` myself in qa objection 5 (so that a closed ATA can be recreated) and missed the owner change. This is my error, not sol-program's.

**Fix (owner: solana-program-engineer)**
- `VoteRelease`:
  - `tenant_token`: `#[account(mut, token::mint = mint, token::authority = lease.tenant)]`
  - `landlord_token`: `#[account(mut, token::mint = mint, token::authority = lease.landlord)]`

  With this, any token account the party owns is accepted. Anyone can create a fresh classic token account owned by any pubkey without that pubkey's signature. Classic `InitializeAccount` gives the creator no delegate and no close authority, so the funds still reach only the party.
- `PayRent.landlord_token`: the same change. The tenant can then always pay into a fresh account owned by the landlord.
- `VoteRelease.landlord`:

  ```rust
  /// CHECK: lamports destination only; pinned to lease.landlord.
  #[account(mut, address = lease.landlord)]
  pub landlord: UncheckedAccount<'info>,
  ```

  Crediting lamports to an account owned by another program is allowed. Update X-04 (`tests/anchor/rental_escrow.ts:1144`) so that it allows exactly this one field and asserts that it has `address = lease.landlord`. Alternatively keep `has_one = landlord` and drop `SystemAccount`.
- `CancelLease.landlord_token`: here the landlord can only hurt itself. Changing it too is optional, for consistency.
- New tests (blocking for the re-review):
  - **R-21:** the tenant changes its ATA's owner (`setAuthority … AccountOwner`). Landlord + agency then release by passing a fresh token account owned by the tenant (`createAccount`). Mirror case: the landlord changes its owner.
  - **R-22:** the landlord's wallet is reassigned to another program (`SystemProgram.assign`). The release still succeeds and the vault rent reaches it.
  - **P-13:** the landlord changes its ATA's owner. The tenant pays on time into a fresh account owned by the landlord, with `on_time = true`.
  - R-13 and R-14 must still fail with `ConstraintTokenOwner`.
- Doc and client hand-off:
  - `docs/onchain.md:54`: "ATA by default; if it fails with `ConstraintTokenOwner`, create a fresh token account for that party in the same transaction".
  - Update the R-17 note.

**Not reproduced on a validator** (there is no local toolchain). This is reasoned from the classic SPL Token `SetAuthority` semantics and Anchor's `associated_token` constraint code. Run R-21 against the current code first: it should fail there, which proves the bug, and pass after the fix.

## Non-blocking issues

1. **Objection 10 (landlord + agency can release early): I partly agree with sol-program's rebuttal.**
   - The rebuttal is right on one point: requiring the tenant's vote or a full term would lock the deposit forever when a tenant abandons the unit.
   - But it is not a choice between only those two options. Abandonment is visible on chain, because the tenant stops paying. A gate such as `tenant voted for these terms || months_paid == term_months || now > due(months_paid) + GRACE` keeps an abandoned lease releasable by landlord + agency after the grace period, while blocking them as long as the tenant is current.
   - Scenario with today's code:
     1. The tenant has paid months 0-3 on time. Month 4 is due in 10 days.
     2. Landlord + agency vote `(0, deposit)`. The vault pays the landlord and the lease becomes `Closed`.
     3. The tenant's `pay_rent(4)` now fails with `LeaseNotActive`.
     4. The chain shows a closed lease with 4 on-time payments, no default, and the deposit gone.
   - In this demo both of those keys belong to the platform, so this adds no risk beyond the custody disclosure. I accept it for the merge. Recommendation: add the gate before any non-custodial use. Until then, the README should say "landlord + agency can release the deposit at any time, which also ends the lease".
2. **Stale votes never expire and cannot be withdrawn.**
   - A vote cast during an early dispute can be matched months later.
   - A party can withdraw only by voting different terms. The client should show the other slots before signing and offer a "withdraw" that votes a split nobody else holds.
   - A `clear_vote` instruction would be cleaner (post-hackathon).
3. **Test assertions (`tests/anchor/rental_escrow.ts:248`, `expectFail`).**
   - Good: every negative test asserts an error **name** (or the system program's `already in use`) by substring over the error plus the logs, not just "throws".
   - Weaknesses:
     - About 12 assertions accept 2-3 alternatives: C-08/C-10, D-03, P-08/P-09/P-10, R-09, R-13, R-14, X-03, X-05. Most are fine. R-09 can only produce `AccountNotInitialized` (the vault is already closed), so its `LeaseNotActive` alternative is dead. Pin each case to the one name it actually hits.
     - Several failure tests do not check that state is "unchanged", although `qa-tests.md` asks for it: C-01..C-07, D-01, D-03 (checks only `depositHeld`), D-04, P-03, P-04, P-06, P-07, R-02, R-06. Low risk: a failed transaction is atomic anyway.
     - Substring matching could in theory match a name in an unrelated log line. Matching `Error Code: <Name>.` would be stricter.
4. **README is stale once this merges** (owner: submission-writer).
   - `README.md:7,18,99,154` say the program is "not built yet" and name a `release_deposit` instruction. The instruction is now `vote_release`.
   - After the merge, the README should say: built and tested in CI, **not deployed**, app still `ESCROW_MODE=custodial`.
   - The verbatim custody sentence from `docs/onchain.md:120` goes into Security considerations.
   - This must happen before the freeze; that it is still custodial today remains true.
5. **Deploy steps vs `anchor build`.**
   - CI log: `Program ID mismatch detected … Keypair file has: CWDL9Ck… Source code has: BJiwpRFD…`. `anchor build` auto-generates `target/deploy/rental_escrow-keypair.json`.
   - `docs/onchain.md:174` (`solana-keygen new -o target/deploy/rental_escrow-keypair.json`) then fails without `--force`. Either use `--force` or keep the generated keypair, then run `anchor keys sync`.
   - Also: the client should refuse program mode while `PROGRAM_ID` equals the placeholder `BJiwpRFD…`. Whoever holds its private key (the doc says nobody) could otherwise deploy anything there on devnet.
6. **The period rule is still split.** `lib/agents/lease.ts` `addMonthsTs` uses calendar months; the program uses `period_seconds`. This must be fixed before program mode goes live (hand-off to ai-agents is already listed). It does not block this merge, because the app does not call the program yet.
7. **Orphan leases cost SOL.** Each `create_lease` leaves 0.00355 SOL locked in `Lease` forever, even after cancel. If program mode creates leases on a public QR scan, the route needs a rate limit and the balance floor from `docs/onchain.md:144` (sol-client).
8. **Upgrade authority.** It can replace the code and drain every vault. This is disclosed. Add it to README › Security considerations together with item 4.

## Untested or not verified

- B1 scenarios: the ATA owner change, the landlord `assign`, and the landlord-forced late payment.
- X-01 for `cancel_lease` with a fake token program (`qa-tests.md` lists it as TODO; same `Program<Token>` type, low risk).
- X-03 with a byte-identical `Lease` owned by another program (needs a fixture).
- Deposit or vote on a `Cancelled` lease. It is blocked twice (status check, and the closed vault fails deserialization) but not asserted.
- The exact boundary `now == due` on a validator. It is covered only by the pure-math vectors, since `--validator legacy` cannot warp the clock. Q-07 covers the on-time → late transition with real waiting.
- H-04 (salted hashes), and S-01..S-09 (client builders and routes do not exist yet).
- No local reproduction of anything. All runtime evidence comes from CI run 37181040706.

## What the owner must do for GO

1. Apply the B1 fix and add R-21, R-22 and P-13. Push and get CI green.
2. Pin R-09 to `AccountNotInitialized` (optional, 1 line).
3. Ping qa for a re-review. Only B1 is in scope; the re-review diff should be small.
