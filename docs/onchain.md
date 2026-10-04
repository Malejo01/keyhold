# On-chain: `rental_escrow` (Anchor program)

Owner: solana-program-engineer. Status: **implemented and tested in CI on a local validator; NOT deployed.** The app still runs `ESCROW_MODE=custodial` (AD-03). Devnet only, never mainnet.

Source: `programs/rental_escrow/src/lib.rs` (instructions, accounts, state, events, errors) and `programs/rental_escrow/src/math.rs` (pure pricing math). Tests: `tests/anchor/`. The design came out of the debate in `docs/debates/anchor-accounts/`; the summary is at the end of this file.

## Toolchain (pinned, verified 2026-10-04)

| Tool | Version | Source |
|---|---|---|
| Anchor CLI, `anchor-lang`, `anchor-spl` | **1.2.0** (released 2026-09-04) | `otter-sec/anchor` tag `v1.2.0` (`VERSION`, `CHANGELOG.md`); the repo moved from `coral-xyz` / `solana-foundation` |
| Anchor TS client | **`@anchor-lang/core` 1.2.0** (devDependency) | the 1.x package name; `@coral-xyz/anchor` is the old 0.x name |
| Solana CLI (Agave) | **4.1.2** | the CI `anchor-build` job; the version Anchor 1.2.0 tests against |
| Host Rust | **1.93.0** | CI; avm needs ≥ 1.91. Anchor's MSRV is 1.89, set as `rust-version` in `Cargo.toml` |
| `solana-sha256-hasher` | 3.1.0 | sha256 syscall on-chain, the `sha2` crate on the host |

There is no local Solana toolchain on the dev machine. Everything is compiled and tested only by the CI job `anchor-build` (`anchor build`, then `anchor test --validator legacy`). Anchor 1.x defaults to Surfpool, which CI does not install, hence `--validator legacy`.

## Accounts and PDA seeds

| Account | Seeds | Size | Rent (SOL) | Paid by | Lifecycle |
|---|---|---|---|---|---|
| `Lease` | `["lease", landlord, lease_id]`; `lease_id: [u8; 8]` = the raw bytes of `ls_<16hex>` | 382 B | 0.00355 | landlord | created by `create_lease`; **never closed** (it is the tenant's history and holds the hashes) |
| vault (SPL token account) | `["vault", lease]`; mint = `PAYMENT_MINT`, authority = the `Lease` PDA | 165 B | 0.00204 | landlord | created by `create_lease`; **closed** at release or cancel, lamports to `lease.landlord` |
| `PaymentRecord` | `["payment", lease, month_index as u16 little-endian]` | 102 B | 0.00160 | `payer` (tenant or a platform fee payer; no role) | created by `pay_rent`; **never closed** |

`Lease` fields: `lease_id, landlord, tenant, agency, mint, rent_amount, deposit_amount, due_day_ts, period_seconds, term_months, discount_usdc_bps, discount_ontime_bps, contract_hash, entry_report_hash, exit_report_hash, deposit_held, months_paid, on_time_streak, status (Created | Active | Closed | Cancelled), votes: [[u8; 32]; 3], bump, vault_bump`.

`PaymentRecord` fields: `lease, tenant, month_index, amount_paid, discount_applied_bps, due_ts, paid_at, on_time, bump`.

Why the seeds:
- `landlord` is in the seeds and must sign, so nobody can squat a lease address.
- `lease_id` is in the seeds, so one landlord cannot have two leases with the same id (one memo id = one lease).
- `tenant` is **not** in the seeds. The Phantom pubkey is only known when the QR is scanned. The client derives the address from the server's landlord key and `leaseId` alone, with no `getProgramAccounts` scan.
- `agency` is data only; it adds nothing to the seeds.

PDA derivation for clients (TypeScript):
```ts
lease  = findProgramAddressSync([Buffer.from("lease"), landlord.toBuffer(), Buffer.from(leaseIdHex, "hex")], PROGRAM_ID)
vault  = findProgramAddressSync([Buffer.from("vault"), lease.toBuffer()], PROGRAM_ID)
record = findProgramAddressSync([Buffer.from("payment"), lease.toBuffer(), u16le(monthIndex)], PROGRAM_ID)
```

## Instructions

| Ix | Signers | Account constraints | Checks → error | Effect |
|---|---|---|---|---|
| `create_lease(params)` | landlord (payer), agency | `mint`: `address = PAYMENT_MINT`, `decimals == 6`, `freeze_authority == None` (each → `InvalidMint`); `lease` `init` with the seeds; `vault` `init`, `token::mint = mint`, `token::authority = lease`; `Program<Token>`, `Program<System>` | 3 distinct non-default parties (`InvalidParties`); `lease_id != 0`, rent > 0, deposit > 0, `due_day_ts > 0`, `period_seconds > 0`, `term_months ≥ 1` (`InvalidParams`); each bps ≤ 10 000 and the sum (u32) < 10 000 (`InvalidBps`); the due date of the last month fits in i64 (`MathOverflow`) | `Lease` = `Created`; `LeaseCreated` |
| `deposit_escrow()` | tenant | `lease`: seeds + `has_one = tenant, mint`; `tenant_token`: `token::mint`, `token::authority = tenant`; `vault`: seeds + `bump = lease.vault_bump`, `token::authority = lease` | `Created && !deposit_held` (`LeaseNotCreated`) | `transfer_checked` of `deposit_amount` to the vault; `deposit_held = true`; `Active`; `DepositHeld` |
| `pay_rent(month_index, max_amount)` | tenant + `payer` (may be the same key) | `lease`: seeds + `has_one = tenant, mint`; `tenant_token`: `token::authority = tenant`; `landlord_token`: `associated_token::authority = lease.landlord`; `payment_record`: plain `init` (never `init_if_needed`) | `Active` (`LeaseNotActive`); `month_index < term_months` (`MonthOutOfRange`); `month_index == months_paid` (`MonthOutOfOrder`); repeated month → system program "already in use"; amount > 0 (`ZeroAmount`); amount ≤ `max_amount` (`AmountAboveMax`) | `transfer_checked` tenant → landlord ATA; `PaymentRecord`; `months_paid += 1`; streak `+1` or reset to 0; `RentPaid` |
| `vote_release(to_tenant, to_landlord, reason_hash, exit_report_hash)` | one of tenant, landlord, agency (role resolved from the signer, never from an argument) | `lease`: seeds + `has_one = mint, landlord`; `vault`: seeds + `token::authority = lease`; `tenant_token` / `landlord_token`: `associated_token::` of `lease.tenant` / `lease.landlord`; `landlord` (vault rent destination) via `has_one` | `Active && deposit_held` (`LeaseNotActive`); signer is a party (`NotAParty`); `to_tenant.checked_add(to_landlord)` (`MathOverflow`) `== deposit_amount` (`SplitMismatch`) | writes the signer's vote slot; `ReleaseVoted`. If another slot holds the same terms hash: pay the split, sweep the excess, close the vault, set `exit_report_hash`, `deposit_held = false`, `Closed`; `DepositReleased` |
| `cancel_lease()` | landlord | `lease`: seeds + `has_one = landlord, mint`; `vault`: seeds; `landlord_token`: ATA of the landlord | `Created && !deposit_held` (`LeaseNotCreated`) | sends any donated tokens to the landlord ATA, closes the vault (rent to the landlord), `Cancelled`; `Lease` kept; `LeaseCancelled` |

The client adds `createAssociatedTokenAccountIdempotent` for the landlord ATA (pay, release, cancel) and the tenant ATA (release) in the same transaction when needed. The program never creates ATAs.

### 2-of-3 release with per-party vote slots

- `Lease.votes[role]` with role tenant = 0, landlord = 1, agency = 2. All zero = no vote.
- `terms_hash = sha256(to_tenant as u64 LE ‖ to_landlord as u64 LE ‖ reason_hash ‖ exit_report_hash)`.
- A party can only overwrite its own slot. When the signer's new hash equals another party's slot, the release executes in the same instruction, with the terms the completing voter passed (the hash proves they are the agreed ones).
- Properties, each covered by a test:
  - one vote never moves funds (R-04);
  - voting twice the same terms does nothing (R-05);
  - a changed vote invalidates the old one (R-10);
  - one party re-voting in a loop cannot block the other two (R-11);
  - the same split with a different `reason_hash` or `exit_report_hash` does not match (R-12);
  - the atomic form (two votes in one tx) works (R-08);
  - there is no payout after `Closed` (R-09).
- **Sweep before close:** the payout reads `vault.amount`. It sends `to_tenant` to the tenant, `to_landlord + (vault.amount - deposit_amount)` to the landlord, then closes the vault. A donated "dust" transfer can therefore never block the close (R-15). `vault.amount < deposit_amount` fails with `VaultShortfall`.
- Zero shares are skipped (R-19). The vault rent always goes to `lease.landlord`, who paid it (R-16).

### Mint and token program

- `token_program` is `Program<'info, Token>` in every instruction: classic SPL Token only. A fake or Token-2022 program fails with `InvalidProgramId` (X-01, C-10).
- `PAYMENT_MINT = GiCyZLFrkhKd3X4CpFGe4sMHB2kiPob5ToH8FtjYou7X` is the devnet tUSDC mint from `scripts/setup-devnet.ts`: 6 decimals, no freeze authority, mint authority = platform key. It is a program constant. Using another mint means changing the constant and redeploying.
- `deposit_escrow`, `pay_rent`, `vote_release` and `cancel_lease` then use `has_one = mint`, so no other mint can reach a lease.
- Tests: the local validator preloads an account at the pinned address from `tests/anchor/fixtures/tusdc-mint.json`. Its mint authority is a localnet-only key derived from a public string in `tests/anchor/rental_escrow.ts`. It has no power on devnet, and no keypair file exists.

### Pricing, on-time and the period rule

```
due(m)        = due_day_ts + m * period_seconds          (checked i64; fixed-length periods, NOT calendar months)
on_time       = Clock::get()?.unix_timestamp <= due(m)   (inclusive, like pricing.ts atTs <= dueTs)
discount_bps  = discount_usdc_bps + (on_time ? discount_ontime_bps : 0)
amount        = rent_amount * (10_000 - discount_bps) / 10_000   (u128 intermediate, floor)
```

- The program only accepts the payment token, so it always applies the USDC discount. This mirrors `computePrice(..., method: 'usdc')`.
- Both bps values live in `Lease` and are never hard-coded.
- The time comes only from the program `Clock`, a validator-voted timestamp the client cannot set. The client only bounds the charge with `max_amount`: the quote it showed the tenant.
- If the tx lands one second after `due`, the charge is 2% higher. With the quote as `max_amount`, it fails with `AmountAboveMax` instead of overcharging. The client then re-quotes.
- `tests/anchor/vectors/pricing.json` is run by `cargo test` (`math.rs`) and by vitest through `computePrice` (`tests/anchor/pricing-vectors.test.ts`). It covers `now == due`, `due ± 1`, month 2, and rent `u64::MAX`.

**Known mismatch, hand-off to ai-agents-engineer:**
- `lib/agents/lease.ts` `addMonthsTs` uses calendar months (`setUTCMonth`); the program uses `period_seconds`.
- They disagree from month 1. From 5 Oct, month 1 is due 31 days later in TS and 30 days later on chain (2 592 000 s), so the quote shown and the chain can differ near the due date.
- Fix on the TS side: due of month `m` = `dueTs + m * 2_592_000`, and pass `period_seconds = 2_592_000` to `create_lease`. This also changes custodial mode, so it is a single change for both modes.

### Events

All fields are pubkeys, integers, booleans and fixed byte arrays: no strings, no PII (H-01, H-02).

- `LeaseCreated{lease, lease_id, landlord, tenant, agency, mint, rent_amount, deposit_amount, due_day_ts, period_seconds, term_months, discount_usdc_bps, discount_ontime_bps, contract_hash, entry_report_hash}`
- `DepositHeld{lease, tenant, amount, held_at}`
- `RentPaid{lease, tenant, month_index, amount, discount_bps, on_time, due_ts, paid_at, on_time_streak}`
- `ReleaseVoted{lease, voter, role, terms_hash, to_tenant, to_landlord, reason_hash, exit_report_hash}`
- `DepositReleased{lease, completed_by, completed_by_role, terms_hash, to_tenant, to_landlord, excess_to_landlord, reason_hash, exit_report_hash}`
- `LeaseCancelled{lease, cancelled_at}`

The program does not CPI to Memo. The client keeps the `lease:v1:` memo as a top-level instruction, so `readMemoHash` keeps working. In program mode, Verify must read `Lease.contract_hash` instead (qa objection 4 on sol-client).

### Errors (`EscrowError`)

`InvalidParties, InvalidParams, InvalidBps, InvalidMint, LeaseNotCreated, LeaseNotActive, MonthOutOfOrder, MonthOutOfRange, MathOverflow, SplitMismatch, NotAParty, AmountAboveMax, ZeroAmount, VaultShortfall`, plus the Anchor built-ins (`ConstraintSeeds`, `ConstraintHasOne`, `ConstraintTokenOwner`, `ConstraintTokenMint`, `ConstraintAssociated`, `AccountNotSigner`, `InvalidProgramId`, ...).

## Custody: what the program does and does not guarantee

Disclosure (qa objection 7, to be used verbatim in README › Security considerations, on the receipt and in one sentence of the video):

> *"Program mode: the deposit sits in a program-owned vault and release needs 2 of 3 signatures (tenant, landlord, agency). In this demo the platform operates the landlord and agency keys, so the platform alone can release the deposit: the rules are enforced by code, but custody is operational. The program upgrade authority is held by the team, devnet only."*

- With the server holding both the landlord and agency demo keys (Decision 1a in the debate), **the escrow is custodial in substance**. The server alone meets 2-of-3.
- Even with real keys, the agency is chosen by the landlord. Landlord + agency collusion can take the whole deposit. That is inherent to 2-of-3 with the agency as arbiter.
- Early release by landlord + agency is allowed on purpose (R-20). If the tenant disappears mid-lease, the deposit must still be releasable, and that is the agency's job.

## Security notes

**Authorities**
- **Program upgrade authority:** the deployer key (see Deploy). It can replace the code and drain every vault. Devnet only; stated in the disclosure.
- **Mint authority** of tUSDC: the platform key (test token, devnet only).
- **No admin instruction, no config account, no fee account.** The program has no privileged signer other than the three parties of each lease.

**Known limits**
- Payment history is self-asserted until agencies are registered. Anyone can create a lease with sock-puppet landlord and agency wallets, pay rent to themselves and get on-time records (minimum 1 base unit after discount, since 100% discounts are rejected). Any reputation use (AD-13) must filter on an agency allowlist.
- A tenant wallet's rent amounts and punctuality are public forever (allowed by AD-12; users should be told).
- Document hashes of templated contracts are guessable by dictionary unless the off-chain text is salted (H-04, hand-off).
- `Lease` and `PaymentRecord` rent is never recovered (history by design).
- Not implemented: Token-2022, late fees, renewals, agency fees, AD-13 deposit reduction from `on_time_streak` (stretch).

**Funding rule for the demo**
- Per lease the landlord pays ≈ 0.0056 SOL at create (`Lease` 0.00355 + vault 0.00204). It gets 0.00204 back at release or cancel.
- Each rent costs the payer 0.0016 SOL plus fees. A demo lease with deposit and one rent is ≈ 0.0072 SOL; a full 12-month lease is ≈ 0.023 SOL.
- Before a recording, top up the landlord and the platform fee payer to ≥ 1 SOL each.
- Below 0.1 SOL, the app should alert and refuse to start a new program-mode lease, not silently switch modes mid-lease (sol-client § 3).

## Tests

- **CI:** job `anchor-build` in `.github/workflows/ci.yml` runs `anchor build`, then `anchor test --validator legacy`. That runs `[scripts] test` from `Anchor.toml`:
  1. `cargo test` (pure math, shared vectors);
  2. `pnpm exec tsx --test tests/anchor/rental_escrow.ts` (node:test, the Anchor TS client, the local validator Anchor starts).
- **Also in CI:** the vitest job runs `tests/anchor/pricing-vectors.test.ts`.
- Each integration test name starts with its id in `docs/debates/anchor-accounts/qa-tests.md`; the status of every id is listed there.
- The integration file is deliberately not named `*.test.ts`, so vitest does not try to run it without a validator.
- `[provider] cluster` must stay `localnet`. With any other cluster, `anchor test` deploys to it.

## Deploy (documented, NOT executed)

Nothing has been deployed. CI never deploys and holds no key.

- **Who runs it:** Mauro.
- **Where:** a Linux or WSL shell with Agave 4.1.2 and Anchor 1.2.0 installed (≈ 1 h the first time). The alternative is option (c) of the debate: a `workflow_dispatch` job with a devnet-only deployer key in Actions secrets.
- **Which keys:** a new dedicated **deployer key**. It becomes the upgrade authority. It is not the platform, landlord or agency key, and it is never committed. The **program keypair** is generated at deploy time and kept outside git (`target/` is ignored).

```bash
solana config set --url https://api.devnet.solana.com
solana-keygen new -o ~/.config/solana/keyhold-devnet-deployer.json      # upgrade authority (never commit)
solana airdrop 2 -k ~/.config/solana/keyhold-devnet-deployer.json        # repeat or use faucet.solana.com; see cost below
solana-keygen new -o target/deploy/rental_escrow-keypair.json            # program id (never commit)
anchor keys sync                                                         # rewrites declare_id! and Anchor.toml [programs.*]
anchor build
ls -l target/deploy/rental_escrow.so                                     # deploy cost ≈ size_in_bytes * 6960 lamports (x2 while the buffer exists)
anchor deploy --provider.cluster devnet --provider.wallet ~/.config/solana/keyhold-devnet-deployer.json   # also uploads the IDL
solana program show <PROGRAM_ID>                                         # check the upgrade authority = deployer
```

After deploy:
- commit the new `declare_id!`, `Anchor.toml` and `target/idl/rental_escrow.json`;
- set `PROGRAM_ID` in `.env.example` and README;
- hand the IDL to solana-client-engineer;
- for a frozen demo, optionally make it immutable later with `solana program set-upgrade-authority <PROGRAM_ID> --final` (irreversible).

Cost: a ~300–400 KB program needs ≈ 2–3 SOL of devnet SOL for the program data account, plus the same again temporarily for the write buffer, which is refunded.

## Hand-offs

| To | What |
|---|---|
| solana-client-engineer | IDL at `target/idl/rental_escrow.json` (committed once CI produces it). Seeds and PDA helpers above. `max_amount` = the quote shown. `month_index` read from `Lease.months_paid`. Map "already in use" on `pay_rent` and `MonthOutOfOrder` to "already paid". Idempotent ATA creation before pay, vote and cancel. Confirm by state (`PaymentRecord` / `deposit_held`), not by tx shape. Verify reads `Lease.contract_hash`. Release txs on the public route carry only the wallet's own signature. |
| ai-agents-engineer | Replace calendar-month `addMonthsTs` with fixed `period_seconds = 2_592_000` for due dates (affects both modes). Salt contract and report text before hashing (H-04). |
| submission-writer / ui-motion-engineer | The custody disclosure sentence above (README › Security considerations, receipt, video). |
| Mauro | Deploy (above). Decision 1 (who holds the landlord and agency keys in the video). Second Phantom wallet + devnet SOL if the video shows a real 2-of-3. |

## Cost

| Work | Agent-h | Mauro-h |
|---|---|---|
| Debate (proposal, answers) | 1.5 | 0.5 (read and approve this table) |
| Program + tests (this branch) | 5 | — |
| CI round-trips (first run installs the toolchain, ~15–25 min) | 1.5 | — |
| Review of program and tests | — | 1.5 |
| Devnet deploy + IDL hand-off | 0.5 | 1 (WSL setup once, deploy) |
| Client integration (sol-client's estimate) | 6 | 0.5 (second Phantom, SOL top-up) |
| **Total** | **≈ 14.5** | **≈ 3.5** |

## Debate summary

**Surviving proposal:**
- sol-program's account model with every qa and sol-client amendment.
- Seeds `["lease", landlord, lease_id: [u8; 8]]`; tenant in data.
- Program-owned vault `["vault", lease]` with sweep-before-close.
- **Per-role vote slots with a terms hash** instead of propose/approve.
- Classic SPL Token only, with the mint pinned (`address`, 6 decimals, no freeze authority).
- `pay_rent(month_index, max_amount)` with Clock-based on-time and fixed periods.
- Discount sum < 100%, checked u32/u128/i64 math, `overflow-checks = true`.
- `cancel_lease` that keeps the `Lease`; no `String` on chain.

**Objections still standing:**
- qa 10 (early release by landlord + agency): **rebutted**. Intended and tested (R-20); a mid-lease abandonment must stay releasable.
- qa 12 / H-04 (salted hashes): accepted, but **open off-chain** (ai-agents, sol-client).
- sol-client 4 (calendar vs fixed months): accepted, but **open in TS** until ai-agents changes `addMonthsTs`.
- sol-client 6 / qa 7 (real 2-of-3 in the demo): the **disclosure is ready**; the key-holding choice is Mauro's.
- qa's S-series (claim token, no server role signatures on public routes, confirm-by-state, Verify from `Lease`): **client-side, open** with sol-client.
- P-12 deviation: the i64 due overflow is rejected at `create_lease` (whole term checked) rather than at `pay_rent`. That is stricter; `cargo test` covers the pay-side function.

**Cost:** ≈ 14.5 agent-hours in total (≈ 8.5 done on this branch) and ≈ 3.5 Mauro-hours (review, deploy, demo wallet).
