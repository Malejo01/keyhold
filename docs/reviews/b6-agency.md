# B6 security review: agency panel (`/agency`, `/api/agency/*`)

Reviewer: qa-security-reviewer (did not write this code). Date: Sun 04/10/2026, ~03:20-03:40 ART.
Scope: `git diff origin/ci/setup..f2-agency` at `1a98eea`: `app/agency/**`, `app/api/agency/**`, `components/agency/**`,
`lib/agency/**` (incl. `match.ts`), the memo comment in `lib/contracts.ts` (`lease:v1:<id>:release:<sha256>`), Hero link.

## Verdict

| Question | Verdict |
| --- | --- |
| Merge `f2-agency` | **NO-GO as is.** Becomes GO when B1 is fixed, **or** when it is merged with release switched off in Production (no `AGENCY_SECRET_KEY` in the Production env, so `releaseAvailable=false` and the route answers 503). The read-only panel and the queue are fine to merge. |
| Expose `/agency` on a public URL with release enabled | **NO-GO** until B1 is fixed. N1 and N2 should be fixed in the same pass (both are small). |
| Expose `/agency` read-only (release disabled) | **GO**, with N2 recommended. |

## Blocking

### B1. A deposit can be released twice: the idempotency check is not atomic across instances (demonstrated on devnet)
`lib/agency/release.ts:54,87-92` and `lib/agency/chain.ts:239`. The only guards are an in-memory `inFlight` Set (one per
process) and a read of the signature list ("is there a release memo yet?") done before sending. Two requests served by
two instances (normal on Vercel under concurrent load), or a retry after a confirm timeout that still lands, both read
"no release memo", both pass the balance check, and both send. The custody wallet then pays the deposit twice, taking the
second payment from other leases' deposits.

Reproduced with one request through the running server (port 3012) and one direct `releaseDeposit()` call from a
second Node process, started together (script: scratchpad `b6-race.mts`):

```
A (server): 200 signature 61hV6Z25ZN3WnUFrcxqbTr1iKxQ3aStvKedLXnMVn4sar2uSoDBsWebB7dLibuz5zTXQdMcPBoFbisc8PZTqGLHW
B (direct): ok  signature 5XQZekvPdvaMKpQixrvCjX3kmv5heZ2vUw94e4nG5TsGPVDe1kMs5MPfewaEFiMgRKwjrV1mksLXmk1Zo692g46B
```
Independent check with `getTransaction` (jsonParsed) on public devnet: both `err: null`, both
`420000000 -> 4ntL3beX…` (Ana's ATA), memos `lease:v1:ls_44c6adbf21d470c1:release:b265f5ef…` and `…:release:97ac5377…`.
Lease `ls_44c6adbf21d470c1` had one 420 USDC deposit; 840 USDC left custody.
- https://explorer.solana.com/tx/61hV6Z25ZN3WnUFrcxqbTr1iKxQ3aStvKedLXnMVn4sar2uSoDBsWebB7dLibuz5zTXQdMcPBoFbisc8PZTqGLHW?cluster=devnet
- https://explorer.solana.com/tx/5XQZekvPdvaMKpQixrvCjX3kmv5heZ2vUw94e4nG5TsGPVDe1kMs5MPfewaEFiMgRKwjrV1mksLXmk1Zo692g46B?cluster=devnet

Making it worse, the panel hides the duplicate: `lib/agency/ledger.ts:155` keeps only the earliest release, so the card
shows "Released: 420.00 USDC to the tenant" (screenshot `b6-agency/qa-leases-1280-light.png`), while the explorer for the
custody wallet shows two. `PLAN.md:138` states "A lease has at most one release memo; the panel refuses a second one",
which is now false on chain. For a product whose pitch is honesty about custody, that inconsistency is what a judge
clicking through the explorer would find.

Same-instance protection does work (two concurrent requests to one server: second gets `409 A release for this lease is
already in progress`), and a later sequential attempt is refused (`409 … a release memo exists on chain`).

Fix (recommended, about 20 lines, no new infra): make the release transaction itself fail the second time. Add, in the
same transaction, `SystemProgram.createAccountWithSeed` from the custody wallet with
`seed = "rel" + sha256(leaseId).slice(0, 29)` (max 32 chars), `space 0`, rent-exempt lamports, owner System Program.
The address is deterministic per lease, so a second release transaction fails atomically ("account already in use")
whatever instance sends it and whatever the RPC lag. Cost about 0.0009 devnet SOL per release. Keep the memo check as the
fast path for a friendly 409. Also make the ledger show every release transaction for a lease, or at least flag
`releases > 1` instead of hiding it. Add a unit test for the seed derivation, and re-run this race to confirm the
second transaction fails.

## Non-blocking (recommended before a public URL)

### N1. Anyone can block a lease's release with a forged release memo (griefing)
`lib/agency/chain.ts:239` counts any `lease:v1:<id>:release:<hash>` memo seen on the custody token account, without
checking who sent it (by design: "refusing is the safe side"). Any wallet can create its own tUSDC ATA and send a
0-amount `transferChecked` to the custody ATA with that memo; the transaction then appears in `getSignaturesForAddress`
for the custody ATA. Result: the panel shows "Deposit in custody" with a Release button (the ledger correctly ignores the
forged release because its transfer is not authorised by custody), and the route answers 409 "already released".
The same trick can fill the "newest 12 leases" window with junk lease ids (`newestLeases` in `chain.ts` counts any
parseable memo), pushing real leases out of the default list. Not sent on devnet (tx budget); analysis only.
Fix: for idempotency, count only release transactions whose transfers are all authorised by the custody wallet (the
ledger rule at `ledger.ts`, release branch); refuse with 503 when such a transaction cannot be read yet. With B1's
seeded account the on-chain lock becomes the source of truth anyway. For the list, ignore lease ids whose deposit is
not from a demo tenant wallet or has amount 0.

### N2. `/api/agency/leases?lease=<random>` is unthrottled and amplifies RPC calls
`app/api/agency/leases/route.ts:8` and `lib/agency/chain.ts:131,148,261`. Each unknown lease id pages up to 6 pages on
each of 2 accounts (up to 12 `getSignaturesForAddress` calls plus retries), is not rate-limited, bypasses the cache (key
is the id) and evicts the oldest cache entry, which can be the shared `"*"` snapshot. Measured: one random id took
1.66 s and returned 200 with an empty list. A loop of random ids from one client would get the server's IP rate-limited
by public devnet, which also breaks `/api/pay` and the release route for everyone during judging. Fix: reuse the per-IP
limiter from the release route for `?lease=`, cache negative results, and never evict `"*"`.

### N3. The UI overstates the Anchor program
`components/agency/AgencyLeases.tsx:147`: "The Anchor program (in progress) enforces this on chain." No program exists in
the repo yet (`programs/` absent, toolchain undecided per `PLAN.md`), and the present tense reads as if it enforces
today. Suggested copy: "Simulated 2-of-3 approval: the demo server holds all three keys and anyone using this demo can
approve. A planned Anchor program would enforce 2-of-3 on chain." The rest of the disclosure is accurate: the server
holds all three keys, the ed25519 approvals are verified and then discarded (they are not on chain), and the release
transaction is signed only by the custody wallet. The "tenant" approval is chosen by whoever opens the panel; the pitch
must not say the tenant approved.

### N4. The queue forces replay by mutating `process.env.REPLAY` globally
`lib/agency/queue.ts:39`. Correct for the queue (no model calls; verified, the queue served from recordings), but during
that window any concurrent `/api/chat` request on the same instance also runs in replay mode and can fail with
`ReplayMissError` for live-only input. The window is short and happens once per instance (the result is cached), so the
risk is low. Cleaner: pass a replay option down to `evaluateTenant`, or use `AsyncLocalStorage`.

### N5. Smaller items
- Rate limit key (`app/api/agency/release/route.ts:25`) trusts `x-forwarded-for`. On Vercel the edge sets it; on any other
  host it is client-controlled (locally, changing the header bypassed the 6 per 5 min limit). The `hits` Map has no size
  cap. Acceptable for Vercel-only.
- Reason hash (`lib/agency/release.ts:109`) is unsalted sha256 of short free text, so it can be guessed by dictionary. The
  UI already says "Do not type personal data"; consider hashing `reason + nonce` and keeping the nonce off chain if the
  hash never needs public verification.
- On time is inferred from the amount (`lib/agency/ledger.ts:164`, discount >= 500 bps) assuming list rent = deposit. The
  card says so plainly ("On time is inferred from the amount…"), which is honest. It would be wrong for a contract
  whose deposit differs from one month of rent; fine for the current template.
- `?lease=` paging stops at the first page containing the lease, so for a very old released lease the deposit can be on
  a later page and the card can show "No deposit seen". Cosmetic; the release route still refuses (safe side).
- A confirm timeout after `sendRawTransaction` (`release.ts:155`) returns 502 "could not be completed" although the
  transaction may still land; with B1's on-chain lock a retry is safe, without it a retry can double-release.

## What was checked and is fine
- **Who can drain custody, and where can funds go.** Recipients are derived on the server: the tenant is the demo key
  whose public key equals the deposit transfer's authority, and the landlord is `LANDLORD_SECRET_KEY`. The client sends
  only `leaseId`, two amounts, `reason`, and `approver`, and the body schema is `z.strictObject`. Probes: an extra
  `recipient` field gives 400 "Unrecognized key"; `toTenant=-1` gives 400; `approver=agency` gives 400.
- **Amounts.** The split must add up to exactly the earliest on-chain deposit amount: 420000001+0 and 1+1 give 422. There
  is no release without a deposit: a forged or unknown lease id gives 404. A deposit "paid" by a non-demo wallet gives
  409 (the payer lookup fails), so a forged deposit memo cannot make custody pay a stranger.
- **Ledger integrity.** Releases count only when every transfer is authorised by custody out of the custody ATA. Deposits
  and rents need a matching destination. `match.ts` pairs out-of-order JSON-RPC batch results by the transaction's own
  signature, so amounts cannot cross between leases, and `match.test.ts` covers it.
- **Memo PII.** The release memo is `lease:v1:<id>:release:<64 hex>` (`buildReleaseMemo` rejects anything else). The
  reason is hashed and never logged or stored. `logError` receives only the error. The UI renders only parsed memo fields.
- **RPC 429 handling.** Reads use a connection with `disableRetryOnRateLimit`, plus paced chunks, a 9 s budget and
  bounded retries. The release returns 503 when the deposit transaction cannot be read, and a stale snapshot is served
  when a refresh fails. The panel shows "Still reading N older transactions (RPC rate limit)" and keeps refreshing up to
  8 times.
- **Cache.** Keys are a regex-validated lease id or `"*"`, and the data comes only from the chain. No user input reaches
  the cache other than the id (see N1 and N2 for the chain-spam and eviction angles).
- **Client/server boundary.** Client components import only types from `lib/agency/dto`/`queue` plus the pure
  `lib/agency/units`. `grep -rlE "AGENCY_SECRET_KEY|PLATFORM_SECRET_KEY|loadKeypair|getSignaturesForAddress" .next/static`
  found nothing. `releaseAvailable` exposes only a boolean.
- **Secrets.** No key material in the diff (the `SECRET_KEY` hits are `.env.example` names and `Keypair.generate()` in
  tests). `git ls-files` shows only `.env.example`.
- **Copy.** All UI copy is in English (headless scan for Spanish UI words found none). The custodial escrow, simulated
  tenants and simulated 2-of-3 are each disclosed on the page.

## Evidence

| Check | Result |
| --- | --- |
| `pnpm test` (vitest ran on this machine this time) | 13 files, **73/73 passed** |
| `pnpm exec tsc --noEmit` | clean |
| `pnpm lint` | clean |
| `pnpm build` | ok; `/agency`, `/api/agency/{leases,queue,release}` dynamic |
| `REPLAY=1 pnpm start -p 3012` + `BASE_URL=http://localhost:3012 node tests/e2e/phase0.mjs` | **59/59 passed** in 6 s; deposit `GZDE6BWE…`, rent `pAeJZ5AH…` (2 devnet txs from the e2e itself) |
| Release probes (no tx) | 404 unknown lease, 422 over/under split, 400 extra field / negative / approver=agency, 429 on the 7th request from one IP, 409 same-instance concurrent, 409 after release |
| Race (2 extra devnet txs, the budget) | **double release**, see B1 |
| Headless Chrome `/agency` 1280x800 light, 375x812 dark (scratchpad `bt/qa-b6.mjs`, `qa-b6b.mjs`) | HTTP 200, no horizontal overflow (scrollWidth 1280 / 375), 0 console errors, queue shows Bruno (expired payslip) and Carla (name mismatch) with rule and compared values, lease cards render from devnet, disclosures present, release form opens (not submitted). Screenshots: `docs/reviews/b6-agency/qa-*.png` |
| Server stopped after the run | port 3012 free |

Live model calls by this review: **0** (server ran with `REPLAY=1`; the queue forces replay).
Devnet transactions by this review: 2 (the race), plus 2 from the phase0 e2e.
