# Integration review: `integration/overnight` (block B10)

Branch `integration/overnight`, from `main` ad57ca3. Written by the fullstack-engineer on Sun 2026-10-04. Nothing here was pushed to `main`.

## Merge order and result

Every merge is `git merge --no-ff origin/<branch>`, one commit each.

| # | Branch | Conflicts | Notes |
|---|---|---|---|
| 1 | `ci/setup` | none | |
| 2 | `f2-db` | none | |
| 3 | `f3-solana-pay` | CHANGELOG, `app/api/pay/route.ts`, `components/ChatShell.tsx`, `lib/solana/pay.ts`, `lib/solana/transfer.ts`, `package.json`, `pnpm-lock.yaml`, `vitest.config.mts` | see below |
| 4 | `f3-anchor` | CHANGELOG, `package.json`, `pnpm-lock.yaml` | `@anchor-lang/core` devDependency added |
| 5 | `f2-agency` | CHANGELOG | |
| 6 | `f2-uploads` | CHANGELOG (union), `components/api-client.ts`, `package.json`, `pnpm-lock.yaml` | plus a semantic fix, see below |
| 7 | `f1-i18n` | CHANGELOG, `app/api/pay/route.ts`, `components/ChatShell.tsx`, `components/Hero.tsx`, `components/api-client.ts`, `evals/lib/scenarios.ts`, `evals/recordings/index.ts`, `evals/run.ts`, `lib/agents/prompts.ts` | plus the agency move and the translations below |
| 8 | `docs/submission` | CHANGELOG, `README.md` | |
| 9 | `docs/validation` | none | |

After the last merge every one of the nine remote branches was re-fetched and had no commit that was not already in this branch. The lead said a README accuracy fix is still coming on `docs/submission`; it must be merged again when it lands (the README is the only file likely to conflict, in the status lines edited here).

## Conflicts and how each was resolved

1. **`f2-db` x `f3-solana-pay`, `/api/pay`, `lib/solana/pay.ts`, `lib/solana/transfer.ts`.** B3's flow is kept as it is: claim, `preparePayment` (build and sign, no side effect), store the signature on the pending row, `submitPayment`, reconcile on retry. B5's shared reference is added on top:
   - `TransferParams.reference` is applied in `buildSignedTransfer` (read-only non-signer key on the transfer instruction).
   - `preparePayment(intent, { reference })` and `executePayment(intent, { reference })` pass it down.
   - In the route, when `NEXT_PUBLIC_SOLANA_PAY=1` and escrow is custodial, the slot reference is derived and `findValidPayment` runs **before** the database claim, so a refused attempt (409, "already made with a wallet") never leaves a pending row. The same reference is then handed to `preparePayment`.
   - `nextPaymentSlot` (B5) replaces the inline month loop. The "Deposit already paid" 409 keeps its `code: "already_paid"` (B3's client and attack tests rely on it).
   - `app/api/solana-pay/routes.test.ts` used to mock `executePayment`; it now mocks `preparePayment` (records the options, so the shared reference is observable) and `submitPayment`. The two assertions about the reference and the flag-off path are unchanged.
   - `vitest.config.mts`: B3's version kept (same `@/` alias, no `include` filter, longer timeouts for PGlite). B5's `include` list would have skipped `tests/`.
2. **`pnpm-lock.yaml` / `package.json`.** Dependencies are the union. The lockfile was never edited by hand: the conflicted file was reset to the current side and `pnpm install --no-frozen-lockfile` regenerated it after each package.json resolution. Final check: `pnpm install --frozen-lockfile` reports "Lockfile is up to date". Scripts are the union (`samples`, `setup:devnet`, `db:*`).
3. **`f2-uploads` x `f2-db`, semantic (no textual conflict).** `/api/lease` calls `persistLease(state, decision)`, but with an upload approval there is no recomputed decision (the files are never stored; the signed attestation stands in). `persistLease` now takes an optional decision and records the prequal row only when it exists. `tsc` caught this.
4. **`f2-uploads` x `f1-i18n`.** `ApiError` and `isStaleSession` (B3, B7) are kept together with `createRealApi(lang, errors)`. The `upload` call sends the page language as a `lang` form field; `/api/upload` parses it with `langSchema` and passes it to `runDocumentsUpload(state, docs, routeLang)`, which falls back to detecting the last chat message when it is absent. `UploadDocuments` and the "Uploaded: ..." chat line use the typed dictionary (`t.upload`, `t.chat.uploaded`); `ChatShell` also translates the stale-session message.
5. **Agency x `f1-i18n`.** `app/agency/**` was moved with `git mv` to `app/[lang]/agency/**`. `/en/agency` and `/es/agency` work; the old `/agency` is now a 404 (there was no redirect; the only links to it were the Hero link, now `/<lang>/agency`, and the page's own links). `app/api/agency/**` is unchanged. Strings are in `lib/i18n/{en,es}.ts` under `agency` (typed: `es` is a `Dict`). Rule reasons in the queue reuse the existing `prequalCopy` helpers (so Bruno's and Carla's findings read in Spanish too). `queue.property` now carries `titleEs`. The page has a small ES/EN link that keeps `?lease=`.
6. **`f3-solana-pay` x `f1-i18n`.** `SolanaPayQr` strings are in `t.solanaPay` (EN and ES). `ChatShell`'s `applyPaid` is shared by the button and the QR flow and uses the translated confirmation texts.
7. **Hero.** The "Agency panel" link (now translated, `t.hero.agencyLink`, to `/<lang>/agency`) sits next to the language switcher.
8. **evals.** `evals/run.ts` keeps B7's upload and injection evals and runs them before B2's EN/ES evals. `recordAllScenarios` keeps B7's upload recordings and B2's `merge` option. `evals/recordings/index.ts` was regenerated from the 30 recording files (no hand edit of content). `escapeForTag` (exported by B7) is kept next to B2's `listingsSystem`.
9. **README.** `docs/submission`'s structure is kept, with the CI badge from `ci/setup`. The status table, flow, Solana, custodial, security, roadmap, tests and layout sections were edited to say what is true here: the program is built and CI-tested, **not deployed** and not called by the app; Solana Pay is behind a flag; the agency panel exists (its release is simulated); the UI is bilingual; real upload exists; persistence has a fallback and **Neon is not provisioned**. The README still says nothing is live until the branch is promoted.
10. **CHANGELOG.** Every entry from every branch is kept, in merge order inside the Week 1 section; this branch adds its own line.

## Verification on this branch

Run from `D:/Programacion/Hackaton/alquilia-wt/integration` after the last merge.

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | up to date |
| `pnpm lint` | clean |
| `pnpm exec next typegen && pnpm exec tsc --noEmit` | clean |
| `pnpm test` | 26 files, 234 tests pass (includes PGlite database tests, the B3 attack tests, the B5 attack regressions, the agency tests) |
| `REPLAY=1 pnpm evals` | ALL PASS (EN and ES evals, upload and injection evals) |
| `pnpm build` | passes; routes `/[lang]`, `/[lang]/agency`, the `/api/*` routes including `solana-pay` and `upload`, and the proxy |
| `REPLAY=1 pnpm start -p 3010`, `BASE_URL=http://localhost:3010 node tests/e2e/phase0.mjs` | 59/59 (real devnet deposit and rent, memo checks) |
| `BASE_URL=http://localhost:3010 node tests/e2e/uploads.mjs` | ALL PASS |
| Headless `run.mjs` on `/en` (1280 light and 375 dark, Ana, Bruno, Carla, deposit, verify, rent) | 0 issues |
| Headless `run-es.mjs` on `/es` | 0 issues |
| Headless `/en/agency` and `/es/agency` (1280x900) | HTTP 200, text in the right language, 0 console errors, queue and devnet ledger render |

The server was stopped afterwards. Live model calls made: **0** (everything ran with `REPLAY=1`). The e2e runs sent real devnet transactions with the demo keys (devnet only, test tokens). CI status on the pushed branch is recorded in the lead's report.

## What does NOT work together yet

- **QR payments are not written to the database.** `/api/solana-pay/status` only returns an updated signed session; it does not claim or confirm a row in `payments`. With `DATABASE_URL` set, a payment made through the QR therefore has no payments row. The protection against paying a slot twice still holds through the on-chain reference check (the button refuses when a wallet payment for the slot is on chain, and the status route flags a second wallet payment), but the database does not know about QR payments.
- **The wallet-payment check before the claim has no database-enabled test.** The B5 route test runs without a database. The ordering is by construction in the route; nothing asserts that a refused wallet-paid slot leaves no pending row.
- **Neon is not provisioned.** Production runs on the signed-session fallback; the replay limitation in the README stays open. B3's re-gate said GO for a preview with a Neon branch only after migrate, seed and e2e there; that was not done.
- **Upload with `lang=es` is not covered by a test** (the uploads e2e and evals run in English, and replay keys do not depend on language). The route and orchestrator paths are typed and the fallback is detection, but a Spanish upload turn was not exercised.
- **API error strings are English.** Server-side error messages (`jsonError` in `/api/*`, including `/api/agency/release` and `/api/upload`) are not translated, so a Spanish page can show an English error from the server. The queue shows the demo tenants' names as the server sends them ("Bruno (demo tenant)").
- **`/agency` now returns 404.** Any outside link to the old path (for example a pasted link in a script or a doc) must move to `/en/agency`.
- **Submission documents still describe the pre-integration state.** `docs/architecture.md`, `docs/submission/*` and the QA reviews from other branches say "on a branch, not on `main`" for pieces that are now merged here. Only the README was updated.
- **The Anchor program is not wired to the app.** The agency release is the custodial, simulated 2-of-3 flow; the program is not deployed (placeholder program id).
- **The README accuracy fix pending on `docs/submission`** is not included and will need a re-merge.
- `/[lang]` renders dynamically (it reads `searchParams` for `?fixtures=1`), as designed in the i18n branch; no static prerender of the landing page.
