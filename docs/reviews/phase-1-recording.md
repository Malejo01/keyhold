# Phase 1 review: recording readiness + F1-04 compliance

**Verdict: NO-GO as written, GO after one doc fix.** The code on `f1-recording-ready` is sound. Rent cannot be paid before the deposit through the API, an old card or a stale session, and the e2e passes 59/59 twice in a row against localhost. The demo script has one step that does not match the app (B1). If the product team follows it literally, the deposit card never appears and the take fails. Fix B1 (a two-line script edit, or the small code change described under B1), deploy, and run the e2e once against production. If that passes, the verdict is GO with no other changes.

Reviewer: qa-security-reviewer (dev agent). Date: 2026-10-03/04 (ART night before recording).
Target: `http://localhost:3000` (dev server on branch `f1-recording-ready`, live Gemini, real devnet payments). Production was **not** tested because the branch is not deployed yet.
Diff reviewed: `git diff main..HEAD` (5 commits, `40a5ad6..cb43f63`, 23 files).

## Preconditions before recording (not issues, but required)

1. Deploy this branch to production. The production build on `main` still offers deposit and rent together. Running `node tests/e2e/phase0.mjs` (it defaults to `https://keyhold-app.vercel.app`) before the deploy **fails** on "only a deposit card after the contract". That failure is expected.
2. After the deploy, run `node tests/e2e/phase0.mjs` once against production and check for 59/59. Then do one practice run in the browser (the script already asks for this).

## Blocking issues

### B1. Demo script step 1:35 to 1:50: clicking "Generate the contract" on the card shows no deposit card

- Script: `docs/submission/demo-script.md:26-28`. Step 1:20 shows the pre-qualification card's **button** "Generate the contract". Step 1:35 says "Click **Generate the contract**" and expects "Below it one card, 'Security deposit', 420.00 USDC". Step 1:50 says "Do **not** click the chip 'Pay the deposit'".
- Code: the card button calls `generateContract` → `POST /api/lease` (`components/cards/CardRenderer.tsx:33-35`, `components/ChatShell.tsx:191-216`). The handler appends **only** `{ type: "contract" }` with the text "Your contract is ready. Read it through before you pay the deposit." (`ChatShell.tsx:201-205`). `/api/lease` returns `{ lease, session }` and no payment cards (`app/api/lease/route.ts:46-49`).
- Only the **chip** "Generate the contract" goes through `/api/chat` → `handleContract`, which returns contract + deposit card. I confirmed this in replay mode: `ana chip Generate -> PAYMENT contract,payment:deposit`.
- Failure scenario: the presenter clicks the prominent card button, as steps 1:20 and 1:35 suggest. The contract appears with no deposit card. The script forbids the only control that brings the card up (the "Pay the deposit" chip, which is also the highlighted one at that moment). The take stalls at 1:50.
- Fix, pick one:
  - (a) **Doc only, about 5 minutes, owner submission-writer.** Rewrite steps 1:35 and 1:50. Click the button "Generate the contract" on the card. Then click the highlighted chip **Pay the deposit**: the chat replies "Deposit: 420 USDC, held in the demo custody wallet (no discount)..." and the "Security deposit" card appears. Then click **Pay deposit · 420.00 USDC**. Delete the "Do not click the chip" sentence. Re-time the step (+1 chat turn, about 3 s).
  - (b) **Code, owner ui-motion-engineer or fullstack-engineer.** Make the card button take the chat path, e.g. `onGenerateContract: () => void send("Generate the contract")`. This reuses `handleContract`, which re-runs approval on the server and returns contract + deposit card. Alternatively, have `/api/lease` return `paymentCards(next)` and render them. Then the script works as written. Re-run the e2e after the change.

## Non-blocking issues

1. **The highlighted "next step" chip is wrong after the deposit.** `components/ChatShell.tsx:18-26` maps `PAYMENT → 4` ("Pay the deposit"). The stage stays `PAYMENT` after the deposit, so "Pay the deposit" stays highlighted while rent is due. `demo-script.md:30` says "Pay my first rent (it is highlighted as the next step)", which is not true. Both chips return the rent card after a deposit (`handlePayment` serves the next pending payment), so the flow still works. On camera, though, the user bubble would read "Pay the deposit" right after the deposit receipt. Fix: base the highlight on payments (deposit paid → index 5), or drop "(it is highlighted...)" from the script. In `ACTIVE` the highlight also stays on "Pay my first rent", which is already paid.
2. **Chat and payment can race and drop a confirmed payment from the client session.** The input and chips are disabled only while a chat is pending (`ChatShell.tsx:343, 381`), not while a payment is confirming (about 4 s). If a chat request is sent during "Confirming your payment…" and its response lands after the pay response, `applySession` (`ChatShell.tsx:142`) overwrites the post-payment session. The deposit then disappears from client state, the rent card locks again ("Available after the deposit is paid.") and the chat offers the deposit again. Paying it would send a **second real deposit**, because the server trusts the signed blob (same root cause as phase-0 non-blocking issue 1, scheduled for Debate B). For tomorrow, add one line to the script: "Do not type or click anything while 'Confirming your payment…' is shown." Code fix: disable chips and input while a payment is processing.
3. **The script does not say which receipt to open on the explorer.** `demo-script.md:31` says "On a receipt click View on explorer" and expects the memo `...:deposit:<sha256>`. The newest receipt is the rent one, whose memo is `lease:v1:<id>:rent:0:<sha256>`. Say "on the **deposit** receipt", or accept either memo in the voice-over.
4. **Accessibility of the new hints.**
   - The locked rent button uses `disabled` together with `aria-describedby` (`components/cards/PaymentCard.tsx:171-185`). Disabled buttons are skipped by Tab, so keyboard and screen-reader users tabbing through never hear "Available after the deposit is paid." Consider `aria-disabled="true"` plus a no-op click, so the button stays focusable.
   - The id `pay-hint-rent` is per kind, not per card, and could repeat if a restored chat holds two locked rent cards. Same for the pre-existing `verify-hint` in `ContractCard.tsx`.
   - The next-step chip is marked only by colour (`ChatShell.tsx:346-354`; WCAG 1.4.1). Add visually-hidden text such as "(next step)" or `aria-describedby`.
   - The typing indicator now has `role="status"`. Good.
5. **Cosmetic.** `ChatShell.tsx:244` has `const personaName =PERSONAS` (missing space). `PaymentCard.tsx:106-126` has `{isRent && (` with the `<ul>` block not indented. Neither breaks lint or the build.
6. **Judge-facing TODOs remain.**
   - `README.md` has 8 (`:10` video link, `:152`, `:156`, `:166`, `:167`, `:204`, `:205`, `:222`).
   - `docs/submission/*.md` has 15, mostly form fields for humans.
   - `docs/submission/pitch-script.md:151` is stale: it says the demo 0:00 line repeats the problem, but it no longer does.
   - `docs/submission/preselection.md:106` says `evidence.md` "does not exist yet". It now exists, with no entries.
   - Close or consciously leave these before the form (`preselection.md:120` already lists this).
7. **Spanish internal docs in the public repo.** `docs/01-spec-mvp.md`, `docs/02-hackathon-rules-market-judges.md` and `docs/kit/*` are in Spanish. `docs/02` §6.3 also profiles the judges. These files are not judge-facing deliverables, but judges browsing the repo will see them. Consider a one-line README note ("docs/01, docs/02 and docs/kit are internal planning notes in Spanish"), or moving them out of the public tree.
8. **`docs/validation/agencies-salta.md` lists public business contacts** of 15 Salta agencies (phones, emails, addresses taken from their own sites). This is business data, not personal data, and nobody is claimed as contacted. It is fine as-is, but the agencies will be able to read it once the repo is public. The file already says to log people by role only.
9. **Known from phase 0, still open.**
   - Replayable signed session: a pre-deposit blob can pay the deposit twice. The new rule does not change this. A pre-deposit blob **cannot** pay rent (409).
   - `pnpm test` cannot start on this machine (rolldown native binding is blocked).
   - The rate limit is per warm instance.

## Evidence

### Code review: can rent still be paid first?

| Path | Result | Where |
|---|---|---|
| Direct `POST /api/pay {kind:'rent'}` before the deposit | **409 "Pay the deposit first."**, no tx sent | `app/api/pay/route.ts:58`; e2e check below |
| Old message card (a rent card from a pre-deploy `sessionStorage` chat, key unchanged `demo.session.v2`) | Client: button disabled while `depositSecured` is false (`PaymentCard.tsx:49, 173`, fed from the session's payments in `CardRenderer.tsx:56`). Server: 409 anyway | |
| Stale session (any blob signed before the deposit) | 409. `payments` come only from the signed blob, and only `applyEvent` after `executePayment` adds to them | `route.ts:58`, `orchestrator.ts:333-350` |
| Forged blob (payments or stage edited) | 401 (HMAC) | e2e "tamper" checks |
| Chat "Pay my first rent" before the deposit | "The deposit comes first." + deposit card only | `orchestrator.ts:418-424, 473-506`; e2e + evals |

Stage transitions: `ACTIVE` is still reached only when both a deposit and a rent receipt exist (`orchestrator.ts:346-348`). The rent quote and the pay route use the same month index and the same `addMonthsTs(dueTs, month)` (`orchestrator.ts:58`, `lease.ts:126`). No regression was found in `SEARCH → … → ACTIVE` (evals and e2e stage traces below). Error path: the 409 message reaches the card through `api-client.ts:43-49` and shows under "Try again".

### Commands and output

```
node tests/e2e/phase0.mjs   (BASE_URL=http://localhost:3000)
  run 1: 59/59 checks passed in 74s   (several 429s on /api/chat, honoured Retry-After)
         deposit https://explorer.solana.com/tx/4vVv4wc6vD1Z3bcpCzuzdWX6AEQavv6U3zNK22Bp1wFFeBt2X2N4GWFh68sE7aFcHgV3AhmxUF6RXniHDyYjX1dx?cluster=devnet
         rent    https://explorer.solana.com/tx/4vxsaHZGXK653WgHEZF4obyajcM5rfZEH7WNLpXepQRNn8j8SUGvLzBYpsxDdMZBgjdeRnXwXcMmymNLqc9JVFDh?cluster=devnet
  run 2: 59/59 checks passed in 17s
         deposit https://explorer.solana.com/tx/5bgiWNYk4appWeeVh3AnybxDhyAJ8uunvmZUTbqk55iEU36Dt3gAEWfowZP18zqZPUddRoN8zQ4wM8HHzhPU4Zcu?cluster=devnet
         rent    https://explorer.solana.com/tx/FNHUhhvAgpa3TPV5fQbXjMoD8Q12qcxFxM6s3xwPGrpDv79J5L4D5FTc4CCeR2v2vsUjhFDzmjCjf3gserZKnzU?cluster=devnet
  new/changed checks (both runs PASS):
    ana: only a deposit card after the contract  (deposit)
    ana: POST /api/pay rent before deposit -> 409  (got 409 {"error":"Pay the deposit first."})
    ana: chat "Pay my first rent" before deposit offers only the deposit  (200 cards=deposit)
    ana: after deposit the chat offers only the rent card  (200 stage=PAYMENT cards=rent)
  memos: lease:v1:ls_df03033fafc90f35:deposit:42a750d4…  /  lease:v1:ls_df03033fafc90f35:rent:0:42a750d4…
         on-chain memo == API memo, no names/emails/DNI-like numbers, amount and blockTime match, meta.err null

pnpm evals   (Mode: live, gemini-3.5-flash-lite)  -> ALL PASS (7 checks), incl.
  PASS orchestrator: deposit before rent  (The deposit comes first. Deposit: 420 USDC, held in the demo custody wallet (no discount)... | Deposit received. First month's rent: 420 USDC list price, 399 USDC ... (5% off).)
pnpm build   -> compiled, TypeScript OK, 8 routes
pnpm exec tsc --noEmit -> exit 0
pnpm lint    -> no findings
pnpm test    -> cannot start: "Cannot find native binding" (rolldown), known environment limit
anchor test  -> not present (no program yet)
```

Replay-mode check of the exact script messages, with a scratch tsx script and `REPLAY=1` calling `runTurn` as production does:
- Bruno, Carla and Ana each sent "2-bedroom near Tres Cerritos, under 500 USDC, pets ok", then "Book a visit for Bright 2-bedroom apartment near Tres Cerritos park", then "Upload my documents".
- All were served from recordings, with no replay miss. First card: "Bright 2-bedroom apartment near Tres Cerritos park". Bruno got `NEEDS_INFO/prequal`, Carla `NEEDS_INFO/crosscheck`, Ana `APPROVED/prequal`.

Devnet funds after the runs: one tenant-side token account holds 989,547 tUSDC, the other 7,113; the fee payer holds 4.99 SOL. That is enough for hundreds of takes. The phase-0 blocker (funds running out) does not recur.

### Demo script vs code (every quoted label)

Found verbatim:
- banner "Demo · Solana devnet · simulated data" (`app/layout.tsx:33`)
- "Lease timeline"
- the six chip labels (`components/types.ts:19-26`)
- "Book a visit" (`PropertyCards.tsx`)
- "More information needed", "Approved", "First review", "Cross-check", "Discrepancy found", "Independent cross-check found a discrepancy", "Name does not match", "All checks passed, and the independent cross-check agrees." (`PrequalCard.tsx`)
- "Contract fingerprint (SHA-256)", "Verify", "Available after the deposit is paid.", "Match: this is the contract you paid against" (`ContractCard.tsx`)
- "Security deposit", "Pay deposit · 420.00 USDC" / "Pay rent · 399.00 USDC" (template `${action} · ${amount} USDC`), "Confirming your payment…" (`PaymentCard.tsx`)
- "Deposit payment confirmed.", "Rent payment confirmed." (`ChatShell.tsx:184`)
- "Payment confirmed · Deposit/Rent", "View on explorer" (`ReceiptCard.tsx`)
- "Deposit received. First month's rent", "The deposit comes first." (`orchestrator.ts`)
- "Active lease" (`stages.ts`)
- property title and 420 USDC (`seed/properties.json`)
- 120-day payslip (2026-06-05 → reference date 2026-10-03)
- "Camila" vs "CARLA BEATRIZ" (seed docs)
- discounts −3% / −2% (300 + 200 bps, `formatBps`)
- rate limit of 30 per 5 min (`app/api/chat/route.ts`)

"First review: Approved" and "Cross-check: Discrepancy found" are label/value pairs on two lines, not literal colon strings. That is fine for a presenter.

Mismatches: B1 (no deposit card after the card button; "do not click the chip"), non-blocking 1 ("Pay my first rent ... highlighted"), and non-blocking 3 (which receipt to open on the explorer).

### F1-04 compliance

| Item | Status | Evidence |
|---|---|---|
| English where judges look | OK for README, UI, submission docs and commits on this branch. Internal docs in Spanish: see non-blocking 7 | grep over `git ls-files *.md`; no Spanish UI strings in `app/` and `components/` (fixtures excluded) |
| README Disclosures: pre-existing code | OK: "Pre-existing code imported so far: none." No `chore(import)` commit in `git log` | `README.md:193` |
| README Disclosures: Claude Code | OK: "co-written with Claude Code (AI-assisted)" | `README.md:194`; also `preselection.md:82` |
| Product model is Google Gemini | OK | `README.md:185, 194`; `preselection.md:39-42`; script "Do not say ... Claude is the product's model" |
| Custodial escrow stated | OK: README intro, status and "Current status"; preselection description; pitch 0:43; demo 2:45 and the "Do not say trustless" list. The positioning line no longer claims trustless escrow | `README.md:5, 16, 91-99` |
| No invented traction | OK: README "None is claimed"; `gtm.md:3` "no users, no pilots, no LOIs, no interviews held"; `evidence.md` "No entries yet"; `agencies-salta.md` "Nobody has been contacted yet"; pitch "We have no users yet" | grep for users, pilot, LOI, revenue, partner, interview |
| Secrets, keypairs, `.env` | OK: `git ls-files` shows only `.env.example`; the diff mentions env var **names** only; history grep for `AIza…`, `sk-ant-`, `SECRET_KEY=` with values and 64-number arrays finds no hits | commands in Evidence |
| PII in the diff or in memos | OK: the memo format is unchanged and the on-chain memos of 4 new txs have no PII (e2e). The diff only adds public business contacts for agencies (non-blocking 8) | |
| Repo access for `hackathon@superteam.ar` | OK: `gh repo view Malejo01/keyhold` → `"visibility":"PUBLIC"`, so no share is needed. `preselection.md:63` still has a TODO to confirm this; it can be closed. Remember `hackathon@colosseum.com` only if the repo ever goes private | |
| CHANGELOG entry for the day | OK: 8 entries for this work | `CHANGELOG.md` week 1 |

### Test change made in this review (owned path)

`tests/e2e/phase0.mjs` now encodes the deposit-first rule:
- The old check "two payment cards" was replaced by "only a deposit card after the contract".
- New check: `POST /api/pay` with `kind=rent` before the deposit returns 409.
- New check: the chat answers "Pay my first rent" before the deposit with "The deposit comes first" and the deposit card only.
- New check: after the deposit, the chat offers exactly one rent card in `PAYMENT`, and the rent is paid with that chat-returned session.
- Check count: 56 → 59.

## Not covered

- **Production.** The branch is not deployed yet. Production runs `REPLAY=1`; I emulated that with `runTurn` under `REPLAY=1` for the script's messages only, not through the HTTP routes.
- **A real browser.** I made no clicks, so the following were not seen: the B1 button path in the UI (the conclusion comes from code), chip highlighting, the mobile chip scroll, reduced motion, the 375 px layout and focus order. The lead's CDP run in the CHANGELOG is not my evidence.
- **The full flow 3 times in a row.** Only 2 runs, as the lead asked for one or two to save devnet funds. Both passed.
- **Unit tests.** vitest is blocked on this machine.
- **Disclosure scope.** Whether `.claude/agents/*` or prompts were derived from Mauro's other projects (out of scope for this diff; those repos are read-only and were not opened). Disclosures currently say no code was imported.
- **The pitch video.** Only its script was reviewed.

## Addendum: re-check after 65f2582 and 6a3e96b

**Updated verdict for recording: GO, on one remaining condition.** Production is still waiting for the deploy of this branch. After the deploy, `node tests/e2e/phase0.mjs` (default target `https://keyhold-app.vercel.app`) must pass once against production, followed by one practice take in the browser. Until that happens, production still serves the old flow (deposit and rent offered together), and the updated e2e fails against it.

**B1: closed (verified in code).** The PrequalCard button "Generate the contract" now calls `generateContract` (`components/ChatShell.tsx:216`). That function now runs `send("Generate the contract")` (`ChatShell.tsx:193-205`), the same `/api/chat` → `handleContract` path the chip uses. That path re-runs approval on the server and returns the contract card plus the deposit card (confirmed earlier in replay mode: `PAYMENT contract,payment:deposit`). `ChatShell` no longer calls `api.lease`. Double clicks are covered: `generatingRef`, the `pending` guard in both `generateContract` and `send`, and `onClick` unset while generating. The button disappears once the session has a lease (`CardRenderer.tsx:33`). I did not click through it in a browser myself; the lead's headless-Chrome run following the script (card button, 1280 px light and 375 px dark) is the UI evidence.

**Non-blocking issues, status after these commits:**
- 1 (wrong chip highlighted after the deposit): fixed. In `PAYMENT` with a deposit paid, the highlight moves to index 5, "Pay my first rent" (`ChatShell.tsx:222-226`). In `ACTIVE` it still highlights that already-paid chip; this is cosmetic.
- 2 (chat/payment race): mitigated in the script only. Steps 1:50 and 2:15 now say "While it says 'Confirming your payment…', don't click or type". The code still lets a chat request go out while a payment is confirming. Fix this in F2 together with session replay.
- 3 (which receipt): fixed. Step 2:30 now names the deposit receipt.
- 4 (a11y): mostly fixed. The locked Pay and Verify buttons and the busy Generate button now use `aria-disabled` and stay focusable, with no click handler while locked. Styling covers `aria-disabled:` (`components/ui.tsx:15, 18`). Still open: per-kind duplicate ids, and the next-step chip marked by colour only.
- 5 (cosmetic): `ChatShell.tsx:93` adds another missing space (`const chipsRef =useRef`).
- 6-9: unchanged.

**Evidence for this addendum:**
```
git log --oneline -4   -> f1bf6cb test(e2e)…, 6a3e96b docs(submission)…, 65f2582 fix(ui)…, cb43f63
BASE_URL=http://localhost:3000 node tests/e2e/phase0.mjs   -> 59/59 checks passed in 211s (exit 0; 429s on /api/chat honoured)
  deposit https://explorer.solana.com/tx/4zi1J5f3vAT4kcyWnVQVeHVXQwzreDQ4Hc9QBLpe5jiJaXM1xWdkHmZxgezSnnoQctsNYeT4maASafqjmYCLysVN?cluster=devnet
  rent    https://explorer.solana.com/tx/2hwv8QWDAd4NkKpZYkkUz7Ai8kK483vuLoVR6cwqUu2t447eVAjBhLRy4HUoKVkc8Y2RSWH4TGB8zc1Pj49HufNM?cluster=devnet
pnpm exec tsc --noEmit -> 0;  pnpm lint -> no findings
```
That makes three local e2e passes on this branch (runs 1-2 before the fix, run 3 after). The e2e drives the API, not the UI, so the button-path change is covered by code review plus the lead's browser run, not by this script.

**Still not covered:** production (pending deploy), my own real-browser pass, and vitest (blocked on this machine).

## Addendum (lead, Sun 04/10 ~03:10 ART): production condition met

Branch merged to `main` (`c1f2ac0`, adds the replay-mode chat limit of 120 per 5 min) and deployed to production (Vercel `dpl_h6kwrvyYqsVoAj82kSpNCZmLX9ha`, READY). Run by the lead with this reviewer's script, not by the reviewer:
- `node tests/e2e/phase0.mjs` against https://keyhold-app.vercel.app: **59/59 checks passed in 14 s**; deposit `2eTMjt1k…` and rent `5ijcvrVN…` on devnet with `lease:v1:` memos.
- Headless Chrome following `demo-script.md` exactly (card buttons, not chips) against production: Ana 1280 light, Bruno/Carla/Ana 375 dark, 0 issues.

Verdict for recording: **GO**. Remaining: one practice take by the product team before the final one.
