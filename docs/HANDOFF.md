# Handoff — end of the Phase 0 session

Written Sat 2026-10-03, about 23:15 ART, for the next Claude Code session (new folder name, agent teams enabled).
Read `CLAUDE.md` and `PLAN.md` first; this file only records the state at handoff.

## Task status

### F0 — recordable demo

| ID | Task | Status |
|---|---|---|
| F0-00 | GitHub repo and Vercel project | Done |
| F0-01 | Scaffold (Next.js 16, Tailwind 4, Framer Motion, zod), tag `v0-hackathon-start` | Done |
| F0-02 | Shared contracts, `lib/contracts.ts` | Done |
| F0-03a/b | Devnet keypairs, tUSDC mint, transfers with Memo, pricing, `/api/pay` | Done; real transactions on devnet |
| F0-04 | Product agents, rules, simulated documents, replay, evals | Done |
| F0-05 | Tenant UI | Done. Checked with fixtures and over HTTP; **not yet looked at in a browser against the real routes** |
| F0-06 | `/api/chat`, `/api/lease`, `/api/verify`, HMAC session, property seed | Done |
| F0-07 | README v0, demo script | Done; README still has TODOs for the humans (below) |
| F0-08 | Integration and deploy | Done |
| F0-09 | QA gate | See "Gate" below |
| F0-10 | Demo video | **Not recorded yet (Mauro)** |
| F0-11 | Gemini provider (added during the session) | Done |

### F1 — pre-selection, Sun 04/10, submit before 15:30

Nothing started. Tasks F1-01 to F1-06 are in `PLAN.md` §2.

## Gate

EVAL_AND_GATE_PLACEHOLDER

## URLs

- Repo: https://github.com/Malejo01/keyhold (renamed from `tuki-rentals`; GitHub redirects the old URL).
- Production: https://keyhold-app.vercel.app (Vercel project `keyhold-app`, team `lizarraga-mauros-projects`; `keyhold.vercel.app` was already taken). `https://tuki-rentals.vercel.app` stays as an alias until Mon 12/10.
- Devnet transactions: `docs/submission/tx-links.md` (current `lease:v1:` prefix first, then the historical `tuki:lease:` ones).
- tUSDC mint: `GiCyZLFrkhKd3X4CpFGe4sMHB2kiPob5ToH8FtjYou7X`
- Platform custody wallet and fee payer: `4sroL1aFi7iYZR2MWUMkZFacrnUkvrBG9EH7JtvSrzQm`

## Environment variables (names only)

`.env.local` is not in git. When the folder is renamed, `.env.local` moves with it; nothing has to be regenerated.

| Variable | Local | Vercel | Notes |
|---|---|---|---|
| `AI_PROVIDER` | yes | yes | `gemini` |
| `GEMINI_API_KEY` | yes | **no** | Mauro loads a new key from a separate Google project |
| `AI_MODEL`, `EXTRACTION_MODEL` | yes | yes | `gemini-3.5-flash-lite` |
| `AI_DAILY_CALL_CAP` | yes | yes | 300 |
| `REPLAY` | no | yes (`1`) | Production serves recordings until the key is loaded |
| `SESSION_SECRET` | yes | yes | Different value in each place |
| `PLATFORM_SECRET_KEY`, `LANDLORD_SECRET_KEY`, `TENANT_ANA_SECRET_KEY`, `TENANT_BRUNO_SECRET_KEY`, `TENANT_CARLA_SECRET_KEY` | yes | yes | Devnet demo keypairs |
| `AGENCY_SECRET_KEY` | yes | no | Not used until the 2-of-3 release |
| `PAYMENT_MINT` | yes | yes | |
| `SOLANA_RPC_URL`, `SOLANA_CLUSTER`, `ESCROW_MODE` | yes | yes | devnet, `custodial` |
| `NEXT_PUBLIC_EXPLORER_URL`, `NEXT_PUBLIC_SOLANA_CLUSTER` | yes | yes | |
| `NEXT_PUBLIC_APP_URL` | no | yes | Defaults to the production URL in `lib/config/brand.ts` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | no | no | Optional provider |

## Decisions made tonight

- **AD-09 revised:** Gemini through `@google/genai` is the default provider. Model `gemini-3.5-flash-lite` for chat and extraction; fallback is to raise only `AI_MODEL` to `gemini-3.6-flash`. Anthropic stays optional.
- **AD-11b:** Neon Postgres + Drizzle for Phase 2, created through the Neon MCP. No SQLite, no Supabase.
- **AD-10b:** no embedded wallet; Phantom through a Solana Pay QR only. AD-13 and AD-14 are out.
- **AD-03 revised:** Memo prefix `lease:v1:`. The legacy `tuki:lease:` prefix is still accepted when reading.
- **Working name "Keyhold"** (provisional). The name lives only in `lib/config/brand.ts`.
- **Phase 0–1 session:** client-held, HMAC-signed; prequal and crosscheck are recomputed on the server.
- **Mauro's other projects are read-only** (rule in `CLAUDE.md`). Nothing has been imported.
- **Availability:** 3.5 h per weekday, 7 h on Sat 10 and Sun 11. Agency panel reduced to the NEEDS_INFO queue plus deposit release.
- **Anchor toolchain:** nothing installed. WSL vs Solana Playground is decided on Monday.
- The demo tenants hold 1,000,000 tUSDC each; `pnpm setup:devnet` tops them back up.

## Open issues

Blocking for F1:
- The demo video is not recorded.
- README TODOs that need a human answer: team bios and links (Mauro, Ani), demo video link, Ani's re-check of the Fiador.sol and RentLock comparison, and a re-read of the limitations and repository-layout sections.

Not blocking, to close in F2:
- A signed session can be replayed: resending a session from before the deposit to `/api/pay` would pay the deposit twice (devnet funds only). Needs server-side state (Neon) or an on-chain check by memo.
- The rent discount is quoted with server time; only `onTime` is recomputed from `blockTime`. The Anchor program's `Clock` removes this in F3.
- `pnpm test` (vitest) cannot start on Mauro's machine: Windows Application Control blocks vitest's native binding. The unit tests were only checked with ad-hoc tsx scripts. Options: run them in CI or WSL, or port them to `node --test`.
- The `/api/chat` rate limit and the daily model-call cap are counted per warm serverless instance.
- No `server-only` package; server modules are guarded by comments and one runtime check.
- `scripts/record-demo-txs.ts` rewrites `docs/submission/tx-links.md`; re-add the historical section if it is run again.
- The custom dev agents in `.claude/agents/` were not registered in this session (it started before the folder existed). They load in a new session.

## Next 5 steps

1. Mauro: record the demo (≤ 3 min, English) with `docs/submission/demo-script.md`. Use `http://localhost:3000` for live Gemini or the public URL for recorded answers.
2. Mauro: close the app, rename the folder to `keyhold`, open a new session there (`.claude/settings.json` enables agent teams). Check with `/agents` that the 8 dev agents load. Remove the `tuki-rentals.vercel.app` alias after Mon 12/10.
3. F1-01 and F1-02 in parallel: `docs/submission/preselection.md` with character counts and `pitch-script.md` (submission-writer), GTM text and the list of 15 agencies (market-validation-analyst). Product model is named "Google Gemini"; Claude Code stays declared as the coding assistant.
4. Mauro and Ani: answer the README TODOs, record the pitch, share the repo with `hackathon@superteam.ar` if it is ever made private, and submit the form **before 15:30**.
5. Lead: complete the detailed boards for F2–F7 in `PLAN.md` (F1-05), then start F2 on Monday with the Neon project and the program account table.
