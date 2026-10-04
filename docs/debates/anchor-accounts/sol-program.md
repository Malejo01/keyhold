# Debate A · Proposal from sol-program (solana-program-engineer)

Assumes the toolchain is **CI only**: the `anchor-build` job (Agave 4.1.2, Anchor 1.2.0, Rust 1.93.0, `anchor test --validator legacy`). There is no local Solana or Anchor, and deploying is a separate step (see Decisions). `Anchor.toml [scripts] test` uses `pnpm exec ts-mocha`, not yarn.

## Accounts and PDA seeds

| Account | Seeds | Fields beyond spec §5.2 | Rent paid by / closed at `Closed` |
|---|---|---|---|
| `Lease` | `["lease", landlord, tenant, lease_id]` | `agency: Pubkey`, `lease_id: String` (max 32 bytes; the same `ls_<16hex>` id the memo uses, 19 bytes today), `term_months: u16`, `vault_bump: u8`, `pending: Option<ReleaseProposal>`, `proposal_nonce: u32` | landlord / **kept** (it holds the hashes and is the tenant's history) |
| vault (SPL token account) | `["vault", lease]`, mint = `lease.mint`, authority = `Lease` PDA | none | landlord, created in `create_lease` / **closed**, lamports go back to `lease.landlord` |
| `PaymentRecord` | `["payment", lease, month_index.to_le_bytes()]` (u16 LE, pinned so the client derives the same address) | none (spec fields) | `payer` (can be the tenant or a server fee payer) / **kept** (history) |

`ReleaseProposal { proposer_role: u8, approvals: u8 /* bitmask: tenant=1, landlord=2, agency=4 */, to_tenant: u64, to_landlord: u64, reason_hash: [u8;32], exit_report_hash: [u8;32] }`. It is stored inline in `Lease`, so there is no extra account, no extra rent and no account to close.

**Agency is stored in data and not in the seeds.** `landlord` is in the seeds and must sign, so nobody else can squat a lease address. The client derives the lease address from the `leaseId` it already has, plus the two wallets. Putting `agency` in the seeds adds nothing and makes every lookup need a third key.

## Instructions

| Ix | Signers | Checks (errors) | Effect |
|---|---|---|---|
| `create_lease(params)` | **landlord** (payer) **+ agency** | tenant, landlord and agency are 3 distinct keys (`InvalidParties`); `lease_id` is 1..=32 bytes; rent > 0, deposit > 0, `period_seconds` > 0, `term_months` ≥ 1 (`InvalidParams`); `usdc_bps + ontime_bps <= 10_000` (`InvalidBps`); `mint.decimals == 6` (`InvalidMint`) | init `Lease` (`Created`) and the vault |
| `deposit_escrow()` | tenant | `has_one = tenant, mint`; `status == Created && !deposit_held` (`LeaseNotCreated`); tenant token account mint and authority | `transfer_checked` of `deposit_amount` to the vault; `deposit_held = true`; `Active` |
| `pay_rent(month_index)` | tenant (token authority) + `payer` (may be the same key) | `Active` (`LeaseNotActive`); `month_index == months_paid` (`MonthOutOfOrder`); `< term_months` (`MonthOutOfRange`); the `PaymentRecord` init fails if that month was already paid; `landlord_token.owner == lease.landlord` | see the math below; `transfer_checked` tenant to landlord; record; `months_paid += 1`; streak `+1` or reset to 0 |
| `propose_release(to_tenant, to_landlord, reason_hash, exit_report_hash)` | one of tenant, landlord or agency (`NotAParty`) | `Active && deposit_held` (`LeaseNotActive`); `to_tenant.checked_add(to_landlord)` (`MathOverflow`) `== deposit_amount` (`SplitMismatch`) | `proposal_nonce += 1`; `pending` set with `approvals = proposer bit`. A new proposal **replaces** the old one and resets its approvals |
| `approve_release(nonce, to_tenant, to_landlord)` | one party whose bit is not yet in `approvals` (`NotAParty`, `AlreadyApproved`) | `pending` is present (`NoPendingProposal`); nonce and split equal the pending ones (`ProposalMismatch`); `Active` | the second distinct party triggers the payout: vault to `tenant_token` and vault to `landlord_token` (skipped when 0; both constrained to `lease.tenant` and `lease.landlord` + mint), close the vault, write `exit_report_hash`, `deposit_held = false`, `Closed`, clear `pending` |

**Discount and on-time math** (mirrors `lib/rules/pricing.ts` with `method = 'usdc'`, because the program only accepts the token):
`due = due_day_ts.checked_add((month_index as i64).checked_mul(period_seconds)?)?`; `on_time = Clock::get()?.unix_timestamp <= due`; `bps = usdc_bps + (on_time ? ontime_bps : 0)` (capped at 10 000 by the `create_lease` check, so the `min` in pricing.ts never triggers); `amount = u64::try_from((rent as u128) * ((10_000 - bps) as u128) / 10_000)?`. Floor division, the same as the TS code.

**Why propose + approve rather than a single co-signed tx:**
- AD-10b leaves us with Phantom over a Solana Pay QR. A transaction request lets one wallet sign and send; two humans co-signing one tx before the blockhash expires (~60–90 s) is not a demoable flow.
- The pair works asynchronously, one ordinary single-signer tx per party.
- It still **subsumes** the co-sign case: `propose` + `approve` signed by two parties in **one** tx is atomic.
- The atomic form also closes the griefing hole where a third party keeps replacing the proposal.
- Binding `nonce` + split in `approve` stops a proposer from swapping the terms under a pending approval.
- Cost over a single `release_deposit`: one extra instruction and about 3 extra tests.

**Agency receives nothing.** Fees are out of scope, and splitting three ways would widen the sum check for no demo value.

**Events** (pubkeys, amounts, timestamps and hashes only): `LeaseCreated`, `DepositHeld`, `RentPaid{month_index, amount, discount_bps, on_time, paid_at}`, `ReleaseProposed{nonce, proposer_role, to_tenant, to_landlord, reason_hash}`, `DepositReleased{nonce, approver_role, to_tenant, to_landlord}`. Program mode can still add the `lease:v1:` memo next to the instruction (sol-client's call), so `readMemoHash` keeps working.

**Errors:** `InvalidParties, InvalidParams, InvalidBps, InvalidMint, LeaseNotCreated, LeaseNotActive, MonthOutOfOrder, MonthOutOfRange, MathOverflow, SplitMismatch, NotAParty, AlreadyApproved, NoPendingProposal, ProposalMismatch`.

## Mandatory tests (`anchor test --validator legacy`, ts-mocha)

No clock warp is needed: on-time tests set `due_day_ts = now + 3600`, late tests set `now - 3600`.

1. **Discount math, 4 cases**, rent 333_333_333 (odd, checks the floor): none (late, 0 bps USDC) / USDC only (late, 300) / on-time only (0 + 200) / both (300 + 200 = 95%). Each is asserted against `computePrice()` from `lib/rules/pricing.ts` (read-only import), so TS and Rust cannot drift.
2. **Double `pay_rent`** for month 0: rejected, balances unchanged. Out-of-order month and `month >= term` are also rejected.
3. **Split not summing:** sums below and above the deposit both fail with `SplitMismatch`.
4. **Overflow:** `to_tenant = u64::MAX, to_landlord = deposit + 1` wraps to exactly `deposit`, so it must fail with `MathOverflow` and not pass. A `due_ts` overflow (`due_day_ts = i64::MAX - 10`, month 1) fails with `MathOverflow`.
5. **One signer:** after `propose` alone the funds stay in the vault. The proposer approving its own proposal fails (`AlreadyApproved`).
6. **Foreign signer:** propose and approve from a non-party fail (`NotAParty`). An approve that passes an attacker's token account as `tenant_token` fails on the constraint.
7. **2-of-3 happy paths:** tenant+landlord, landlord+agency, tenant+agency (and the atomic one-tx variant). **3-of-3:** a third approve after `Closed` fails, so there is no double payout.
8. **Stale approval:** the proposal was replaced, so an approve with the old nonce fails (`ProposalMismatch`).
9. **Release before deposit** (`Created`): fails. **Pay after `Closed`:** fails (`LeaseNotActive`).
10. **`create_lease` guards:** non-distinct parties, bps sum > 10 000, `period_seconds <= 0`, wrong decimals, missing agency signature. **Deposit guards:** a second deposit or a non-tenant signer.
11. **After release:** the vault is closed with its rent back to the landlord; `Lease` and the `PaymentRecord`s still exist with `Closed` and `exit_report_hash` set.

## Cost (CI-only toolchain)

| Work | Agent-h |
|---|---|
| `create_lease` + `deposit_escrow` + tests (F2) | 3.5 |
| `pay_rent` + `PaymentRecord` (F3) | 2 |
| propose/approve (F3) | 2.5 |
| remaining tests | 2 |
| CI round-trips (~10–20 min each, slow feedback is the main risk) | 1.5 |
| IDL hand-off, `docs/onchain.md`, CHANGELOG | 0.5 |
| **Total** | **≈12** (PLAN budget: 4 + 8) |

**Mauro ≈ 2.5 h:** approve this table (0.5), review the code and tests (1.5), devnet deploy (0.5–1, see Decisions).

## Defers and known limits

Deferred:
- AD-13 deposit reduction from `on_time_streak`.
- Agency fees.
- `cancel_lease` for a lease that is never deposited: rent stays locked in `Created`. Cheap, so it goes in if time allows.
- Late fees, renewals, Token-2022, closing `PaymentRecord`s.

Known limits for `docs/onchain.md`:
- The program **upgrade authority** can change the code and drain vaults. Devnet only; we say so.
- The mint is chosen by the landlord at create. The client must check `mint == TUSDC_MINT`.
- Anchor 1.x TS package name and `anchor test` scripts: **[VERIFY]** before coding.

## Decisions for Mauro

1. **Who holds the keys in the demo?**
   - (a) The server holds both the landlord and agency demo keys. Then the server alone meets 2-of-3, which is custodial in substance, and AD-03 honesty requires us to say so.
   - (b) The landlord or agency signs from a second Phantom wallet. Real 2-of-3, about 10 more minutes of demo setup. **I recommend (b) for the video and (a) only for automated e2e.**
2. **How to deploy** (CI cannot deploy without a key):
   - (a) WSL on Mauro's machine, about 1 h once.
   - (b) Solana Playground with Mauro at the browser.
   - (c) A `workflow_dispatch` job with a devnet-only deployer key in Actions secrets, never in git.

## Objections from sol-client

1. **A lease that cannot be created before the tenant wallet is known (seeds).** `Lease` seeds contain `tenant`, but `/api/lease` creates the `LeaseDraft` (and the QR URL) when only a persona exists; the Phantom pubkey appears on the transaction-request POST. A `create_lease` built earlier would derive the wrong address, and `deposit_escrow` (`has_one = tenant`) would fail for the real wallet. **Ask:** seeds `["lease", landlord, lease_id]`, with `tenant` stored in data and set from the signer at create. The client then derives the address from `leaseId` alone at draft time, the same id the memo uses. That also fixes lookup by `leaseId` (Verify, agency panel, history): with tenant in the seeds the only way is `getProgramAccounts` + memcmp, which the public devnet RPC rate-limits. If the seeds stay, the client must put `create_lease + deposit_escrow` in one tx, and that must stay legal (landlord and agency signatures already on it).
2. **Orphan `Created` leases lock landlord SOL.** The two-step flow plus `cancel_lease` deferred means every abandoned QR (scan declined, wallet closed) leaves a `Lease` (~0.0037 SOL) and a vault (~0.0020 SOL) that nobody can reclaim. On a public "Try the demo" URL (per-instance rate limit, phase-0 issue 5) that is a drain of the landlord key until program mode dies mid-demo. **Ask:** either guarantee the one-tx create+deposit (my plan, then no orphans) or move `cancel_lease` from "if time allows" to required.
3. **Quoted amount differs from the charged amount (no slippage bound).** The card shows `computePrice` at server time; the program recomputes with `Clock` when the tx lands. A tx confirmed one second after `due` debits 2% more than the tenant approved, with no way to refuse. **Ask:** `pay_rent(month_index, max_amount)` failing with `AmountAboveMax`. The client sends the quote; a stale quote fails instead of overcharging.
4. **Due-date rule drift between TS and Rust.** `lib/agents/lease.ts` `addMonthsTs` uses **calendar** months (`setUTCMonth`); the program uses `due_day_ts + month_index * period_seconds`. From month 2 (e.g. 5 Oct to 5 Dec is 61 days, not 60) the two disagree about `on_time` and the amount. Test 1 only compares month 0, so CI would pass while the UI quote and the chain differ. **Ask:** add to test 1 a month index >= 2 case; the TS side moves to fixed `period_seconds` (30 days) as a hand-off to ai-agents-engineer (`lease.ts`, `orchestrator.ts`). Without it, "discount from confirmed time, never from the client" holds but the quote shown is wrong.
5. **`PaymentIntent` cannot build `create_lease`.** It has one `listAmountBaseUnits` (deposit for `deposit`, rent for `rent`), no `months`, no rent+deposit pair. Nothing in the table says where `term_months` and `period_seconds` come from. Not a program change, but `create_lease` params must be exactly `LeaseDraft` fields (`rentBaseUnits`, `depositBaseUnits`, `dueTs`, `months`, both bps, `contractHash`), plus `period_seconds` (a constant, 2 592 000) and `entry_report_hash`. **Ask:** list `contract_hash` and `entry_report_hash` explicitly in params and in `LeaseCreated`; the table omits them and `/api/verify` needs the contract hash on chain.
6. **Demo cannot produce a real 2-of-3 with one wallet (Decision 1).** AD-04 and the video claim 2-of-3, but the demo personas are server keys and the only human wallet is one Phantom. With option (a) the server holds landlord and agency, so tenant (Phantom) + any server key is "2-of-3" while the server alone also satisfies it: custodial in substance, which AD-03 says we must disclose. Option (b) needs a second Phantom on another device or browser profile, a second QR per role, and the POST handler resolving `account` to a role. I back (b) for the video, but the plan must book the second wallet and its devnet SOL (fee payer for the approve) as Mauro prep, otherwise the approve QR fails with "insufficient funds for fee" on camera.
7. **Replayed session must read chain state, not the blob.** The program makes double `pay_rent` impossible only if `month_index` comes from `Lease.months_paid`. The current `/api/pay` derives it from `state.payments` (client-held, replayable, phase-0 issue 1). If program mode reused that path, a stale blob would pick a month already paid: the tx fails on PDA init, the user sees a 502 and no receipt for money that did move. The client fix is mine (read the Lease), but it means the program tests must also cover `pay_rent` with `month_index != months_paid` returning `MonthOutOfOrder` (listed in test 2, keep it blocking).
8. **Rent-exempt cost is invisible in the budget.** The 12 h estimate has no SOL line. Per demo lease ~0.0073 SOL, full 12-month ~0.024 SOL, all `Lease` and `PaymentRecord` rent permanent by design. With the devnet faucet rate limit, `docs/onchain.md` must carry a funding rule (landlord and platform keys topped up before the recording, a balance floor that triggers the custodial fallback).

## Objections from qa

Severity: **B** = blocking (the implementation does not pass the gate until fixed), **NB** = non-blocking (fix or disclose). Every item has a negative test in `qa-tests.md` (id in brackets).

1. **B · Dust donation bricks every release [R-15].** The vault is a plain SPL token account, and transferring into it is permissionless. An attacker sends 1 base unit to `["vault", lease]`. `approve_release` pays out exactly `to_tenant + to_landlord == deposit_amount`, leaves 1 unit, and the `CloseAccount` CPI fails ("non-native account can only be closed if its balance is zero"). The whole approve reverts, and there is no other exit instruction, so the deposit is locked forever. Cost to the attacker: one transfer. **Fix:** after the split, sweep `vault.amount - deposit_amount` to the landlord (or the tenant; pick one and document it), then close. Alternatively, don't close the vault.
2. **B · Proposal replacement is a liveness DoS [R-10, R-11].** Any single party can call `propose_release` after each honest proposal. That resets `approvals` and bumps the nonce, so every async `approve` lands on a stale nonce (`ProposalMismatch`). Example: a tenant disputing a deduction blocks landlord + agency forever, at 5 000 lamports a slot. The atomic one-tx form avoids this, but it needs exactly the co-signing UX this proposal rejects for Phantom. **Fix (same cost, one instruction fewer):** per-role vote slots `votes: [Option<[u8;32]>; 3]` in `Lease`. Each slot holds `terms_hash = sha256(to_tenant || to_landlord || reason_hash || exit_report_hash)`. `vote_release(terms)` lets the signer overwrite **only its own slot**. Payout fires when two slots are equal, and the voter that completes the pair passes the full terms that hash to it. That gives no replacement, no nonce and no stale approve, and the third party cannot erase the other two. If the pair is kept, only the current proposer may replace its own proposal.
3. **B · Mint and token-program substitution [C-08..C-10, X-01].** The only mint check is `decimals == 6`, and the landlord picks the mint.
   - (a) A Token-2022 mint with `PermanentDelegate` lets the mint owner drain the vault at will.
   - (b) With `TransferFee`, the vault receives less than `deposit_amount`, so a release whose split sums to `deposit_amount` always fails (locked).
   - (c) A mint with a freeze authority can freeze the vault.
   - (d) If `token_program` is typed as `Interface<TokenInterface>` or `AccountInfo`, a fake program "succeeds" every transfer.

   **Fix:**
   - `token_program: Program<'info, Token>` (classic SPL only).
   - `mint` pinned with `address = TUSDC_MINT` (program constant for devnet) or a `Config` PDA set by the upgrade authority.
   - Require `mint.freeze_authority.is_none()`. Today's devnet mint already has none (`scripts/setup-devnet.ts`, `createMint(..., null, 6)`).

   The "client must check the mint" limit then goes away. A Phantom user never runs our client checks.
4. **B · `lease_id: String` is a free-text PII channel on chain (AD-12) [C-11].** It accepts up to 32 bytes of any UTF-8 (a DNI, a surname), stored permanently in account data **and** the seeds. The memo regex in `buildMemo` does not cover account data. **Fix:** `lease_id: [u8; 8]`, the raw random bytes of `ls_<16hex>`, which the client hex-encodes. Or enforce `^ls_[0-9a-f]{16}$` in `create_lease` (`InvalidParams`). Either way the program id format is identical to the memo `ID_RE`, so `buildMemo` never throws for a program lease.
5. **B · Account constraints the table does not state.** Each is a known Anchor exploit class. They must be written in the account structs, and the gate reviewer will check them line by line:
   - **`pay_rent` [P-07..P-11]:**
     - `lease` with `has_one = tenant`, and `tenant: Signer`. The table lists tenant only as "token authority".
     - `tenant_token`: `token::authority = lease.tenant`, `token::mint = lease.mint`.
     - `landlord_token`: `associated_token::authority = lease.landlord, associated_token::mint = lease.mint`.
     - `mint`: `address = lease.mint`.
     - `PaymentRecord`: plain `init` (never `init_if_needed`), seeds include `lease.key()`. `record.tenant = lease.tenant`, not `payer`.
   - **`deposit_escrow` and the payout [D-03, R-18]:** the vault has `seeds = ["vault", lease.key()], bump = lease.vault_bump, token::authority = lease`.
     - Without this, the tenant deposits into its own token account and gets `deposit_held = true` with nothing escrowed.
     - Or an approver on lease A passes lease B's vault.
   - **Payout [R-16, R-17]:**
     - The vault-close rent destination needs `address = lease.landlord`. Otherwise the approver (tenant or agency) redirects about 0.002 SOL to itself.
     - `tenant_token` and `landlord_token` use `associated_token::` constraints. Then any party can recreate a closed ATA idempotently in the same tx. Otherwise a party whose share is > 0 closes its ATA and blocks the release.
   - **All CPIs and accounts [X-01..X-04]:**
     - `Program<'info, Token | System | AssociatedToken>`.
     - No `UncheckedAccount` / `AccountInfo`, except the Solana Pay `reference` in `remaining_accounts`, which is never read.
   - **Roles [R-07]:** the role in propose/approve is resolved by comparing `signer.key()` to `lease.tenant/landlord/agency`. It must never come from an instruction argument.
6. **B · bps sum can wrap at create [C-05].** If `usdc_bps + ontime_bps` is computed in `u16` without overflow checks, `65_535 + 1` wraps to `0` and passes `<= 10_000`. Then `10_000 - bps` underflows in `pay_rent`. **Fix:**
   - Sum in `u32` with `checked_add`, and check each value `<= 10_000`.
   - `Cargo.toml` `[profile.release] overflow-checks = true` must be present (CI asserts it).
   - Also require `due_day_ts > 0`.
7. **B · Custodial in substance (Decision 1).**
   - Under (a) the server holds landlord + agency. It alone can sign `to_landlord = deposit` and close.
   - Under (b) both wallets are still team-controlled in the demo.
   - The upgrade authority can replace the code, and the platform is the test token's mint authority.
   - Even with real keys, the agency is chosen and paid by the landlord, so landlord + agency collusion takes the whole deposit. That is inherent in 2-of-3 with the agency as arbiter.

   AD-03 honesty requires this sentence in README › Security considerations and on the receipt, and one sentence of it in the video: *"Program mode: the deposit sits in a program-owned vault and release needs 2 of 3 signatures (tenant, landlord, agency). In this demo the platform operates the landlord and agency keys, so the platform alone can release the deposit: the rules are enforced by code, but custody is operational. The program upgrade authority is held by the team, devnet only."*
8. **NB · A 100% discount gives free on-time history [C-06].** `bps == 10_000` is allowed, so `amount = 0` and the `PaymentRecord` says `on_time = true` with nothing paid. A tenant with two sock-puppet wallets (landlord, agency) can mint a perfect history at zero cost, and AD-13 would reward it. **Fix:** require `usdc_bps + ontime_bps < 10_000` (or a cap such as 5 000) and `require!(amount > 0)`. Any reputation use must filter on an agency allowlist. README: "history is self-asserted until agencies are registered".
9. **NB · Clock and boundary testing [Q-05, Q-06].** `Clock` is a validator-voted timestamp. The client cannot set it, so "never from the client" holds. On-time is decided in the execution slot, which backs sol-client's `max_amount` (their objection 3). `--validator legacy` without a warp cannot test `now == due`. **Fix:** put the math in a pure `fn quote(rent, usdc_bps, ontime_bps, now, due) -> Result<(u64, u16, bool)>`, with `cargo test` vectors in a shared JSON file that a vitest test also runs through `computePrice`.
10. **NB · Early release ends the lease.** Landlord + agency can release at month 0, which sets `Closed`, and the tenant can no longer pay rent. Either require `months_paid == term_months || tenant voted`, or document it as intended.
11. **NB · `cancel_lease` must not close `Lease`.** If it is added (sol-client objection 2), closing `Lease` frees its seeds for a later `init` with different terms and `contract_hash` under the same `lease_id` (history and Verify confusion). **Fix:** close only the empty vault and set `status = Cancelled`.
12. **NB · Hashes of templated documents are guessable (AD-12) [H-04].** Most of the contract text is fixed template plus public data:
    - the persona name;
    - the property;
    - the dates;
    - the `leaseId`, which is on chain.

    So `sha256(contract)` confirms a guessed name by dictionary. The same applies to `reason_hash` ("deduction: broken window 50 USDC"). **Fix:** append a 32-byte random salt, kept off-chain, before hashing every document. This also applies to custodial mode today. Also say in the README that a tenant wallet's rent amounts and punctuality are public forever (allowed by AD-12, but users should know).

### qa on sol-client's objections

| # | Verdict | Note |
|---|---|---|
| 1 Seeds need the tenant before it is known | **Valid, and a security issue too** | With `tenant` in the seeds, the same `lease_id` can exist once per tenant wallet. An attacker who POSTs first creates a parallel lease with the same id, and memo and Verify become ambiguous. `["lease", landlord, lease_id]` makes `lease_id` unique per landlord. It is still squat-proof, because the landlord signs. The claim must still be bound (qa objection 1 on sol-client). |
| 2 Orphan `Created` leases drain the landlord | **Valid** | One-tx create+deposit removes it. If `cancel_lease` is added, see qa 11. |
| 3 No slippage bound | **Valid** | `pay_rent(month_index, max_amount)` → `AmountAboveMax`. That is consent, not convenience. |
| 4 Due-date drift TS vs Rust | **Valid** | Moving TS to fixed `period_seconds` also changes custodial mode; one hand-off. A vector at month ≥ 2 is mandatory [Q-04]. |
| 5 `contract_hash` / `entry_report_hash` missing in params | **Partly valid** | They are spec §5.2 fields, so they are implied, but they must be explicit in params and `LeaseCreated`. Verify in program mode must read `Lease.contract_hash` (qa objection 4 on sol-client). |
| 6 One wallet cannot show a real 2-of-3 | **Valid** | Disclosure text in qa 7. Book the second wallet and its SOL as Mauro prep. |
| 7 Replayed blob picks a paid month | **Valid, blocking** | `month_index` comes from `Lease.months_paid`. Tests P-02 and P-03 must stay blocking. |
| 8 Rent-exempt cost not budgeted | **Valid (ops), not security** | It becomes security together with 2: a public URL drains the landlord key. Add a balance floor and an alert. |

## Answers from sol-program

Evidence = code in `programs/rental_escrow/src/` and the test id in `tests/anchor/rental_escrow.ts` (each `it()` starts with its qa id). Status of every qa test: `qa-tests.md` › "Status".

### To sol-client

| # | Verdict | What changed (evidence) |
|---|---|---|
| 1 Seeds need the tenant before it is known | **Accept** | Seeds are now `["lease", landlord, lease_id]` with `lease_id: [u8; 8]` (the raw bytes of `ls_<16hex>`). `tenant` is a `create_lease` param stored in data; the tenant consents by signing `deposit_escrow`. The client derives the address from the server's landlord key and `leaseId` alone. A second lease with the same id cannot exist (C-12). The one-tx `[create_lease, deposit_escrow, memo]` stays legal (D-06). |
| 2 Orphan `Created` leases | **Accept both asks** | One-tx create+deposit works (D-06), and `cancel_lease` is built (landlord only, `Created` only): it sweeps any donated tokens, closes the vault (0.0020 SOL back) and keeps `Lease` as `Cancelled` (X-06). The `Lease` rent (~0.0036 SOL) is not recovered by design (qa 11). |
| 3 No slippage bound | **Accept** | `pay_rent(month_index, max_amount)`; above it fails with `AmountAboveMax` before any transfer (Q-08). |
| 4 Due-date drift TS vs Rust | **Accept** | The program rule stays fixed periods: `due = due_day_ts + month_index * period_seconds`. The drift starts at month 1, not 2: `addMonthsTs(5 Oct, 1)` is 31 days later, the program's is 30 (2 592 000 s). Vectors at month 2 run in `cargo test` and vitest (Q-04, Q-05). The TS change is a hand-off to ai-agents-engineer (`docs/onchain.md` › Hand-offs). |
| 5 `contract_hash` / `entry_report_hash` | **Accept** | Explicit in `CreateLeaseParams` and in `LeaseCreated` (C-13). Mapping: `rent_amount = rentBaseUnits`, `deposit_amount = depositBaseUnits`, `due_day_ts = dueTs`, `term_months = months`, both bps, `period_seconds = 2_592_000`. |
| 6 One wallet cannot show a real 2-of-3 | **Accept (disclosure)** | Nothing to change in the program. Disclosure text is in `docs/onchain.md` › Custody. The decision stays with Mauro. |
| 7 Replayed blob picks a paid month | **Accept** | `month_index != months_paid` → `MonthOutOfOrder` (P-03, blocking). A repeated month fails earlier, at the `PaymentRecord` `init` ("already in use", P-02), so the client should map both errors to "already paid". |
| 8 Rent cost not budgeted | **Accept** | Real sizes are now known: `Lease` 382 B (0.00355 SOL), vault 165 B (0.00204 SOL, recovered at close), `PaymentRecord` 102 B (0.00160 SOL each). A demo lease with deposit + 1 rent is ≈ 0.0072 SOL; a 12-month lease is ≈ 0.0228 SOL kept. The funding rule is in `docs/onchain.md`. |

### To qa

| # | Verdict | What changed (evidence) |
|---|---|---|
| 1 Dust donation bricks release | **Accept** | Before closing, the payout reads `vault.amount`, pays the split and sends `vault.amount - deposit` to the landlord (`DepositReleased.excess_to_landlord`). `cancel_lease` does the same (R-15, X-06). Why the landlord: the tenant's share stays exactly what the parties voted, and donated tokens carry no claim. `vault.amount < deposit` → `VaultShortfall` (it cannot happen with the classic token program and no delegate). |
| 2 Proposal replacement is a liveness DoS | **Accept: vote slots replace propose/approve** | `vote_release(to_tenant, to_landlord, reason_hash, exit_report_hash)`. `Lease.votes: [[u8; 32]; 3]`, indexed by role. The signer can only overwrite its own slot with `sha256(to_tenant_le ‖ to_landlord_le ‖ reason_hash ‖ exit_report_hash)`. Payout fires when another slot holds the same hash. There is no nonce, no pending proposal and no stale approve, and one instruction fewer (R-05, R-10, R-11, R-12). The atomic two-vote tx still works (R-08). |
| 3 Mint and token-program substitution | **Accept** | `token_program: Program<'info, Token>` everywhere (X-01). At create: `address = PAYMENT_MINT` (program constant = the devnet tUSDC mint), `decimals == 6`, `freeze_authority.is_none()`, all → `InvalidMint` (C-08..C-10). A `Config` PDA was rejected: it adds an upgrade-authority check and an instruction for no demo value. A changed mint means a redeploy. The local validator preloads the pinned address from a fixture with a localnet-only authority (`Anchor.toml`, `tests/anchor/fixtures/`). |
| 4 `lease_id: String` is a PII channel | **Accept** | `lease_id: [u8; 8]`; no `String` or `Vec<u8>` exists in any account, event or type (C-11, H-01). |
| 5 Constraints not stated | **Accept, all in the structs** | `pay_rent`: `has_one = tenant`, `tenant: Signer`, `tenant_token` with `token::mint`/`token::authority = tenant`, `landlord_token` with `associated_token::authority = lease.landlord`, `has_one = mint`, `PaymentRecord` plain `init` with seeds on `lease.key()`, `record.tenant = lease.tenant` (P-06..P-11). Vault: `seeds = ["vault", lease], bump = lease.vault_bump, token::authority = lease` in deposit, release and cancel (D-03, R-18). Release: both token accounts are `associated_token::` (R-13, R-14, R-17); the close destination is `landlord` with `has_one = landlord` (`ConstraintHasOne`, same effect as `address`, R-16). No `UncheckedAccount`, `AccountInfo` field or `init_if_needed` (X-04). The role comes from `signer.key()` vs `lease.tenant/landlord/agency` (R-07). One deliberate difference: in deposit and pay the tenant's source account may be any token account it owns (not only its ATA). It is its own money and it signs. |
| 6 bps sum can wrap | **Accept** | Sum in `u32` with `checked_add`; each value ≤ 10 000; `due_day_ts > 0`; `[profile.release] overflow-checks = true` (C-04, C-05, C-07, X-04). Also new: `create_lease` checks that the due date of the **last** month fits in `i64`, so `pay_rent` can never overflow. P-12 therefore fails at create, not at pay; `cargo test` covers the pay-side function. |
| 7 Custodial in substance | **Accept** | Your sentence is in `docs/onchain.md` › Custody, verbatim. README and receipt copy are hand-offs (submission-writer, ui). |
| 8 100% discount gives free history | **Accept** | `usdc_bps + ontime_bps < 10_000` (`InvalidBps`, C-06) and `amount > 0` (`ZeroAmount`). "History is self-asserted until agencies are registered" is in `docs/onchain.md` › Known limits. |
| 9 Clock boundary untestable | **Accept** | Pure `math::quote` and `math::due_ts` with `cargo test` on `tests/anchor/vectors/pricing.json` (`now == due`, `±1`, month 2, `u64::MAX`), and the same file through `computePrice` in vitest (`tests/anchor/pricing-vectors.test.ts`). The integration suite also proves on time → late → on time with real waiting on the validator Clock (Q-07). |
| 10 Early release ends the lease | **Rebut (intended, documented)** | Requiring the tenant's vote or a full term locks the deposit forever when a tenant abandons the unit mid-lease. That is exactly the case the agency arbitrates. Landlord + agency collusion is already the stated limit of 2-of-3 (qa 7). R-20 asserts the behavior. |
| 11 `cancel_lease` must not close `Lease` | **Accept** | It stays as `Cancelled`; re-create with the same seeds fails (X-06). |
| 12 Guessable hashes | **Accept as a hand-off** | The program only stores 32-byte hashes and cannot see a salt. Salting `contract`/`report`/`reason` before hashing belongs to `lib/agents/lease.ts` and `lib/solana/hash.ts` (ai-agents, sol-client). H-04 stays open there. |

**Net effect on the design:** propose/approve, `pending`, `proposal_nonce` and the errors `AlreadyApproved`, `NoPendingProposal`, `ProposalMismatch` are gone. Added: `vote_release`, `cancel_lease`, `max_amount`, `votes`, the pinned mint, and the errors `AmountAboveMax`, `ZeroAmount`, `VaultShortfall`.
