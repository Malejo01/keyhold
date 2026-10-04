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

## Fixes (sol-client)

Author: solana-client-engineer. Re-review needed for flag ON. Evidence is at the end of this section.

### B5-1 (blocking): fixed

1. **Server-held accounts refused.** `serverHeldPublicKeys()` (`lib/solana/keys.ts`) returns platform (custody and fee payer), landlord and agency (when set). `POST /api/solana-pay/tx` answers 400 `Invalid account` when `account` is one of them or is the destination owner, before any RPC call, any signature or any transaction build. `buildSolanaPayTransaction` throws `ForbiddenPayerError` for the same keys, so a regression in the route still cannot produce the transaction. The demo tenant keys (ana, bruno, carla) are not in the list on purpose: they stand in for the tenant wallet and the e2e script signs with Ana's. Handing out a tx for Ana's pubkey is harmless because only Ana's key can complete it.
2. **Authority and source.** The transfer authority is the requesting `account`, the source is `ATA(mint, account)`. Custody is never a source. Tests: `lib/solana/solana-pay.test.ts` ("transfer authority is the payer...") and `app/api/solana-pay/routes.test.ts` (the built tx has the platform signature only, `verifySignatures(true)` is false, neither the platform nor the custody ATA appears in the transfer).
3. **Fee payer: kept as the platform key, with a proof instead of a dedicated key.** Reason: a dedicated key needs a new env var and funded SOL, and the lead owns env changes. The platform signature cannot authorise a token movement because:
   - The Token program only accepts a transfer if the source token account's owner signed. The source is `ATA(account)`, and `account` is not a server key (item 1), so the platform's signature is not the owner's signature.
   - `assertFeePayerAuthorizesNothing` runs before `partialSign` and throws if the fee payer key appears in any instruction other than the associated-token-account creation (account 0, the funder, or account 2, the owner value, which never signs there; that is the platform itself for deposits). So it is in no token-program and no system-program instruction.
   - A signature covers the exact message, so the holder of the returned transaction cannot add an instruction to it without invalidating the platform signature.
   - The only thing the platform pays is the fee, plus the rent of a destination token account that already exists. A tx lands only if the wallet's own signature and tokens make the transfer succeed, since it is atomic.
   - If you still want a dedicated fee payer, the change is one line (`feePayer:` in the tx route) plus a funded key. It is optional.
4. **Confirmation scan** (`transferAmountIfValid`). Once an instruction matches the destination ATA, mint, decimals and reference, the whole tx is invalid when: the authority is a server-held key or the destination owner; the source is not `ATA(mint, authority)`; or the authority did not sign (`index >= numRequiredSignatures`). `findValidPayments` skips such a tx, so it cannot be recorded or block the real payment (tested: the custody drain tx and an honest tx attached to the same reference, the honest one is recorded).

### Non-blocking

- **N1 (double payment): fixed for the sequential cases, flagged for the concurrent ones.** The reference is now `slotReference(sessionId, leaseId, kind, month)`, derived from an HMAC of the server secret, so every ticket for a slot shares it. The tx route refuses with 409 when a valid payment already exists under it (`findValidPayment`, not "any tx", so junk attached to the reference does not block it). The custodial `/api/pay` carries the same reference on its transfer when the flag is on, and refuses with 409 when a wallet payment for the slot is already on chain. Status flags any other valid payment under the reference as `duplicatePayments: [signatures]` (never recorded, logged server side). Residual: two approvals that land within the same poll interval, and a button payment racing a QR payment, are detected afterwards and flagged, not prevented. There is no refund path in the custodial demo. The UI does not render `duplicatePayments` yet (ui-motion-engineer, if wanted). The "hide the custodial button while a QR is open" suggestion is a UI change and is not done here.
- **N2 (grace): removed.** `IN_FLIGHT_GRACE_SECONDS` is gone. The price is checked at the confirmed `blockTime` only, and the stricter rule is the one that applies to every transaction. The endpoint instead quotes the price at the latest possible landing time (`quoteForBuild`: now + 120 s, longer than a blockhash lives), so an honest tx that crosses the due date in flight is still sufficient and nothing is stranded. Cost: a payer in the last 120 s before the due date is quoted the usdc-only price. `toPaymentResult` records the discount tier actually paid (`discountAppliedBps`) and `onTime` strictly from `blockTime`, so the record is consistent (before: `onTime=false discountAppliedBps=500` with the on-time amount). Tests: 1 s late with the on-time amount is refused, as is `due + 149`, and a self-built tx at `due + 100`.
- **N3 (rate limit): done.** `lib/solana/rate-limit.ts`, in-memory sliding window per IP, same approach as `/api/chat`: ticket 20, tx 30, status 200 per 5 min, 429 with `Retry-After`. Best effort per warm instance.
- **N6 (OPTIONS): done.** 404 with the flag off.
- **N4, N5, N7, N8: not changed.** N4 (newest 20 signatures) still applies. N5: set `SOLANA_PAY_PUBLIC_URL` in any public deployment with the flag on. N7 and N8 are state-consistency or wire-format notes with no money impact.

### Evidence

| Check | Result |
| --- | --- |
| `pnpm exec tsc --noEmit`, `pnpm lint` | clean |
| `pnpm test` | 8 files, 90/90 (was 61). Regression tests: `lib/solana/solana-pay.test.ts`, `app/api/solana-pay/routes.test.ts` (fake RPC, nothing sent to devnet). Mutation check: removing the authority and source checks makes 7 tests fail. |
| `pnpm exec tsx tests/e2e/b5-solana-pay-attacks.ts` | exit 0, ALL PROBES PASSED (simulation only: account = platform, landlord, agency refused with 400; the tx for a wallet fails `sigVerify` and moves nothing) |
| `pnpm build` | OK |
| phase0 e2e, flag off (`next start -p 3016`, `REPLAY=1`) | 59/59; OPTIONS on the tx route 404. Txs: [2u7gYq…](https://explorer.solana.com/tx/2u7gYqjFsSdchb9Y3Zm1bkEA9CHiNzpMcfur8QhnHHPzTqnkyF2hEinEwxWegxgZLZu1CHCnTH9Ve4MXjy3qbwNe?cluster=devnet), [iqboAu…](https://explorer.solana.com/tx/iqboAuQHWNbd8ZkbyuzesWxNJvmvDWdhHxd7x2dUCmL2VrvWLtcq2QMPWedCXkmRnVTpxWzmPD7Nrgdg526xdbv?cluster=devnet) |
| `scripts/solana-pay-e2e.ts`, flag on (`next dev -p 3015`) | ALL CHECKS PASSED. Deposit [3AMPPe…](https://explorer.solana.com/tx/3AMPPeQyyvQtqofccX1d7pueW9kctNBSZENB5vcwsJ2Uyn4mg9vJuVYZxJbpXEt8G8iqfPEnBgC8m4gNQjCkcwQp?cluster=devnet), rent [4EYHnw…](https://explorer.solana.com/tx/4EYHnwDTsJKqwF9J4uFWayjJyHcmEq3cAhKcg1yKA9am2N2KWTZrThAB71WgqmjeGQpoeJR8rsrSVYg313SEyxW7?cluster=devnet) (the 2 devnet txs of this fix, plus the 2 of phase0). Both dev servers stopped. |

## Re-gate (qa)

Reviewer: qa-security-reviewer (did not write the fix). Branch `f3-solana-pay` at `cfdbc48`. Date: Sun 04/10 (overnight).

| Decision | Result |
| --- | --- |
| Turn the flag ON on a **preview** (devnet, `SOLANA_PAY_PUBLIC_URL` set) | **GO** |
| Flag ON in production | Not before R1 is accepted by Mauro and the `f2-db` merge (R4) is re-tested |

### B5-1: fixed

- **Server keys refused as `account`.** The tx route checks `isForbiddenPayer` (platform/fee payer/custody, landlord, agency, destination owner) before any RPC read or signature, and `buildSolanaPayTransaction` refuses them again (`ForbiddenPayerError`). Re-run probe: platform, landlord and agency all get 400 and no transaction.
- **Same rule in the scan.** `transferAmountIfValid` invalidates the whole tx when the matching transfer's authority is a server key or the destination owner, when the source is not `ATA(mint, authority)`, or when the authority is not among the first `numRequiredSignatures` keys. Unit tests cover the original custody drain, every server authority, a pull from custody, an unsigned authority and a self-transfer; a junk tx under the same reference does not block the honest one.
- **Authority = `account`, source = `ATA(account)`.** Verified in the built tx (probe) and in tests.
- **`assertFeePayerAuthorizesNothing` is sound.** Signer privilege can only be used by an instruction that lists the key, and the assert allows the platform key only in the associated-token-account instruction at positions 0 (funder) and 2 (owner). Position 2 is never a signer. Creating an ATA with the platform as owner only creates (or, idempotently, finds) the platform's own custody token account. The funder's signature lets the ATA program move at most the rent-exempt minimum, once, into a fixed address `ATA(destinationOwner, mint)` that already exists on devnet. The platform signature covers the exact message, so the wallet cannot add an instruction, change the blockhash or reuse the signature. New probe 2b simulates the returned tx **as if the wallet had signed** (`sigVerify: false`): custody 0, landlord +399 tUSDC, wallet -399 tUSDC. The server signature authorises nothing beyond the fee.
- **Reference per slot.** `slotReference` = HMAC-derived key over (session, lease, kind, month). Two tickets share it (probe 3); the tx route returns 409 if a valid payment already exists under it; the custodial button carries it and refuses a slot already paid by wallet.
- **No grace.** The price is checked only at the confirmed `blockTime`; the build quote looks 120 s ahead. Tests: 1 s late and `due + 149` with the on-time amount are refused, and so is a self-built tx at `due + 100`. (`STATUS_GRACE_SECONDS` in the status route only extends *ticket* expiry for polling; it does not change the price.)
- **Rate limits.** ticket 20, tx 30, status 200 per IP per 5 min, 429 + `Retry-After`; tested. Best effort per warm instance.
- **OPTIONS 404 with the flag off.** Tested (`routes.test.ts:173`), and GET/POST answer 404 too.

**Tenant demo keys as acceptable `account`: acceptable for the devnet demo.** A tx built for Ana's pubkey needs Ana's signature. Only the server holds that key, and no endpoint signs arbitrary transactions with it, so an outsider cannot complete it (probe: `SignatureFailure`, nothing moves). The scan accepts tenant-key authorities on purpose, because the custodial button pays with them under the same reference. Condition: when real tenant wallets replace the demo keys, or if a tenant key were ever used for anything but that tenant's own payments, add the tenant keys to `serverHeldPublicKeys()`. Write this in the ADR or in a comment on the custodial button.

### Non-blocking

- **R1. Fee griefing.** A visitor can mint a ticket, request a tx for their own funded wallet, move their tokens away and then broadcast: the tx fails and the platform pays the 5,000-lamport fee. This is bounded by the tx rate limit (30 per IP per 5 min per instance) and costs devnet SOL only. A dedicated low-balance fee-payer key would isolate it. Mauro decides.
- **R2. Lookahead vs blockhash life.** 150 blocks can exceed 120 s when devnet skips many slots. An honest tx that crosses the due date and lands after 120 s with the on-time amount stays pending: the money moved, but it is not recorded, and there is no refund path. The window is very narrow. Option: quote at now + 180 s, or show the late price in the last few minutes.
- **R3.** The residual N1 race (QR plus button within one poll, or two approvals) is flagged as `duplicatePayments` and not prevented. The UI does not show it yet.
- **R4. Merge with `f2-db`.** Both branches rewrite `/api/pay`, `executePayment` and `sendTokenTransferWithMemo`. After merging, the reference must go through `preparePayment`/`buildSignedTransfer`, and the wallet-payment check must run before the DB claim. Re-run both suites and this probe.
- **Process.** `tests/e2e/b5-solana-pay-attacks.ts` (a qa-owned path) was edited in `cfdbc48`. The edit is correct and was reviewed here. Next time, hand it off instead.

### Evidence

```
$ pnpm test                        (f3-solana-pay worktree, Windows, vitest 5.0.3)
 Test Files  8 passed (8)   Tests  90 passed (90)
$ pnpm exec tsc --noEmit ; pnpm lint     -> clean
$ pnpm exec tsx tests/e2e/b5-solana-pay-attacks.ts      (x3, simulation only, no tx sent)
PASS  tx endpoint refuses account = platform  (got 400 Invalid account)
PASS  tx endpoint refuses account = landlord  (got 400 Invalid account)
PASS  tx endpoint refuses account = agency  (got 400 Invalid account)
PASS  tx endpoint builds for a normal wallet  (200)
PASS  returned tx still needs a signature the server does not hold
PASS  transfer authority is the wallet and the source is its own token account
PASS  simulation (sigVerify on) of the server-signed tx fails and moves nothing  (simulate err="SignatureFailure" custody delta=0 landlord delta=0)
PASS  wallet-signed simulation: custody 0, landlord +rent, wallet -rent  (err=null custody=0 landlord=399000000 wallet=-399000000)
PASS  two tickets for the same slot share the reference
PASS  quote at the due date minus the lookahead is the on-time price
PASS  quote inside the lookahead window is the late price
ALL PROBES PASSED                  (3 of 3 runs)
$ gh run list --branch f3-solana-pay --limit 2
 completed success  B5: Solana Pay transaction request + QR ...  pull_request  37181280485
 completed success  fix(solana): B5 security gate ...             push          37181277440
```

No devnet transactions and 0 live AI calls in this re-gate.
