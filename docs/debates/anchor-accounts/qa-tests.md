# Debate A · Mandatory test list for `rental_escrow` (qa)

The implementation passes the gate only when every **B** test below is green in CI (`anchor test --validator legacy`, ts-mocha, plus `cargo test` for the pure math). NB tests should pass; if one does not, the gate review lists it.

**Conventions**
- Each test name starts with its id (e.g. `it("R-15 dust donation ...")`), so the gate reviewer can map CI output to this list.
- "Unchanged" means that, after a failed tx, the test re-reads all token balances, `Lease` and the vault and finds them byte-identical.
- Error names are Anchor 1.x built-ins or the program's `ErrorCode`. **[VERIFY]** the exact built-in names and numeric codes against Anchor 1.2.0 before you write the assertions.
- Assert on the error **name**, not on log text.
- If a test is rejected by `web3.js` before it is sent (for example a missing signature), rebuild the instruction by hand with the account meta flags under test, so the **program** rejects it.

**Shared fixtures**
- Mint: 6 decimals, no freeze authority, classic SPL.
- Parties: three funded keypairs (tenant T, landlord L, agency A) and an outsider X with its own ATA and tokens.
- Rent 333_333_333, deposit 1_000_000_000, `period_seconds` 2_592_000, `term_months` 12, bps 300 / 200.
- Pass a second lease B (same T, other landlord L2) wherever the test does cross-lease substitution.

## Q · Pricing parity with `lib/rules/pricing.ts`

Every expected amount is computed by the test by calling `computePrice()` (read-only import), never hard-coded alone. The literals below are cross-checks.

| Id | Sev | Case | Expected |
|---|---|---|---|
| Q-01 | B | none: `usdc_bps = 0`, late (`due = now - 3600`) | paid 333_333_333, `discount_applied_bps = 0`, `on_time = false`, streak 0 |
| Q-02 | B | USDC only: 300 bps, late | paid 323_333_333, bps 300, `on_time = false` |
| Q-03 | B | on-time only: 0 + 200, `due = now + 3600` | paid 326_666_666, bps 200, `on_time = true`, streak 1 |
| Q-04 | B | both: 300 + 200, on time; then month 1 on time and **month 2** with `due = due_day_ts + 2 * period_seconds` | paid 316_666_666 each; streak 1, 2, 3. The TS quote for month 2 (lease.ts after the period fix) equals the program's due and amount. |
| Q-05 | B | `cargo test` on the pure `quote()`: `now == due` (on time), `due + 1` (late), `due - 1` | the same `(amount, bps, on_time)` as `computePrice` for each row of a shared `tests/vectors/pricing.json` that a vitest test also runs |
| Q-06 | B | `cargo test`: rent = `u64::MAX`, bps 500 | 17_524_406_870_024_074_034 (no panic, u128 intermediate), equal to `computePrice` |
| Q-07 | B | streak reset: on time, late, on time | streak 1, 0, 1 |
| Q-08 | NB | `pay_rent(month, max_amount)` with `max_amount` = quote − 1 | `AmountAboveMax`; unchanged |
| Q-09 | B | IDL check: `pay_rent` has no timestamp, amount-to-charge or bps argument (only `month_index`, plus optional `max_amount`) | static assertion on `target/idl/rental_escrow.json` |

## C · `create_lease`

| Id | Sev | Attack / case | Expected |
|---|---|---|---|
| C-01 | B | tenant == landlord, landlord == agency, tenant == agency (three cases) | `InvalidParties` |
| C-02 | B | missing agency signature (meta `is_signer = false`) | `AccountNotSigner` |
| C-03 | B | missing landlord signature; X signs as landlord for L's seeds | `AccountNotSigner` / `ConstraintSeeds` |
| C-04 | B | `usdc_bps + ontime_bps = 10_001` | `InvalidBps` |
| C-05 | B | `usdc_bps = 65_535, ontime_bps = 1` (u16 wrap to 0) | `InvalidBps` (not success, not a panic) |
| C-06 | NB | `usdc_bps + ontime_bps = 10_000` (100% discount) | `InvalidBps` if qa objection 8 is accepted; otherwise the test documents that `amount = 0` and the gate lists it |
| C-07 | B | `period_seconds = 0` and `-1`; `term_months = 0`; `rent = 0`; `deposit = 0`; `due_day_ts <= 0` | `InvalidParams` |
| C-08 | B | mint with 9 decimals | `InvalidMint` |
| C-09 | B | a 6-decimal mint that is not the pinned mint (or not in `Config`) | `InvalidMint` / `ConstraintAddress` |
| C-10 | B | 6-decimal mint **with a freeze authority**; and a Token-2022 mint passed with the Token-2022 program id | `InvalidMint` / `InvalidProgramId` |
| C-11 | B | `lease_id` = `"juan-perez-30123456"`, `""`, 33 bytes, non-hex | `InvalidParams` (or impossible by type with `[u8; 8]`; then the test asserts the IDL type) |
| C-12 | B | second `create_lease` with the same seeds (same landlord and `lease_id`, any tenant if the tenant is not in the seeds) | system program `already in use`; the original `Lease` is unchanged |
| C-13 | B | happy path: `Lease` fields equal the params, including `contract_hash`, `entry_report_hash` and `agency`; the vault's authority is the `Lease` PDA and its mint is pinned; `LeaseCreated` has the same hashes | success |

## D · `deposit_escrow`

| Id | Sev | Attack / case | Expected |
|---|---|---|---|
| D-01 | B | X signs as tenant | `ConstraintHasOne` (tenant) |
| D-02 | B | second deposit after success | `LeaseNotCreated`; unchanged |
| D-03 | B | vault substituted by T's own token account, and by lease B's vault | `ConstraintSeeds` / `ConstraintTokenOwner`; `deposit_held` stays false |
| D-04 | B | tenant token account with another mint | `ConstraintTokenMint` |
| D-05 | B | tenant balance below the deposit | token `insufficient funds`; the `Lease` stays `Created` |
| D-06 | B | one-tx `[create_lease, deposit_escrow, memo]` signed by T, L and A (+ payer) | success; serialized size < 1232 bytes with the reference and a 64-hex memo |

## P · `pay_rent`

| Id | Sev | Attack / case | Expected |
|---|---|---|---|
| P-01 | B | pay before the deposit (`Created`) | `LeaseNotActive` |
| P-02 | B | **double pay** month 0 | `already in use` (PaymentRecord `init`, evaluated before the handler); balances unchanged; `months_paid` unchanged |
| P-03 | B | month 2 when `months_paid = 1` (skip); month 0 again via a stale blob | `MonthOutOfOrder` / `already in use` |
| P-04 | B | `month_index = term_months` | `MonthOutOfRange` |
| P-05 | B | pay after `Closed` | `LeaseNotActive` |
| P-06 | B | X signs as tenant with X's tokens | `ConstraintHasOne` |
| P-07 | B | `tenant_token` owned by X (X co-signs as the authority) | `ConstraintTokenOwner` |
| P-08 | B | `landlord_token` = X's ATA | `ConstraintAssociated` / `ConstraintTokenOwner` [VERIFY name]; X's balance unchanged |
| P-09 | B | `landlord_token` = T's own ATA (pay itself; duplicate accounts) | constraint error; unchanged |
| P-10 | B | lease A with lease B's `PaymentRecord` PDA, or lease B's landlord ATA | `ConstraintSeeds` / owner constraint |
| P-11 | B | a payer other than the tenant pays the record rent | success; `record.tenant == lease.tenant` and `!= payer` |
| P-12 | B | `due_day_ts = i64::MAX - 10`, month 1 | `MathOverflow` (not a panic) |

## R · Release (2-of-3)

Ids are design-neutral. "vote" means `vote_release(terms)` (qa objection 2); "propose/approve" means sol-program's pair. Each test states both expectations where they differ.

| Id | Sev | Attack / case | Expected |
|---|---|---|---|
| R-01 | B | release while `Created` (before the deposit) | `LeaseNotActive` |
| R-02 | B | split sum = deposit − 1 and deposit + 1 | `SplitMismatch` |
| R-03 | B | `to_tenant = u64::MAX, to_landlord = deposit + 1` (wraps to the deposit) | `MathOverflow`, **not** success |
| R-04 | B | **one signer only:** T proposes or votes, nothing else | vault balance = deposit; `Active`; no transfer |
| R-05 | B | a proposer approves its own proposal / a voter votes twice the same terms | `AlreadyApproved` / no payout (the slot is overwritten with an identical value) |
| R-06 | B | **foreign signer:** X proposes, approves or votes | `NotAParty` |
| R-07 | B | the role passed as an argument (if any) differs from the signer's real role (T claims landlord) | role ignored or `NotAParty`; no payout |
| R-08 | B | 2-of-3 happy paths T+L, L+A, T+A, async (separate txs) and atomic (one tx) | the vault pays the exact split; vault closed; `Closed`; `exit_report_hash` set; `DepositReleased` emitted |
| R-09 | B | **3-of-3:** the third party approves or votes after the payout | `LeaseNotActive` / `NoPendingProposal`; no second payout |
| R-10 | B | **stale approval / replay:** the proposal is replaced, then an approve with the old nonce and split | `ProposalMismatch` (pair). Vote design: the old vote no longer matches; no payout |
| R-11 | B | **griefing:** after L proposes, T replaces it in a loop; then A approves L's terms | Pair: must not lock forever; only the proposer can replace its own proposal, so A's approve of L's terms pays out. Vote: L's and A's slots match, so the payout happens regardless of T |
| R-12 | B | approve with the same nonce but different `exit_report_hash` / `reason_hash` | `ProposalMismatch` (terms are bound by a hash) |
| R-13 | B | `tenant_token` = X's ATA in the payout | `ConstraintAssociated` / `ConstraintTokenOwner`; X's balance unchanged |
| R-14 | B | the vault itself passed as `tenant_token` or `landlord_token` | constraint error |
| R-15 | B | **dust donation:** X transfers 1 unit into the vault, then a 2-of-3 release | **success**; split paid; the excess is swept as documented; vault closed |
| R-16 | B | the rent destination of the vault close = the approver (T or A), not L | `ConstraintAddress` / `ConstraintHasOne`; SOL balances unchanged |
| R-17 | B | L closed its ATA before the release (`to_landlord > 0`); the tx prepends an idempotent ATA create | success |
| R-18 | B | lease A released with lease B's vault | `ConstraintSeeds` |
| R-19 | B | `to_tenant = 0` or `to_landlord = 0` | success; no zero transfer to a missing ATA; vault closed |
| R-20 | NB | release at month 0 by L+A without T | allowed and documented, or `ReleaseTooEarly` (qa objection 10) |

## X · Program-level substitution and lifecycle

| Id | Sev | Attack / case | Expected |
|---|---|---|---|
| X-01 | B | a fake `token_program` (any other executable id) in deposit, pay and release | `InvalidProgramId` |
| X-02 | B | a fake `system_program` / `associated_token_program` in create | `InvalidProgramId` |
| X-03 | B | a `Lease`-shaped account owned by another program; a `PaymentRecord` passed as `Lease` | `AccountOwnedByWrongProgram` / `AccountDiscriminatorMismatch` |
| X-04 | B | static: the IDL and source have no `UncheckedAccount`/`AccountInfo` in any accounts struct, no `init_if_needed`, and `overflow-checks = true` in `[profile.release]` | grep check in CI |
| X-05 | B | after `Closed`: the vault account is gone (`getAccountInfo == null`); its lamports went to L; `Lease` and `PaymentRecord`s still exist; every instruction on the lease fails | `LeaseNotActive` / `AccountNotInitialized` |
| X-06 | NB | `cancel_lease` (if built): the `Lease` stays with `Cancelled`; a re-create with the same seeds fails | `already in use` |

## H · Privacy (AD-12)

| Id | Sev | Check | Expected |
|---|---|---|---|
| H-01 | B | IDL types: no `String` / `Vec<u8>` fields in any account or event (with `lease_id` as `[u8; 8]`), or only `lease_id` with the C-11 format check | static assertion |
| H-02 | B | decode every event from the test run: fields are only pubkeys, ints, bools and `[u8; 32]` | pass |
| H-03 | B | every memo in the test run matches `^lease:v1:ls_[0-9a-f]{16}:(deposit\|rent:\d+):[0-9a-f]{64}$` | pass |
| H-04 | NB | the hashed contract text includes an off-chain random salt (two drafts with identical inputs give different hashes) | pass |

## S · Client and server integration (sol-client's builders and routes, run in CI or `tests/e2e`)

| Id | Sev | Attack / case | Expected |
|---|---|---|---|
| S-01 | B | two different wallets POST the same deposit transaction request | the first gets a tx; the second gets 409; one `Lease` on chain |
| S-02 | B | a POST without a valid claim token, or with a reused one | 403 |
| S-03 | B | the POST for `kind=propose\|approve` from the tenant: inspect the returned tx | no landlord or agency signature present; the split comes from `Lease` state, and query or body values are ignored |
| S-04 | B | a forged confirmation: a successful tx with the reference + program id + lease PDA but a different instruction | the server does **not** mark the payment as paid (it checks the state of the `PaymentRecord` / `deposit_held`) |
| S-05 | B | reference spam: an extra tx with the reference sent after the real payment | the real payment is still confirmed |
| S-06 | B | Verify with a forged memo tx (`lease:v1:<victimId>:deposit:<fakehash>` from X) | Verify reports no match (program mode reads `Lease.contract_hash`; custodial mode checks the leaseId, signer and transfer) |
| S-07 | B | a replayed pre-payment session blob on the rent route in program mode | `month_index` read from the chain; no second debit; a clear "already paid" response, not a 502 |
| S-08 | NB | tx size of the worst case (create + deposit + memo + reference, 4 signatures) | `< 1232` bytes |
| S-09 | B | the client bundle does not contain the Anchor coder, server keys or `lib/solana/program/*` server modules (`pnpm build` + grep `.next/static`) | pass |
