# B5 review: Solana Pay transaction request + QR

Reviewer: qa-security-reviewer. Branch `f3-solana-pay` at `f8dd439`, diff `origin/ci/setup..f3-solana-pay`.
Date: Sun 04/10 (overnight).

## Verdict

| Decision | Result |
| --- | --- |
| Merge with the flag OFF (`NEXT_PUBLIC_SOLANA_PAY` unset, the default) | **GO** |
| Turn the flag ON (any deployment reachable by people other than the team) | **NO-GO** until B5-1 is fixed |

With the flag off, the three routes answer 404, the QR button is not rendered, and the refactored `/api/pay` passes the full phase0 suite. With the flag on, the platform signs a transaction that moves custody funds and needs no other signature (B5-1).

## Blocking (flag ON)

### B5-1. The tx endpoint accepts the platform as `account`, so it returns a transaction the server has fully signed that moves custody funds to the landlord

- `app/api/solana-pay/tx/route.ts:72-79` accepts any on-curve `account`, including the platform pubkey.
- `lib/solana/solana-pay.ts:69` makes the transfer authority `payer` (= `account`). `:73` makes the fee payer `platformKeypair()`. `:79` `partialSign(feePayer)`.
- With `account = platform` and a **rent** ticket, the transfer is `custody ATA -> landlord ATA` with authority = platform. The fee payer and the authority are the same key, so the server's one signature covers both and the transaction is complete.
- `lib/solana/solana-pay.ts:130-159` (`transferAmountIfValid`) does not check the source or the authority. `/api/solana-pay/status` therefore records that payment as the tenant's rent.

Scenario. An anonymous visitor runs the public Ana demo and pays the deposit with the custodial button (the server signs with the demo key). They mint rent tickets from that session, which needs no wallet and has no throttle. For each ticket they `POST /api/solana-pay/tx?t=… {"account":"<platform pubkey>"}` and broadcast the returned base64 transaction as-is. Each one moves one month's rent (399 tUSDC) from custody to the landlord, and the platform pays the fee. Repeated, this drains the custody wallet, which holds everyone's deposits (27,240 tUSDC when probed). Polling status also records the rent as paid by the tenant, who spent nothing.

Evidence: `pnpm exec tsx tests/e2e/b5-solana-pay-attacks.ts`. It sends no transaction: it only reads and runs `simulateTransaction` with `sigVerify: true`.

```
PASS  rent ticket minted  (200)
  platform custody balance: 27240 tUSDC; rent 399
FAIL  tx endpoint refuses account = platform (fee payer / custody owner)  (got 200 Rent payment: 399 test USDC (devnet))
FAIL  returned tx still needs a signature the server does not hold  (fully signed by the server alone: true)
FAIL  simulation (sigVerify on) of the server-only-signed tx does not move custody funds  (simulate err=null custody delta=-399000000 landlord delta=+399000000 base units)
```

The impact is devnet test tokens only, but the custodial-escrow story depends on this guarantee, and a judge with a wallet can reproduce it.

Fix (owner: solana-client-engineer). Do all of the following:
1. In the tx route, refuse `account` when it equals any server-held key (platform/fee payer, landlord, agency) or the destination owner. Return 400.
2. Better: use a dedicated fee-payer keypair. It must own no token accounts and never be a token authority. Then the server's signature can never authorise a token movement.
3. In `transferAmountIfValid`, reject a transfer whose authority (`accounts[3]`) is the platform, landlord or fee payer, or whose source is the custody ATA. That stops a crafted transaction from being recorded even if (1) regresses.
4. Add a unit test for (1) and (3), and keep `tests/e2e/b5-solana-pay-attacks.ts` green (it exits 1 today).

## Non-blocking

N1. **Double payment is possible. Residual risk, quantified.**
- `app/api/solana-pay/ticket/route.ts:56` mints a fresh random reference on every call. `referenceAlreadyUsed` (`lib/solana/solana-pay.ts:99-102`) only protects one reference. Each ticket for the same slot therefore produces an independently payable transaction (probe: 2 tickets for rent month 0, different references, both built 200/200). Two POSTs on the *same* ticket before either lands also give two payable transactions with the same reference, and status records only the first.
- QR and the custodial button: the `/api/pay` in-flight guard is per process and keyed on the session, so it does not see the QR flow. If the button's payment is recorded first, status returns the existing record (`status/route.ts:59-64`) and the QR payment is orphaned: the money moved and nothing records it.
- Worst case is N × amount for the tenant, where N is the number of transactions the tenant signs in their wallet (each needs a deliberate wallet approval), plus one custodial payment. No refund path exists.
- Recommendation: derive the reference deterministically per slot, e.g. `Keypair.fromSeed(HMAC(ticketKey, sessionId|leaseId|kind|month))`. Then every QR for a slot shares one reference and the existing `referenceAlreadyUsed` check refuses the second build. Also hide the custodial button while a QR is open.

N2. **The 150 s in-flight grace can be used with a self-built transaction.**
- `lib/solana/solana-pay.ts:27,196-199` accepts the discounted amount when `blockTime <= dueTs + 150`, whoever built the transaction. The reference and the memo are in the ticket, which the tenant holds. The tenant can therefore build their own transaction with any fresh blockhash and the on-time price, and land it up to 150 s late.
- The comment "bounded by the blockhash lifetime" holds only for transactions our endpoint built.
- Impact: 2 % of rent (8.4 tUSDC for the 420 list price) for at most 150 s of lateness. The record is also internally inconsistent: the probe shows `onTime=false discountAppliedBps=500`.
- Recommendation: grant the grace only when the fee payer of the confirmed transaction is our fee-payer key. Then the amount is the server's own quote from before the due date. Otherwise apply the strict price. Report `discountAppliedBps` consistently with `onTime`, or add an explicit `graceApplied` field.

N3. **No rate limit or cost guard on the three routes.** Each `POST /tx` makes 3 RPC reads plus `getLatestBlockhash`. Each status poll makes 1 call plus up to 20 `getTransaction` calls. The ticket route needs only a signed session, which any visitor gets. The risk is RPC quota exhaustion. Fee cost is bounded once B5-1 is fixed, because a transaction lands only if the payer moves real tokens and the destination ATAs already exist. Add a per-IP limit before the flag goes on in a public deployment.

N4. **The reference holder can grief their own payment.**
- `findValidPayment` reads only the newest 20 signatures (`lib/solana/solana-pay.ts:170`). Attaching the public reference to 20 or more junk transactions after the real payment pushes it out of the window, and status stays `pending` forever.
- Attaching it to any one successful transaction makes the tx route answer 409 (`referenceAlreadyUsed`).
- Only someone who holds the ticket can do this (the session holder, or someone who sees the QR). Low risk. Consider paginating with `before`, or filtering on the destination ATA's signatures instead.

N5. **`publicOrigin` trusts `x-forwarded-host` / `host` when `SOLANA_PAY_PUBLIC_URL` is unset** (`lib/solana/solana-pay-http.ts:46-52`). The browser sets the header for its own ticket request, so this is low risk. Still, set `SOLANA_PAY_PUBLIC_URL` explicitly in any deployment with the flag on.

N6. **`OPTIONS /api/solana-pay/tx` answers 204 with CORS headers even with the flag off.** GET and POST correctly return 404. This is cosmetic. Gate OPTIONS on the flag too.

N7. **The ticket body is signed, not encrypted.** The QR exposes `sessionId`, `leaseId`, the tenant id (`ana`), amounts, `dueTs` and the contract hash. That is not PII for the demo tenants, and `sessionId` alone grants nothing because status needs the signed session. If tenant ids ever become real identifiers, drop them from the wire format (they are not needed to build the transaction).

N8. **The status route does not re-check slot order against the supplied session.** A stale session blob (signed earlier, before the deposit was recorded) can record a rent payment whose deposit the blob does not show. The money flow itself still enforces deposit-before-rent, because a rent ticket can only be minted from a session that shows the deposit. This only affects state consistency.

## Checked and OK

- **Ticket forgery:** HMAC-SHA256, constant-time compare with a length check, strict zod tuple, 2 KB cap. A forged signature returns 401 (unit tests and `scripts/solana-pay-e2e.ts`).
- **Domain separation:** the ticket key is `HMAC(SESSION_SECRET, "solana-pay-ticket:v1")`. Sessions use `HMAC(SESSION_SECRET, canonicalJSON)`, which always starts with `{`. Neither signature validates as the other.
- **Expiry:** server clock, 15 min TTL, 410 on expiry. Status allows an extra 10 min so that a late confirmation still resolves.
- **Session binding:** status requires a matching `sessionId` and `leaseId`, otherwise 403. Idempotent by memo and by signature (`applyEvent` dedups).
- **Tampering with amount, mint, destination or decimals in a self-built transaction:** all are checked against the ticket. The memo must match byte for byte. Two matching transfers are refused. The amount credited is `min(instruction amount, destination ATA balance delta)`, so extra instructions cannot inflate it. A self-transfer to the destination (e.g. `account = landlord`) gives delta 0 and is rejected.
- **The custom scan instead of `validateTransfer`:** it tolerates prepended or appended instructions, such as compute budget, and resolves v0 lookup tables. Appended instructions cannot change the recorded amount (balance-delta check).
- **Deposit before rent:** preserved. `nextPaymentSlot` is shared by `/api/pay` and the ticket route. Ticket rent before deposit returns 409, and phase0 `/api/pay` rent before deposit returns 409.
- **Memo has no PII:** `lease:v1:<leaseId>:deposit|rent:<n>:<sha256>`. The wallet message only states the amount.
- **Secrets:** `TENANT_ANA_SECRET_KEY` is loaded via `tenantKeypair` and never printed. The script prints only `err.message`. `logError` logs only `err.message`. The diff adds no keys or `.env` (only empty `.env.example` entries). The git diff scan is clean.
- **Server/client boundary:** `SolanaPayQr.tsx` imports only types and UI. `qrcode` is lazy-loaded on the client. `@solana/pay`, the keys and `node:crypto` stay in server modules.
- **CORS:** `*` only on `/api/solana-pay/tx`, which the Solana Pay spec requires (wallets call it cross-origin, with no cookies). Ticket and status are same-origin and carry the session in the body, so there is no CSRF surface.
- **Dependencies:** `@solana/pay` 0.2.6, `bignumber.js` 9.3.1 and `qrcode` 1.5.4 are pinned, and the lockfile is regenerated. The new transitive packages are the usual ones (`@solana/qr-code-styling`, `qrcode-generator`, yargs 15 and its dependencies, `cross-fetch`).

## Evidence

| Check | Command | Result |
| --- | --- | --- |
| CI on branch | `gh run list --branch f3-solana-pay` | run 37180137539 **success** (the earlier run was cancelled by the newer push) |
| Unit tests | `pnpm test` (local worktree) | 7 files, **61/61 passed** |
| Typecheck | `pnpm exec tsc --noEmit` | exit 0 (includes the new probe file) |
| Build, flag off | `pnpm build` | OK; routes `/api/solana-pay/{status,ticket,tx}` compiled |
| phase0 e2e, flag off | `pnpm start -p 3011` with `REPLAY=1`, then `BASE_URL=http://localhost:3011 REPLAY=1 node tests/e2e/phase0.mjs` | **59/59 passed** in 6 s; deposit [49UzeR…](https://explorer.solana.com/tx/49UzeRvzVBybHM1KdP8HhgDDJpGeyKZLqbmKcdJoCjqT3coGBCWnLTQM5iD2bC8tzsMzGKLGedozNVgPbfyJy42S?cluster=devnet), rent [5bso8X…](https://explorer.solana.com/tx/5bso8XjDP29Vvqim4EXn4NGYU55MzaceSZR6Jes6eYEtpj4ay6o6t7vHEPrT5rWVyhmvBxoeDRZokFbWaXzpy3GE?cluster=devnet) |
| Flag-off surface | `curl` on 3011 | tx GET 404, tx POST 404, ticket 404, status 404, tx OPTIONS 204 (N6) |
| Attack probes, flag on in-process | `pnpm exec tsx tests/e2e/b5-solana-pay-attacks.ts` | 3 FAIL (B5-1); double-pay and grace figures as quoted above |

Devnet usage: the 2 phase0 transactions above, which this gate requested. No extra transaction was sent: the probes use `simulateTransaction` only. Live model calls: 0 (REPLAY=1). Server on 3011 stopped afterwards.

## Re-review needed for flag ON

Re-run `tests/e2e/b5-solana-pay-attacks.ts`: it must exit 0. Re-run `scripts/solana-pay-e2e.ts`: 2 devnet transactions. Confirm the fix for B5-1 and, ideally, N1 and N2.
