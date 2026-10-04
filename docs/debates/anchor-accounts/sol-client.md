# Debate A · Proposal from sol-client (solana-client-engineer)

Assumes the same toolchain as sol-program: **CI only** (`anchor-build`, Agave 4.1.2, Anchor 1.2.0), no local validator, deploy is a separate step. Everything below is client-side and costs no program changes except the asks in "What I need changed". Numbers are estimates until the CI logs give real ones.

## 1. One builder, two signing paths

New module `lib/solana/program/` with pure builders `buildCreateAndDeposit`, `buildPayRent`, `buildProposeRelease`, `buildApproveRelease`. Each returns an unsigned `Transaction` (web3.js 1.x, legacy format) and takes **public keys only**. No key loading inside, so the CI `anchor test` suite imports the same builders the app uses and the Phantom path is tested before the first deploy.

- **(a) Server-signed demo path.** `/api/pay` calls the builder, signs with the persona key (`TENANT_*`), `LANDLORD_SECRET_KEY`, `AGENCY_SECRET_KEY` and the `platform` fee payer, sends and confirms. Same shape as today's `sendTokenTransferWithMemo`.
- **(b) Phantom via Solana Pay transaction request.** `solana:https://<host>/api/pay/tx?lease=<leaseId>&kind=<k>`. GET returns label and icon. POST `{account}` returns a base64 tx with `feePayer = platform` (or the wallet) and **all non-wallet signers already applied** (landlord and agency for create, platform as payer). The wallet adds its own signature. The server resolves `account` to a role (tenant, landlord or agency) from `Lease` data and answers 403 if it is none. The blockhash is fresh at POST time, so the 60-90 s expiry is not a problem for a single wallet.
- **Reference.** A read-only non-signer `reference` key goes on the **program instruction** as a remaining account (Anchor ignores it). It cannot go on the Memo ix, because Memo v2 requires every account it receives to be a signer.
- **Confirm.** Poll `findReference` every 2-3 s, then fetch the tx and check: no error, program id and lease PDA are in the accounts. `@solana/pay` `validateTransfer` only understands plain transfers, so program mode needs our own check.

## 2. PaymentIntent mapping

- `deposit` (first action): **one tx** `[create_lease, deposit_escrow, memo]`, signers tenant + landlord + agency (+ platform payer). The tenant wallet is only known when the QR is scanned, and it is part of the Lease seeds, so the lease cannot be created earlier. It also leaves no orphan `Created` lease.
- `rent`: `[create landlord ATA idempotent, pay_rent(month_index), memo]`. `month_index` is **read from `Lease.months_paid`**, never from the session blob (so a replayed blob cannot pay twice or skip a month).
- Release: `[create ATAs idempotent, propose_release | approve_release(nonce, split)]`. The nonce and split are read from `Lease.pending` at POST time.
- `PaymentIntent` alone is **not enough** for `create_lease`: it carries one amount (`listAmountBaseUnits`) and no `months`, `rent` and `deposit` together. The program builders take `LeaseDraft + kind + monthIndex`, which `/api/pay` already has. `executePayment(intent)` keeps its signature for custodial mode.
- The memo `lease:v1:<id>:...` stays as a **top-level** instruction in every program tx, so `readMemoHash` and `/api/verify` keep working (it only reads top-level instructions, so the program must not CPI to Memo).

## 3. `ESCROW_MODE` coexistence

`executePayment` stays as the custodial implementation. A thin dispatcher picks the mode **per lease, sticky**: if the Lease PDA exists, program; else `ESCROW_MODE`. Never switch mid-lease (a deposit in a PDA vault plus rent to the landlord by custodial transfer would split the records). Auto-fallback to custodial only **before** a lease's first on-chain action, when the program account is missing or not executable, or when the landlord/platform SOL balance is under a floor. The receipt says which mode was used (honesty, AD-03).

## 4. Reading history

`PaymentRecord` accounts, not memos: derive the `term_months` PDAs and make one `getMultipleAccountsInfo` (up to 100 per call) and decode with the IDL coder. They hold `amount_paid`, `discount_applied_bps`, `paid_at` and `on_time` from the program Clock, so `PaymentResult.onTime` and `discountAppliedBps` are **read, not recomputed**. The record has no signature: get it lazily with `getSignaturesForAddress(recordPda, {limit: 1})` for the explorer link. Memos remain the verify path for the contract hash.

## 5. IDL consumption

CI publishes `target/idl/rental_escrow.json` and `target/types/*.ts` as an artifact. I commit the IDL under `lib/solana/program/idl/` and use the Anchor coder (`BorshInstructionCoder` / `BorshAccountsCoder`) in server code only, so the Anchor TS package never reaches the client bundle. **[VERIFY]** the Anchor 1.x TS package name. PDA helpers are hand-written and tested against CI.

## 6. Compute and rent (who pays)

| Item | Lamports (SOL) | Payer | Recovered |
|---|---|---|---|
| `Lease` (~401 B) | ~3.68M (0.0037) | landlord | no (kept) |
| vault (165 B) | 2.04M (0.0020) | landlord | yes, at close |
| `PaymentRecord` (~93 B) each | ~1.54M (0.0015) | `payer` = platform | no (kept) |
| Signatures | 5 000 each | platform | no |

A demo lease with deposit + 1 rent costs about 0.0073 SOL; a full 12-month lease about 0.024 SOL. Compute should be about 60-90k CU per tx, under the 200k default, so no `SetComputeUnitLimit` except `approve_release` (2 transfers + close), where I would set 150k after measuring. Tx size for `[create, deposit, memo]` with 4 signatures is the tightest, about 1.0 KB of 1 232 B. **A CI test must assert `tx.serialize().length < 1232`.**

## What I need changed (see objections in sol-program.md)

Add `max_amount` to `pay_rent`; align the due-date rule with TS; `lease_id` in the seeds instead of `tenant`; `contract_hash` in `create_lease` params and `LeaseCreated`; keep the memo outside the program; allow `create_lease` + `deposit_escrow` in one tx (it does, as written).

## Cost

Builders + dispatcher + `/api/pay/tx` route + history reader: **~6 agent-h**, Mauro ~0.5 h (second Phantom setup, SOL for the fee payer top-up). Blocked until the IDL exists; builders can be written against the table above and fixed after the first CI IDL.

## Objections from qa

Severity: **B** = blocking, **NB** = non-blocking. Test ids refer to `qa-tests.md`.

1. **B · First POST wins the lease (claim hijack) [S-01, S-02].** For `deposit`, the POST builds `[create_lease, deposit_escrow, memo]` with the landlord and agency signatures already applied, for whatever `account` is posted. The `Lease` does not exist yet, so "resolve `account` to a role from Lease data" cannot apply. Anyone who sees the QR URL can POST first and become the tenant of that `leaseId`:
   - a screen share;
   - the recorded video;
   - someone looking over the shoulder.

   With sol-program's seeds, the attacker instead creates a parallel lease with the same `lease_id`.

   **Fix:**
   - A one-time claim token in the URL, bound to the server-side session.
   - On the first POST, persist `leaseId → wallet` and answer 409 to any other wallet.
   - Seeds `["lease", landlord, lease_id]`, so a second lease with the same id cannot exist on chain.
2. **B · The public route must never pre-sign role signatures for a release [S-03].** "All non-wallet signers already applied" plus a server that holds landlord **and** agency (Decision 1a) is a signing oracle. Suppose `/api/pay/tx?kind=propose|approve` applies a server role signature. Then a tenant can obtain one tx in which the tenant proposes `to_tenant = deposit` and the server-held agency approves, and the deposit is drained by one request. **Rules:**
   - Release txs on the Phantom route carry only the wallet's own signature, plus the platform fee payer, which has no role.
   - Server-role votes come only from the authenticated agency panel.
   - The split and hashes come from `Lease` state or the authenticated proposer, never from the query string or the body.
3. **B · Confirming by transaction shape can be forged [S-04, S-05].** The `reference` is public, because it is in the QR. An attacker sends a **successful** tx that carries the reference, the program id and the lease PDA, but calls a different instruction (e.g. `propose_release`). "No error, program id and lease PDA in the accounts" passes, and the server records rent or the deposit as paid. `findReference` also returns the newest signature, so the attacker's reference spam hides the real payment (confirmation DoS). **Fix:** confirm by **state**: the `PaymentRecord` PDA for that month exists and its decoded amount ≤ quote, or `Lease.deposit_held == true`. Use the signature only for the explorer link. If tx parsing is kept, decode the discriminator and arguments and scan every signature for the reference.
4. **B · Verify must read the account in program mode [S-06].** The memo is a top-level instruction the program never checks, so anyone can post `lease:v1:<victimId>:deposit:<anyhash>`. Today `readMemoHash(signature)` returns the memo hash without checking the memo's `leaseId`, the signer or the transfer, so a forged tx "verifies" a forged contract.
   - **Program mode:** compare against `Lease.contract_hash`.
   - **Custodial mode:**
     - The memo's `leaseId` must equal the requested lease.
     - The tx must be signed by the platform fee payer.
     - The tx must contain the expected token transfer.
5. **NB · Downgrade by balance drain.** The auto-fallback to custodial below a SOL floor, combined with orphan-lease drain on the public URL (sol-client objection 2), lets an attacker force new leases into custodial mode. Acceptable because the receipt states the mode, but during the recording a low balance must raise an alert, not switch modes silently.
6. **NB · `init_if_needed` stays out of the program.** Creating ATAs idempotently in the client is fine. The program must not use `init_if_needed` for any account, including ATAs, so that a re-init cannot overwrite state.
7. **NB · Pre-signed txs and wallet modification [S-08].** If the wallet adds or reorders instructions, the signatures applied before the wallet are invalidated. **[VERIFY]** with Phantom on devnet before relying on it, using the exact tx (reference + memo with a 64-hex hash). The `serialize().length < 1232` test must use that worst case.
8. **NB · Quote and charge from one read [S-07].** At POST, read `Lease` once and derive from that same read:
   - `month_index` from `months_paid`;
   - `max_amount` from the quote;
   - the split and nonce, or the terms, shown to the user.

   A replayed blob then cannot select a month, and a stale quote fails with `AmountAboveMax` instead of overcharging.
