# Changelog

Weekly progress log required by Superteam Earn ("starting-point record and weekly changelog").
Work before the tag `v0-hackathon-start` or imported via `chore(import)` commits is pre-existing and listed in README › Disclosures.

## Week 1 — 2026-09-28 → 2026-10-04

### 2026-10-03 (Sat) — Phase 0
- Repo created. Tag `v0-hackathon-start`.
- Dev agent team defined in `.claude/agents/`.
- chore(scaffold): Next.js 16 App Router, Tailwind 4, Framer Motion, zod; shared contracts in `lib/contracts.ts`; devnet keygen script (lead, F0-01/02/03a).
- docs: README v0 (custodial escrow stated, disclosures, security, run guide) and 3-minute demo script (submission-writer, F0-07).
- feat(api): `/api/chat`, `/api/lease`, `/api/verify` routes, HMAC-signed client-held session, zod request schemas, 10-listing Salta seed (fullstack-engineer, F0-06).
- feat(solana): custodial escrow on devnet: tUSDC setup script, transferChecked + Memo payments (deposit to custody, rent to landlord), blockTime-based on-time pricing, memo hash verify, `POST /api/pay` (solana-client-engineer, F0-03b). Not yet executed on-chain: platform wallet awaiting faucet SOL.
- feat(agents): orchestrator stage machine, listings, prequal + independent crosscheck with deterministic rules, lease template + sha256, simulated Ana/Bruno/Carla documents, provider wrapper with REPLAY/RECORD; evals 6/6 in replay with hand-authored recordings, live run pending API key (ai-agents-engineer, F0-04).
- feat(ui): tenant demo screen: chat with persona switcher, animated lease timeline, property, prequal, contract (Verify), payment and receipt cards, neutral light/dark tokens (ui-motion-engineer, F0-05).
- fix(api): `/api/lease` re-evaluates the tenant against the selected property rent (lead, F0-08).
- feat(solana): devnet setup executed (tUSDC mint, tenant funding) and sample deposit + rent transactions with Memo recorded in `docs/submission/tx-links.md` (lead, F0-03b).
- feat(ai): Gemini (`gemini-3.8-flash`, `@google/genai`) is the default provider via `AI_PROVIDER`; retry with backoff on 429/503, recording fallback when a live call fails, recordings re-recorded with real Gemini responses; live and replay evals pass 3/3 (ai-agents-engineer, F0-11). AD-09 revised.
- chore(deploy): Vercel project linked to the repo; production at https://tuki-rentals.vercel.app (lead, F0-08).
- Known issue: `pnpm test` (vitest) cannot start on the dev machine (Windows Application Control blocks the rolldown native binding); unit tests were checked with ad-hoc tsx scripts only.

### 2026-10-04 (Sun) — Phase 0 close-out
- chore(brand): working name changed from "Tuki" to "Keyhold" (provisional). Name, tagline and URL now live in `lib/config/brand.ts`; UI, metadata, prompts and docs read from there.
- feat(solana): Memo prefix is now neutral and versioned, `lease:v1:<id>:deposit:<hash>` and `lease:v1:<id>:rent:<month>:<hash>` (AD-03). Earlier transactions with the `tuki:lease:` prefix stay listed as historical in `docs/submission/tx-links.md`.
- feat(ai): default model `gemini-3.5-flash-lite` for orchestration and extraction (AD-09); crosscheck prompt clarified for split name fields; recordings regenerated; live and replay evals 3/3; daily cap on live calls (`AI_DAILY_CALL_CAP`, default 300) that falls back to recordings.
- fix(api): `/api/pay` returns a clear 409 when the demo wallet is out of test tokens; `setup-devnet` tops tenants up to a target balance; `escapeForTag` escapes quotes and ampersands.
- chore: GitHub repo renamed to `keyhold`; Vercel project renamed to `keyhold-app` (https://keyhold-app.vercel.app; `keyhold.vercel.app` was taken). `tuki-rentals.vercel.app` stays as an alias until Mon 12/10.
- chore: `.claude/settings.json` enables agent teams and pre-approves routine commands.
- docs: MIT `LICENSE`, `docs/HANDOFF.md`.
- fix(agents): orchestrator offers one payment at a time, deposit first and then the next unpaid rent month; asking for rent before the deposit gets "The deposit comes first" plus the deposit card. Reply copy: "pre-qualified", "cross-check", "ID", deposit "held in the demo custody wallet", move-out "not built yet", singular/plural on-time count. New eval "deposit before rent"; replay evals pass (ai-agents-engineer).
- test: first real-browser run (headless Chrome via CDP, 1280 px light and 375 px dark) against the real routes on localhost; Ana, Bruno and Carla end to end with real devnet payments. Found: rent payable before the deposit, which left Verify locked (lead).
- fix(solana): `/api/pay` refuses rent before a confirmed deposit with 409 "Pay the deposit first." (solana-client-engineer).
- fix(ui): rent card locked until the deposit is paid; deposit card shows only the amount; "secured" removed from deposit copy (escrow is custodial); one status term, "Payment confirmed"; next-step chip highlighted and mobile chip row hints that it scrolls (ui-motion-engineer).
- test: e2e 59/59 and headless-Chrome demo flow pass on production after deploy `c1f2ac0`; recording verdict GO (lead).
- docs: AD-15, bilingual UI ES/EN with Spanish by default, scheduled after the recording (F1-07); CLAUDE.md language rule updated (lead).
- chore(brand): visible name AlquilIA (provisional, conflicts noted in HANDOFF); repo and Vercel project not renamed (lead).
- feat(agents): structured `evidence` on pre-qualification and cross-check issues (compared values and the rule); contract template names the platform (ai-agents-engineer).
- feat(ui), branch `f1-design`: landing hero with "Try the demo", light adobe / dark ink palette through tokens, Agent activity panel, evidence side by side, animated payment and receipt with "View on Solana Explorer", illustrated property cards, clearer timeline, icon and OG image (ui-motion-engineer).
- test: E2E_COOKIE support for protected previews; preview e2e 59/59 and browser run 0 issues; design review `docs/reviews/phase-1-design.md` (qa-security-reviewer).
- docs: demo script and recording brief rewritten for the redesigned UI; before/after screenshots in `docs/reviews/ux/` (submission-writer, lead).
- fix(api): `/api/chat` rate limit is 120 messages per 5 min per IP in replay mode (no model cost) and stays 30 with live AI (fullstack-engineer).
- chore(config): Next dev indicator hidden so it does not cover the chat input at 375 px (fullstack-engineer).
- docs(submission): `preselection.md` with counted fields, `pitch-script.md` (2:00), demo script rewritten for the product team; README positioning line no longer claims trustless escrow (submission-writer).
- docs(validation): honest GTM draft `docs/submission/gtm.md` (plan, no traction), 15 Salta agencies to contact, empty evidence log (market-validation-analyst).
- docs: the demo and pitch videos are recorded by the product team, not Mauro; no new Gemini key, production stays on `REPLAY=1`; Monday design debates prepared in `docs/debates/` (lead).
- feat(rules): optional `Issue.evidence` (field, rule, values compared side by side) on name_mismatch, expired_payslip and income_ratio_exceeded, for the UI comparison view; decisions unchanged. The lease template names the product via `APP_NAME`. The rename to "AlquilIA" needs no re-recording: replay keys use the agent id and user input only, never the system prompt. Replay evals and `tsc` pass (ai-agents-engineer).
- ci: GitHub Actions workflow `.github/workflows/ci.yml` (push + PR, read-only token, no deploy, no secrets): lint, typecheck, vitest, evals in replay, build, plus an `anchor-build` job pinned to Agave 4.1.2 and Anchor 1.2.0 that passes with a notice until `programs/` or `Anchor.toml` exists (fullstack-engineer, B1). First Linux run of `pnpm test`.
- feat(agency), branch `f2-agency` (B6): minimal agency panel at `/agency`. NEEDS_INFO queue computed on the server by replaying the real prequal and cross-check agents for the demo tenants (Bruno: expired payslip, Carla: name mismatch) with rule sentence, compared values and who decided, labelled "Demo queue (simulated tenants)". Contracts and payments read from real devnet history of the custody wallet and landlord token account (`lease:v1:` and legacy `tuki:lease:` memos grouped by lease id, deposit, rent months, amounts, blockTime, on-time inferred from the discount, explorer links), 30 s cache and paced RPC reads. "Release deposit" (custodial): the agency proposes a split that must sum to the deposit, the reason is hashed with sha256, the server signs the terms with two of the three demo keys (ed25519, node:crypto), verifies them, and the custody wallet sends the tUSDC with memo `lease:v1:<leaseId>:release:<reasonSha256>`; idempotent against the chain. Memo convention extended (PLAN section 4, `lib/contracts.ts`). API: `GET /api/agency/queue`, `GET /api/agency/leases`, `POST /api/agency/release`. vitest: memo parsing, ledger grouping, split validation, 2-of-3 verification (one signer, foreign signer, wrong terms, replayed nonce), idempotency, queue, signature matching. Found while testing: public devnet returns JSON-RPC batch responses out of order and web3.js pairs them by index, which silently crossed amounts between transactions; the panel matches each transaction by its own signature. Two real devnet releases made on leases created by the e2e run; screenshots in `docs/reviews/b6-agency/` (fullstack-engineer).

## Week 2 — 2026-10-05 → 2026-10-12
