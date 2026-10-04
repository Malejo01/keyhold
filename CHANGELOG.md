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

## Week 2 — 2026-10-05 → 2026-10-12
