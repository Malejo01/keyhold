# Morning report — Sun 2026-10-04

Overnight autonomous run by the team lead (Claude Code), ~01:30 → ~04:45 ART. Written for reading on a phone.

## 1. Production and recording

- **Design merge OK, no revert.** `f1-design` merged to `main` as `ad57ca3` at ~01:30 ART and deployed. e2e **59/59** on https://keyhold-app.vercel.app and the recording script in headless Chrome (Ana 1280 light; Bruno, Carla, Ana 375 dark): **0 issues**.
- `main` has been **frozen** since then. Its only later change is this report.
- Recording today: use https://keyhold-app.vercel.app with `docs/submission/demo-script.md` and `recording-brief.md` **from `main`**. Nothing from the night is on production.
- Re-checked at 04:40 ART: production still on `ad57ca3`, e2e **59/59**.

## 2. Blocks

All PRs are **drafts against `main`**; none merged. Previews need your Vercel login.

| Block | PR | Gate | One line |
|---|---|---|---|
| B1 CI | [#1](https://github.com/Malejo01/keyhold/pull/1) | ✅ GO | lint, tsc, vitest (first run ever: 39/39), evals, build, anchor-build with pinned Agave 4.1.2 / Anchor 1.2.0 |
| B2 ES/EN | [#2](https://github.com/Malejo01/keyhold/pull/2) | ✅ GO | `/es` and `/en`, Accept-Language redirect, agents and contract per language |
| B3 DB | [#3](https://github.com/Malejo01/keyhold/pull/3) | ✅ GO (DB off) · ✅ GO DB on a preview | Drizzle + idempotent pay; **Neon not provisioned** (needs you) |
| B4 Anchor | [#5](https://github.com/Malejo01/keyhold/pull/5) | ✅ GO after fix | program built, 69/69 + 6/6 tests in CI, **not deployed** |
| B5 Solana Pay | [#4](https://github.com/Malejo01/keyhold/pull/4) | ✅ GO flag off · ✅ GO flag on (preview) after fix | QR transaction request, not tried with a real Phantom |
| B6 Agency | [#6](https://github.com/Malejo01/keyhold/pull/6) | ✅ GO after fix (re-gated) | `/agency`: NEEDS_INFO queue, on-chain ledger, simulated 2-of-3 release |
| B7 Uploads | [#7](https://github.com/Malejo01/keyhold/pull/7) | ✅ GO | real uploads, Gemini multimodal, prompt-injection evals |
| B8 Submission | [#8](https://github.com/Malejo01/keyhold/pull/8) | ✅ GO after fix (lead-verified) | README + diagram, Earn and Colosseum drafts, deck outline |
| B9 Validation | [#9](https://github.com/Malejo01/keyhold/pull/9) | ✅ GO | WhatsApp, survey, LOI, verified agencies, **naming research** |
| B10 Integration | [#10](https://github.com/Malejo01/keyhold/pull/10) | ✅ GO | all 9 together; do not merge this one |

**See everything together:** https://keyhold-app-git-integration-overnight-lizarraga-mauros-projects.vercel.app/en (also `/es`, `/en/agency`). Checked at ~04:30: e2e 59/59, recording script 0 issues.

Security gates caught and fixed four real bugs tonight: a pending payment stuck forever (B3), the platform key accepted as a Solana Pay payer, which could move custody funds (B5), a token-account owner change that could lock a deposit on-chain (B4), and a concurrent double release reproduced on devnet (B6). The B6 double release moved 840 tUSDC (test tokens) for a 420 deposit.

## 3. Decisions (answer with a letter)

1. **When does `main` unfreeze?** A) After the recording, merge PRs #1→#9 in order (rec). B) Merge #10 in one go. C) Wait until Monday.
2. **Neon (B3).** A) You create it today in Vercel → keyhold-app → Storage → Neon (free), named `alquilia`, connected to Preview only; then we migrate and test (rec). B) Monday. C) Drop the DB and keep the signed session.
3. **Name.** alquilia.io and alquilia.eu are **AI tools for rental agencies** (same function), and there is a Salta app called "Alquilia". A) Keep AlquilIA for the demo only and rename before any public launch (rec). B) Rename now; top candidate Wasikey (4/5). C) Back to Keyhold (2/5, getkeyhold.com exists).
4. **Anchor deploy route.** A) `workflow_dispatch` job with a devnet deployer secret (rec, CI already pins the toolchain). B) WSL. C) Solana Playground.
5. **Keys for the 2-of-3 demo.** A) A second Phantom wallet for the landlord or agency, for a real 2-of-3 (rec). B) The server holds both; say "custodial in substance" on camera.
6. **Release without the tenant's vote** (program constant). A) Only after the full term or 10+ days overdue (current, rec). B) Another grace value. C) A per-lease field (IDL change).
7. **Solana Pay flag.** A) Off in production; show the script proof plus the QR as a visual (rec). B) On in a preview for a live wallet test. C) On in production.
8. **Agency panel exposure.** A) Read-only in production (no `AGENCY_SECRET_KEY` there); release only on a preview (rec). B) Add a shared-secret gate. C) Hide the link.
9. **`/` without a Spanish browser header.** A) `/en` (current, rec for judges). B) `/es` (AD-15 says "Spanish by default").
10. **Anchor line in the videos.** A) "Built and tested on a branch, not deployed" (true from today; rec). B) Keep main's "in progress, not built".

Smaller ones are listed per PR: per-language saved chat, lease default language, B3 timeouts, B5 tenant keys and fee payer, B6 marker-address griefing, B7 reference date and public samples, `/agency` 404 vs redirect, and the Disclosures wording on how much Claude Code wrote.

## 4. Blockers: what I need from you

- **Neon:** create the project through Vercel Marketplace (decision 2). The Neon MCP refused with "organization is managed by Vercel". Your 3 existing Neon projects belong to other apps and were not touched.
- **Anchor deploy:** a new deployer keypair funded with ~4 devnet SOL, plus your go (decision 4).
- **Vercel env (Preview):** `AGENCY_SECRET_KEY` (to test release on a preview) and, optionally, a dedicated devnet RPC URL. Public devnet answers 429 and returns batched responses out of order (handled in code). I did not copy secrets into Vercel.
- **Humans (Ani):** video links, team bios, design partner, real validation entries (the evidence log is empty), a lawyer's look at the LOI, drop rows 7 and 10 (snippet-only phones) before sending WhatsApps.
- **Commit trailers:** commits by Sonnet teammates carry "Claude Sonnet 5.5" instead of the Opus line. History was not rewritten.

## 5. Live AI usage

- Gemini (`gemini-3.5-flash-lite`) live calls: **24** — B2 8 (EN/ES listings recordings), B7 16 (sample document bundles). Everything else ran in REPLAY. The cap is 300 per day.
- Devnet: test transactions only, not counted exactly — on the order of 50 (each e2e run sends 2; plus Solana Pay script runs, agency releases and the reproduced double release). No mainnet, no money spent.
- Claude Code teammates: Sonnet for routine blocks, Opus only for the Anchor program and security gates.
