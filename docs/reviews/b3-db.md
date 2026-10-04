# Review: block B3, persistence and idempotent payments (branch `f2-db`)

Reviewer: qa-security-reviewer. Date: 2026-10-04 (overnight). Scope: commit `05c4564` (`lib/db/**`, `app/api/{pay,lease,chat}/route.ts`, `drizzle/0000_init.sql`, `scripts/{migrate,seed}.ts`, tests). The CI commits in `main..f2-db` were reviewed in `b1-ci.md`.

## Verdict: GO to merge, conditional on keeping `DATABASE_URL` unset

Without `DATABASE_URL` the payment path behaves as on `main` (e2e 59/59, three runs in a row). With a database the double-pay protection holds: the unique constraint decides, including across two instances. Do **not** set `DATABASE_URL` in any environment used for a recording or for judges until B3-1 is fixed. In that mode, one devnet RPC hiccup locks the lease for good.

## Blocking before `DATABASE_URL` is enabled (not blocking the merge)

**B3-1. Errors raised before the transfer is sent are treated as ambiguous, so the slot stays `pending` forever.** `app/api/pay/route.ts:171-172` frees the claim only for `InsufficientFundsError`. Every other error leaves the row `pending`. Several errors are thrown before anything is sent:
- `lib/solana/pay.ts:79`: a missing tenant keypair env.
- `lib/solana/pay.ts:80`: an RPC error such as a 429 or timeout on the balance read.
- `lib/solana/transfer.ts:52`: a `getLatestBlockhash` failure.
- memo or amount validation errors.

Scenario: devnet rate-limits the balance read, the route answers 502, and every retry gets 409 `in_progress`. No code path ever clears the row. The documented recovery is "start a new session". That creates a new lease and a second deposit, so when the first transfer *did* land, the recovery itself makes the user pay twice. This is reproduced in `tests/e2e/b3-attacks.test.ts`, test "a failure before the transfer is sent…" (`it.fails`). Fix options, cheapest first:
- (a) Classify errors. Wrap everything before `sendRawTransaction` so it throws a `NotSentError`, and release on that error.
- (b) Store the tx signature (known after `tx.sign`, before sending) in the pending row. A retry can then call `getSignatureStatuses`. If the tx is not found and `lastValidBlockHeight` has passed, release the row. If it is found, confirm it.
- (c) A reconcile script that searches for the memo `lease:v1:<leaseId>:…`.

(b) also covers the post-send case (`fetchBlockTime` failing after the money moved).

## Non-blocking

- **B3-2. DB errors put bound parameters in the logs.** `lib/db/http.ts:82-83` logs `err.message`. drizzle-orm 0.45 wraps every failed query in `DrizzleQueryError`, whose message is `Failed query: <sql>\nparams: <values>`. So a failed `upsertLease` prints the full contract text, the session id, the property and the tenant label. A failed `recordPrequal` would print the crosscheck evidence. The comment above `logError` promises "never request bodies, sessions". Today the data is simulated and no secret leaks (no connection string), but real tenants would leak PII into Vercel logs. The real cause (`err.cause`, e.g. `23503 foreign key`) is dropped as well. Fix: for `DrizzleQueryError`, log `err.cause?.code` and `err.cause?.message` (the Postgres message does not include params) and leave out `err.message`. Reproduced in `tests/e2e/b3-attacks.test.ts`, test "a failed query does not write bound parameters…" (`it.fails`).
- **B3-3. A lost response cannot be recovered.** The transfer lands and the server records it, but the client never gets the response. Its retry with the old blob gets 409 `already_paid` with no `session`, so the client cannot move on to rent. Safe (no second transfer, see the test "lost response…"), but the client is stuck. Option: on `already_paid` with a confirmed row, return the stored result and a re-signed session.
- **B3-4. "One paid lease per session" is a read-then-write check.** `app/api/pay/route.ts:150` checks it, then the claim runs as a separate statement. Two instances can each pay a deposit for a different lease of the same session (reproduced with two module instances: both requests return 200 and two transfers go out). This is not a money-safety boundary, because anyone can open a new session. Still, the ADR states it as a rule. Option: add `UNIQUE (session_id) WHERE kind='deposit'` by putting `session_id` on `payments`, or soften the ADR wording.
- **B3-5. The "Reload the page" advice for `stale_session` loops.** The message is in `lib/db/session.ts:35` and `app/api/pay/route.ts:145`. `components/ChatShell.tsx` keeps the blob in `sessionStorage`, which survives a reload, and a duplicated tab copies it. A reload restores the same stale blob and gets the same 409. The client should clear `demo.session.v2` on `code: "stale_session"`, or the message should say "Start over / switch tenant".
- **B3-6. `/api/chat` never writes the version.** Only `/api/lease` and `/api/pay` call `touchSession`, so replaying chat blobs between two writes is not detected. Chat moves no money and the cost guard is a separate concern, so this is acceptable. The ADR sentence "the server stores the latest version per sessionId" should say "on lease and pay".
- **B3-7. Fail-open on `/api/chat` and `/api/lease` is acceptable.**
  - Chat moves no money.
  - Lease re-runs `evaluateTenant` on the server and only drops persistence (`lease/route.ts:209-219`). `/api/pay` upserts the lease row again and fails closed (503, tested).
  - `persistLease` ignores the result of `touchSession`. Harmless: the stale check already ran.
- **B3-8. Legacy blobs (no `issuedAt`) have no age limit.** They stay valid until `SESSION_SECRET` rotates. This is intended, so that open tabs keep working. Rotate the secret once the old recording no longer matters.
- **B3-9. PII stored.**
  - `documents` is metadata plus `extracted_fields jsonb`. No code writes it yet. Once it is used, the extracted fields are PII by construction (names, income, CUIL), not "metadata only".
  - `leases.contract_text` holds the tenant display label.
  - `prequal_decisions.issues/crosscheck` hold the compared values.

  All of it is simulated today. Storing it off-chain is allowed, but it needs a retention note before real tenants.
- **B3-10. Wording.** The "stale" branch answers "Already paid" (`route.ts:143`) even when the existing row is still `pending`. Minor.

## Attacks checked and held

| Attack | Result | Evidence |
|---|---|---|
| Replay of an old blob, with DB | 409 (`already_paid` or `stale_session`), 0 extra transfers | `route.test.ts` "replayed pre-deposit blob", "rent replay" |
| Replay of an old blob, no DB | **Pays twice**: documented limitation, covered by a test, stated in AD-11b and logged once at boot | `route.test.ts` "documents the known limitation"; server log line `[db] DATABASE_URL is not set: persistence is OFF…` |
| Concurrent double pay, same instance | 1 transfer | `route.test.ts` (3 parallel requests) |
| Concurrent double pay, **two instances**, same lease | 1 transfer: the unique constraint is the single arbiter | `b3-attacks.test.ts` (4 parallel requests over 2 module instances) |
| Pending row before the transfer | Yes: `claimPayment` INSERT … ON CONFLICT DO NOTHING runs before `executePayment` | `route.ts:97-105` |
| RPC timeout after sending | Row stays pending and the retry gets 409: safe against a double send, but not recoverable (B3-1) | `route.test.ts` "ambiguous failure" |
| Paying for another session's lease | Not possible without forging the HMAC. `leaseId` is 64 random bits, server-generated and inside the signed state | `lease.ts:80`, tamper tests 401 |
| Forged `version` / `issuedAt` | 401: both are inside the HMAC (canonical JSON of the whole state) | `b3-attacks.test.ts` "forged lower version" |
| Clock skew | `issuedAt` is server time; up to +5 min in the future is tolerated; older than `SESSION_MAX_AGE_HOURS` (168) gives 401 | `session.ts:421-431`, `session.test.ts` |
| DB down | Pay 503 with no transfer; chat and lease fail open and log (B3-7) | `route.test.ts` "503", `http.test.ts` "fails open" |
| SQL injection | Every value is bound. The `sql\`\`` templates only interpolate column references. A server-signed `sessionId` of `x'); drop table payments; --` is stored as data | `store.ts`, `b3-attacks.test.ts` |
| Secrets | No connection string is logged (`client.ts`, `migrate.ts`, `seed.ts` print messages only). `.env*` is gitignored, `.env.example` has an empty `DATABASE_URL`. A scan of the diff finds no keys or URLs | see Evidence |
| Client imports of server modules | No `.tsx` imports `lib/db/*`. The only callers are `app/api/*` | `grep` |
| Deposit sentinel | `month_index NOT NULL`, deposit = -1, CHECK ties kind to month, CHECK confirmed ⇒ signature, UNIQUE(signature) | `0000_init.sql:54-59`, `store.test.ts` |
| Migration safety | A single init migration with CREATE TABLE, run by drizzle's journal. No transaction wrapper on neon-http; recovery is documented in AD-11b | `0000_init.sql`, ADR |

## Not covered

- **The Neon path is untested.** No database tonight. All DB tests run on PGlite (same SQL, one connection, no network). Untested:
  - `drizzle-orm/neon-http` behaviour of `onConflictDoUpdate … setWhere … returning`;
  - real concurrent connections (PGlite serialises statements);
  - `pnpm db:migrate` / `db:seed` against Neon;
  - Neon cold-start latency on `/api/pay`, which adds about 6 statements before the transfer.

  Run `pnpm db:migrate && pnpm db:seed` plus the e2e suite against a Neon preview before enabling it.
- The UI with the new 409 codes (B3-5) was not exercised in a browser.
- Rate limit and cost guard on chat: unchanged by B3, not re-tested.

## Evidence

```
$ pnpm test                       (worktree, Windows, vitest 5.0.3)
 Test Files  9 passed (9)   Tests  74 passed (74)
$ pnpm exec vitest run tests/e2e/b3-attacks.test.ts      (x3)
 Tests  4 passed | 3 expected fail (7)                     (same all 3 runs)
 # with `.fails` removed, the 3 fail for the stated reasons:
 #  expected 409 to be 200                                  (B3-1)
 #  expected [ 200, 200 ] to deeply equal [ 200, 409 ]      (B3-4)
 #  '[lease.persist] Failed query: insert into "leases" … params: ls_…,<sessionId>,prop-01,ana,agency-demo,RESIDENTIAL LEASE AGREEMENT (DEMO)…'  (B3-2)
$ pnpm exec tsc --noEmit          -> clean
$ pnpm lint                       -> clean
$ REPLAY=1 pnpm evals             -> ALL PASS
$ pnpm build                      -> ok (routes /api/chat, /api/lease, /api/pay, /api/verify dynamic)
$ REPLAY=1 DATABASE_URL= pnpm start -p 3009 ; BASE_URL=http://localhost:3009 node tests/e2e/phase0.mjs   (x3)
 59/59 checks passed in 6s
 59/59 checks passed in 5s
 59/59 checks passed in 13s
 server log: "[db] DATABASE_URL is not set: persistence is OFF. …" printed once, no other errors
 sample devnet txs: https://explorer.solana.com/tx/DyaEa3tMVFgN9aqyfHWvKSH6EBKXJiitdrjRChJmxsGwjdBjux2Y4r6LcRhFTpTqDafnGYXAgeAqryHoAXFjSqz?cluster=devnet
                    https://explorer.solana.com/tx/3LrT6JFAsV78XAQmk7NErrfM9y7VBRL525Q5QK4YsRz2QVuXhK6JZ2AHSy6XUHTBnDHkBLQYYnc4zZzbfGzebmX9?cluster=devnet
 (server on :3009 stopped after the runs)
$ git diff main..f2-db | grep -iE '^\+.*(postgres(ql)?://|neon\.tech|secret_key|private|keypair|password)'
 -> only comments and the CI throwaway-keygen step reviewed in b1-ci.md
$ git ls-files | grep -iE '\.env|id\.json'   -> .env.example only
```

Live AI calls made by this review: 0 (REPLAY=1 throughout).

## Re-gate (qa)

Reviewer: qa-security-reviewer (did not write the fix). Branch `f2-db` at `c717182`. Date: Sun 04/10 (overnight).

| Decision | Result |
|---|---|
| Set `DATABASE_URL` on a **preview** (Neon branch, devnet) | **GO**, with the conditions below |
| Production `DATABASE_URL` | Not in scope of this gate. Needs the Neon e2e run below first, plus R1 |

Conditions for the preview: run `pnpm db:migrate` (0000 + 0001) and `pnpm db:seed` on a dedicated Neon branch first; set the variable on Preview only (the lead does env changes); run `node tests/e2e/phase0.mjs` against that preview with `E2E_COOKIE` and check the `payments` rows (one confirmed row per slot, `session_id` and `last_valid_block_height` filled).

### B3-1: fixed. Double-spend windows checked

| Release path | Can the released tx still land? | Verdict |
|---|---|---|
| `preparePayment` throws (balance, 429, blockhash, keys, memo) | No. Nothing was serialized out of the process; `sendRawTransaction` is never reached | Safe |
| `recordAttempt` throws, `releaseNotSent` | No. The route returns 503 before `submitPayment`. If the UPDATE actually committed and only the response was lost, the row is deleted and the in-memory tx is dropped unsent | Safe |
| 180 s no-signature release (`releaseStaleUnsigned`) | No. The DELETE requires `signature IS NULL` and Postgres serialises it against the UPDATE. If the original request is still alive (slow prepare) and loses the race, its `recordAttempt` matches `id = <old claim>` and `status = pending`, finds no row, throws, and it never sends. The new claim has a new uuid, so the old request's `releasePayment(oldId)` cannot delete it | Safe |
| Status `failed` (landed with an error) | No. A processed signature cannot be processed again | Safe |
| Status `expired` (unknown and height > lastValidBlockHeight + 40) | Only in R1 below | Safe on devnet; R1 before real money |
| `releaseAttempt` deleting a newer attempt | No. The DELETE is guarded by `id` and the stored `signature` | Safe |
| Recovered path (tx confirmed, response lost before recording) | Reuses the same row id. `resultFromChain` uses the stored amount and the chain `blockTime` | Safe, no second transfer |

Also checked: the blockhash comes from `getLatestBlockhash("confirmed")` and the pending check reads `getBlockHeight("confirmed")`, the same commitment, so `lastValidBlockHeight` and the height compare like for like. The `sendPreparedTransfer` signature-mismatch guard keeps the stored signature authoritative.

B3-2 fixed: `describeError` drops `params:` for `DrizzleQueryError` and logs `cause.code` and `cause.message` only; the former `it.fails` test is a regular test and passes. B3-4 fixed: `payments.session_id` + partial `UNIQUE (session_id) WHERE kind = 'deposit'` (migration 0001), and `claimPayment` uses `ON CONFLICT DO NOTHING` without a target so either constraint yields "not inserted". B3-5 fixed: `ApiError.code` and `resetStaleSession()` clear the blob on `stale_session` in both chat and pay.

### Non-blocking

- **R1. Expiry decision reads two possibly different RPC backends in the wrong order.** `getTransferStatus` (`lib/solana/transfer.ts`) calls `getSignatureStatuses` first and `getBlockHeight` second. Behind the load-balanced public devnet RPC, a status node that lags more than 40 blocks (about 16 s) behind the height node can answer `null` for a tx that already landed. The claim is then released and a second transfer goes out (double pay; the first signature row is gone, so the DB shows one payment). Rare, and test tokens only on a preview. Fix before any real-money use: read the height first with its context slot (e.g. `getLatestBlockhashAndContext("confirmed")`: current height = `value.lastValidBlockHeight - 150`, slot `S1`), then read the status and require `context.slot >= S1` before returning `expired`; otherwise return `pending`. A dedicated RPC (Helius etc.) also shrinks the window.
- **R2.** The race between the INSERT and the follow-up SELECT in `claimPayment` can report `other_lease_in_session` when the conflicting row was released in between. Wrong 409 wording only; the retry succeeds.
- **R3.** B3-3 (lost response with a *recorded* confirmation still gives `already_paid` with no session) and B3-6..B3-10 are unchanged, as agreed.
- **R4. Merge conflict with `f3-solana-pay`.** Both branches rewrite `app/api/pay/route.ts`, `lib/solana/pay.ts` (`executePayment`) and `lib/solana/transfer.ts`. When merging, the Solana Pay `reference` must be carried into `preparePayment`/`buildSignedTransfer`, and the "wallet payment already on chain" check must run before the claim/prepare, not after. Re-run both test suites after the merge.

### Evidence

```
$ pnpm test                       (f2-db worktree, Windows, vitest 5.0.3)
 Test Files  11 passed (11)   Tests  104 passed (104)
 # includes route.test.ts B3-1 cases: pre-send failure frees the claim; signature stored before the send;
 # ambiguous send keeps the claim (in_progress); reconcile confirmed -> receipt, no 2nd transfer;
 # reconcile expired -> release + pay once; on-chain failure -> release; RPC down -> 503 keeps claim;
 # unsigned claim released only after 180 s; recordAttempt failure frees the claim; B3-4 constraint
 # and tests/e2e/b3-attacks.test.ts (formerly 3 x it.fails) all green
$ gh run list --branch f2-db --limit 2
 completed success  B3: Drizzle persistence + idempotent payments ...  pull_request  37180144101
 completed success  fix(pay): release the claim on pre-send errors ...  push          37180141896
```

No devnet transactions and 0 live AI calls in this re-gate.
