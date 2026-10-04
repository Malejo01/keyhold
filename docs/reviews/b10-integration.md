# B10 integration gate and B6 re-gate

Reviewer: qa-security-reviewer. I did not write any of this code. Date: Sun 04/10/2026, about 04:20 to 05:10 ART.
Target: branch `integration/overnight` at `c3469bb` (all nine branches merged; CI run 37185379257 green on that SHA: test, typecheck, evals, lint, build, anchor-build).
Inputs read: `docs/reviews/integration-overnight.md` and every `docs/reviews/b*.md`.

## Verdict

| Question | Verdict |
| --- | --- |
| `integration/overnight` as the candidate to replace `main` **after** the recording | **GO.** Three conditions: Production keeps `DATABASE_URL` unset and `NEXT_PUBLIC_SOLANA_PAY` unset (as on this test); the pending README fix from `docs/submission` is re-merged; N6 (the stale README sentence) is fixed in the same pass. |
| B6 re-gate: agency release with `AGENCY_SECRET_KEY` set on a public URL | **GO.** B1 (double release) is closed and verified on devnet. N1, N2 and N3 are closed. One open risk remains, rated **low**: anyone can pre-fund a lease's marker and block its release (R1 below). Fix it before the release stays public for longer than the judging window. |

## Blocking

None.

## B6 re-gate

### What was verified

| Check | Result |
| --- | --- |
| Second release fails atomically on chain | **Yes.** I made one real release through the server (`POST /api/agency/release`, lease `ls_9f7fc4e65e393167` created by this run's phase 0 e2e): 200, signature `3oKdWrSK…7QmzP` ([explorer](https://explorer.solana.com/tx/3oKdWrSKkt5G9My4xjdUjX9HDAN8fYHCfjTQppnpbnWVPoh2t5MifqX6PJeLdBBj1pJsXG25FrAgbmR9LRp7QmzP?cluster=devnet)), memo `lease:v1:ls_9f7fc4e65e393167:release:83474ad0…` (hash only). Then `simulateTransaction` of a second release transaction for the same lease returned `{"InstructionError":[0,{"Custom":0}]}`, log `Create Account: account Address { address: ADXn31dR…, base: Some(4sroL1aF…) } already in use`. Nothing was sent. |
| Pre-check 409 | **Yes.** A second POST for the same lease returned `409 {"error":"Already released: … (its on-chain release marker exists).","explorerUrl":"…/tx/3oKdWrSK…"}`, which links the original release. |
| Race where both instances pass the pre-check | Covered by `lib/agency/release.race.test.ts` (two module registries, barrier, mock cluster rejecting instruction 0). I read the test. It exercises the guard (the author reports it fails when the mock stops rejecting). No real devnet race was run, because the simulation above proves the cluster side. |
| Recovery after a failed send | Correct for money: `release.ts:193-201` re-reads the marker after any send or confirm failure. Our own signature means success. Any other creator, or an already-in-use error, gives 409. Otherwise 502. A retry can never pay twice, because the marker lock is on chain. The test "confirmation timeout that landed" passes. See N2 for message accuracy. |
| Ledger shows every release | **Yes.** `GET /api/agency/leases?lease=ls_44c6adbf21d470c1` (the double release found in the B6 review) returns `deposit_released`, `releases: 2`, `duplicateRelease: true` (`61hV6Z25…`, `5XQZekvP…`). The new lease returns `releases: 1`, `duplicateRelease: false`. |
| N1 forged release memo | Closed. The release check goes through the ledger rule: only transfers authorised by custody count (`ledger.test.ts:67` "forged" case), and zero-amount memos are ignored (`ledger.test.ts:114`). |
| N2 `?lease=` amplification | Closed. A per-IP limiter (20 per 5 min) protects `?lease=` (`app/api/agency/leases/route.ts:52-61`), the limiter has an LRU cap, and negative results are cached. I did not re-measure (2 lookups used). |
| N3 Anchor copy | Closed: "The Anchor program (built and tested, not yet deployed) will enforce this on chain." (`lib/i18n/en.ts:322`, ES equivalent). |

### R1 (open risk): anyone can pre-fund a marker and block that lease's release. Low severity.

`lib/agency/marker.ts:24-34` creates the marker with `createAccountWithSeed`. The System Program refuses to create an account at an address that already holds lamports. The marker address is public: `createWithSeed(custody, "rel:" + sha256(leaseId)[0..24], System)`, where custody is a public key and the lease id is in every memo. A lamport transfer of about 0.00089 SOL (free on devnet) to that address therefore makes every later release of that lease fail.

Shown by simulation only, in one transaction: `[transfer to marker, createAccountWithSeed, token ix]` gives `{"InstructionError":[1,{"Custom":0}]}` "already in use". The same lease without the pre-fund gives `err: null`.

Effects:
- The funds are safe.
- The release of that lease is blocked until custody drains the marker with `transferWithSeed`, and the attacker can re-fund it.
- The response is misleading. `markerState` (`release.ts:81-91`) treats any account at the marker address as "released". The route therefore answers `409 Already released` and links the attacker's funding transaction as the "Original release", while the ledger card still shows "Deposit in custody".

Severity is low for the hackathon. It takes someone who reads the code, it hits one lease at a time, and no money moves.

Cheapest fix (about 10 lines, verified by simulation in `tests/e2e/agency-marker-sim.mts`):
1. Replace instruction 0 with `SystemProgram.transfer(custody → marker, rentExempt(1))` followed by `SystemProgram.allocate({ accountPubkey: marker, basePubkey: custody, seed, space: 1, programId: SystemProgram.programId })`. `allocate` refuses only an account that already has data or a non-system owner, and only the base (custody) can sign it. Pre-funding therefore cannot block it, and a second allocate still fails atomically. Simulated: pre-funded marker + fix gives `err: null`; a second allocate for the same lease gives `{"InstructionError":[3,{"Custom":0}]}` "Allocate: … already in use".
2. In `markerState`, count the marker as "released" only when `info.data.length > 0`.
3. Use a new seed prefix (for example `rl2:`). A lease released with the old space-0 marker has `data.length == 0`, so the old prefix plus the new rule would let it pass the on-chain lock. Leases released before the switch keep relying on the ledger check (`planRelease`, custody-authorised release), as the pre-marker leases already do.

## `/api/pay` after the merge

Code read: `app/api/pay/route.ts`. Order: verify session, `nextPaymentSlot`, in-flight guard, **wallet-payment check (flag on only)**, DB claim, `preparePayment(intent, { reference })`, store the attempt, `submitPayment`, then reconcile on retry. With the flag off, `reference` is `undefined` and the flow is the B3 flow. Without `DATABASE_URL` it is the legacy path, as on `main`.

I ran an ad-hoc PGlite probe (vitest, real migrations, `lib/solana/pay` mocked as in `route.test.ts`, flag forced on, `findValidPayment` mocked as a cluster where a landed button tx carries the slot reference). It was not committed:

| Scenario | Result |
| --- | --- |
| DB, a wallet payment for the slot is already on chain, then the button | 409 "already made with a wallet"; **0 payment rows**, 0 prepares. The check runs before the claim, as the integration review said. This closes its "no database-enabled test" gap (a test should be added, N3). |
| DB, the button's send is ambiguous but landed (502 `pending_confirmation`), then a retry | **409 "This payment was already made with a wallet"**. The pending row stays `pending` forever, and transfers = 1. See N1. |
| No DB, same ambiguous send, then a retry | 502, then 409 "made with a wallet", transfers = 1. With the flag off this case would pay twice (legacy behaviour on `main`), so this is not a regression. |

Double pay via QR plus button with `DATABASE_URL` unset:
- **QR first, then the button:** refused once the QR transaction is confirmed and indexed (the shared reference).
- **Button first, then the QR:** the tx endpoint refuses with 409 (`app/api/solana-pay/tx/route.ts:112`).
- Still open: a QR transaction that is in flight but not yet confirmed while the button is pressed. Both land, and the status route flags the second wallet payment. This race is inherent to Solana Pay and was accepted in B5. It needs the flag on.

No double pay was introduced by the merge.

## Non-blocking

- **N1. With the flag on and a database, the wallet check shadows B3's reconcile.** `app/api/pay/route.ts:108-113` runs before `claimInDatabase`, and the button's own transaction carries the slot reference. So a button payment that landed after an ambiguous send is reported to its own retry as "already made with a wallet". The `payments` row then stays `pending` (no money is lost and nothing is paid twice), and the tenant sees a wrong message. Only reachable with both `DATABASE_URL` and `NEXT_PUBLIC_SOLANA_PAY=1`. Fix: when `findValidPayment` finds a payment, return 200 with `toPaymentResult(intent, found)` applied to the session (as the status route does) and, with a DB, confirm the slot's row. This would also close the integration review's "QR payments are not written to the database".
- **N2. Release error text can overclaim.**
  - `release.ts:196` maps a failed marker read to `exists: false`. Then `release.ts:199` answers 502 "Nothing was released", but a transaction that `sendRawTransaction` reported as failed can still land inside its blockhash window.
  - After a confirm timeout, an RPC node that lags on `getSignaturesForAddress(marker)` gives `originalSignature: null`, and our own landed release is reported as 409 "Already released" with the marker address link.
  - Money is safe in both cases. Suggested wording for the first: "The release may not have completed; check the lease status before retrying (a retry cannot pay twice)".
  - There is no unit test for "send failed, marker absent, 502".
- **N3. Missing tests:** a PGlite test for "wallet-paid slot refused before the claim leaves no pending row" (my probe above can be turned into it); `lang=es` upload (already listed in the integration review).
- **N4. `/api/pay`, `/api/lease` and `/api/verify` have no per-IP limit.** All three existed on `main` before this branch. Every new public route has one: `agency/release` 6 per 5 min, `agency/leases?lease=` 20 per 5 min, `solana-pay/{ticket,tx,status}`, `upload`, and `chat` (cost guard). `/api/pay` sends at most one devnet transaction per slot per session, and sessions come through the rate-limited chat. With the flag on it adds `findValidPayment` RPC reads per call.
- **N5. `x-forwarded-for` is trusted** by both limiters (`lib/agency/ratelimit.ts:115`). This is fine on Vercel and documented in the file. It is not a boundary elsewhere.
- **N6. README:202 is now inaccurate.** It says "`ESCROW_MODE=custodial` … no app code reads it". `lib/agency/release.ts:106`, `lib/agency/dto.ts:84-85` and `lib/solana/solana-pay-http.ts:32` read it (only to disable features in program mode). The second half, "there is no switch to program mode", stays true. Suggested: "only read to disable custodial-only features; there is no program mode".
- **N7. `tests/e2e/uploads.mjs:8` defaults to port 3007.** Always pass `BASE_URL`.
- **N8. On `/es/agency` the queue shows "Bruno (demo tenant)"** (server string). This is already listed in the integration review.
- **N9. The agency list is partial under the public RPC limit:** "Showing the newest 3 of 85 leases", "Still reading 18 older transactions". It converges on refresh. For the recording, open a lease with `?lease=` or wait.

## Security sweep (integrated tree)

| Item | Result |
| --- | --- |
| Secrets in git history (all refs, 88 commits) | `git log -p --all` grep for `SECRET_KEY=[`, 64-number arrays, `AIza…`, `sk-ant-`, `ghp_`, `npg_`, `postgres://user:pass@`, PEM headers: no key material. The only line that matched is a review sentence listing these patterns. The share token `V57aKP…`: **0 occurrences**. Tracked files: only `.env.example` (all values empty or public defaults). `.gitignore` has `.env*` / `!.env.example`. No `target/deploy/*keypair.json` is tracked (`target/` holds only the IDL). |
| Client bundle | `.next/static` has no secret env names, `loadKeypair`, `createHmac` or `getSignaturesForAddress`, and contains **0** of the first 24 characters of `GEMINI_API_KEY`, `SESSION_SECRET` or `PLATFORM_SECRET_KEY` from `.env.local`. The only Client Component import from server-side folders is `import type { QueueSnapshot } from "@/lib/agency/queue"` (type only, erased). |
| PII in memos | Memo builders: `lib/solana/pay.ts` (`lease:v1:<id>:deposit|rent:<n>:<sha256>`) and `lib/agency/memo.ts:57` (`lease:v1:<id>:release:<sha256>`, regex-guarded). Phase 0 asserts "memo has no personal data" on chain for deposit and rent, and my release memo on chain carries only the id and hash. The marker seed is a truncated hash of the opaque id. |
| `proxy.ts` | Matches `/` only. The language comes from a cookie validated by `isLang`, or from Accept-Language. The redirect clones `request.nextUrl` (same origin, query kept), so there is no open redirect. `/api/*` never reaches it. |
| Rate limits on new public POST routes | Present on all of them (see N4 for the routes that already existed). |
| Uploaded documents untrusted | Covered by B7 (GO). The uploads e2e passes, including the poisoned payslip (not approved), the hostile file name, SVG-as-PNG 415, PDF with JS 415, 413 and 400 limits. |

## Evidence

All commands were run in `D:/Programacion/Hackaton/alquilia-wt/integration`.

| Command | Result |
| --- | --- |
| `pnpm test` (vitest ran on this machine) | **26 files, 234/234 passed**, 13 s |
| `REPLAY=1 pnpm evals` | **ALL PASS** (EN/ES orchestrator, lease hashes, lang override and fallback, upload and injection evals) |
| `pnpm exec tsc --noEmit` / `pnpm lint` | clean / clean (also after adding `tests/e2e/agency-marker-sim.mts`) |
| `pnpm build` | ok. `/[lang]`, `/[lang]/agency`, all `/api/*`, Proxy |
| `REPLAY=1 pnpm start -p 3014` (no `DATABASE_URL`, flag off) + `BASE_URL=http://localhost:3014 node tests/e2e/phase0.mjs` | **59/59** in 8 s. Deposit `3X5KgE3A…`, rent `LwF8FwdA…` (lease `ls_9f7fc4e65e393167`) |
| `BASE_URL=http://localhost:3014 node tests/e2e/uploads.mjs` | **ALL PASS** (15 checks) |
| `BASE=http://localhost:3014/en OUT=qa-int-en node run.mjs` (scratchpad `bt/`) | **0 issues**. Ana 1280 light and 375 dark through deposit, verify and rent; Bruno expired payslip; Carla name mismatch. The 375 rent receipt shows "Active lease", 399.00 USDC, -5%, on time |
| `BASE=http://localhost:3014/es OUT=qa-int-es node run-es.mjs` | **0 issues** |
| Headless `/en/agency`, `/es/agency` 1280x900, `/en/agency` 375 dark (`bt/qa-b10-agency.mjs`) | HTTP 200, scrollWidth 1280/1280/375 (no overflow), **0 console errors**, right language, queue (Bruno, Carla), devnet ledger, disclosures. Screenshots: `docs/reviews/b10-integration/` |
| `POST /api/agency/release` x2 | 200 with signature `3oKdWrSK…`, then 409 with the original link |
| `pnpm exec tsx --env-file=.env.local tests/e2e/agency-marker-sim.mts ls_9f7fc4e65e393167` | 5 simulations, **ALL EXPECTED** (see B6 re-gate and R1) |
| Server log (`qa-b10-server.log`) | no error lines. Server stopped; port 3014 free. |

The full demo flow ran once per language here, not 3 times, to limit devnet transactions. The integration author's run on port 3010 is a second independent clean run of the same scripts.

Devnet transactions sent by this review: 11. That is 10 payments from the e2e scripts (phase 0: 2, `run.mjs`: 4, `run-es.mjs`: 4) and **1 release** (B6 budget: 1 of 2 used). The marker checks were simulation only.
Live model calls: **0** (`REPLAY=1` everywhere).
