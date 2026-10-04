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
| F0-10 | Demo video | **Not recorded yet.** Recorded by the product team (Ani and teammates), not by Mauro; Mauro only does code |
| F0-11 | Gemini provider (added during the session) | Done |

### F1 — pre-selection, Sun 04/10, submit before 15:30

Nothing started. Tasks F1-01 to F1-06 are in `PLAN.md` §2.

## Gate

**GO.** After the rename, model change and gate follow-ups (commit `73a8372`), `node tests/e2e/phase0.mjs` ran three times back to back against https://keyhold-app.vercel.app on Sat 2026-10-03 at 23:02 ART: 56/56 checks in each run (13 s, 10 s, and 294 s for the third, which waited out the `/api/chat` rate limit). Each run sends a real deposit and a real rent payment on devnet with the `lease:v1:` memo.

- The reviewer agent's own verdict in `docs/reviews/phase-0.md` was NO-GO for one reason, the tenant wallet running out of test tokens; that was fixed and the reviewer's condition (three passing runs) is met. These last runs were launched by the lead with the reviewer's script, not by the reviewer.
- Production serves recorded AI answers (`REPLAY=1`), so the gate does not exercise live Gemini. Live Gemini is covered by `pnpm evals`: Ana, Bruno and Carla 3/3 with `gemini-3.5-flash-lite`, live and in replay.
- Not covered: the UI in a real browser against the real routes, and the vitest unit tests (blocked on this machine).

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
| `GEMINI_API_KEY` | yes | **no** | No new key (corrected Sun 04/10): local uses the current key, bounded by `AI_DAILY_CALL_CAP` |
| `AI_MODEL`, `EXTRACTION_MODEL` | yes | yes | `gemini-3.5-flash-lite` |
| `AI_DAILY_CALL_CAP` | yes | yes | 300 |
| `REPLAY` | no | yes (`1`) | Production serves recordings until further notice from Mauro |
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

## Update — Sun 04/10, ~00:15 ART (second session)

- First real-browser run done (headless Chrome via CDP); fixes merged to `main` at `c1f2ac0` and deployed. e2e 59/59 on production; recording verdict **GO** (`docs/reviews/phase-1-recording.md`).
- Videos are recorded by the product team (Ani and teammates); Mauro only does code. No new Gemini key: local uses the current key with `AI_DAILY_CALL_CAP`; production stays `REPLAY=1`.
- `/api/chat` allows 120 messages per 5 min in replay mode, 30 with live AI.
- Decided AD-15: bilingual UI ES/EN, Spanish by default; task F1-07, **after** the recording.
- Monday debates prepared, not started: `docs/debates/2026-10-05-prepared.md`.
- Mauro starts Sunday with the 10-point production checklist (in the session report).

## Visible name "AlquilIA" (Sun 04/10, branch `f1-design`) — pending team decision

- Visible name changed from "Keyhold" to **"AlquilIA"** (alquilar + IA), provisional until the team confirms it. Changed only in `lib/config/brand.ts`, the UI, metadata, favicon/OG, contract template, agent prompts, README and submission docs.
- **Not renamed:** the GitHub repo (`Malejo01/keyhold`), the Vercel project (`keyhold-app`) and its domain (`keyhold-app.vercel.app`).
- **Known name conflicts, to be weighed by the team before confirming:** `alquilia.io`, `alquilia.eu`, and an app called "Alquilia" from Salta on the Google Play Store.

## Design branch `f1-design` (Sun 04/10, ~01:15 ART)

- Preview: https://keyhold-app-git-f1-design-lizarraga-mauros-projects.vercel.app (Vercel auth; a 23 h share link was created for headless tests and is not stored in the repo). `main` is untouched until Mauro approves the merge.
- qa verdict `docs/reviews/phase-1-design.md`: GO for recording on this branch after the Lease-agent hash display fix, merge, production deploy, one e2e run on production and one practice take.
- Script and brief for the product team: `docs/submission/demo-script.md`, `docs/submission/recording-brief.md`. Before/after screenshots: `docs/reviews/ux/`.
- F1-07 (bilingual ES/EN) starts after this merge, on its own branch, because it touches the same files.

## Overnight run (Sun 04/10, ~01:30 → ~05:00 ART)

Full report: `docs/MORNING_REPORT.md` on `main` and the GitHub issue "Morning report 2026-10-04".

- `f1-design` merged to `main` as `ad57ca3`; production verified (e2e 59/59, recording script 0 issues). `main` frozen afterwards; its only later change is the morning report.
- Blocks B1–B9 each on their own branch and worktree (`../alquilia-wt/<branch>`), each with a qa gate in `docs/reviews/b*.md` and a draft PR (#1–#9). B10 `integration/overnight` (PR #10, do not merge) contains all nine; qa GO (`docs/reviews/b10-integration.md`).
- Not on any deployment: Neon (needs Vercel Marketplace provisioning by Mauro), the Anchor program (built and CI-tested, not deployed), Solana Pay (flag off), agency release on production (no `AGENCY_SECRET_KEY` there).
- vitest runs locally inside the worktrees; the Windows Application Control note above applied to the main folder only.
- `.claude/settings.local.json` holds the overnight permission rules approved by Mauro (git worktree, draft PRs, preview-only Vercel env, Neon create; deny force-push, branch deletion, other project folders).

## Next 5 steps

1. Product team: record the demo from `main` with `docs/submission/demo-script.md` and `recording-brief.md` (production URL, recorded answers). Then the pre-selection form before 15:30.
2. Mauro: answer the 10 decisions in `docs/MORNING_REPORT.md` (one letter each).
3. After the recording: unfreeze `main` and merge PRs #1→#9 in order (decision 1), re-running e2e on production after each risky one (B3, B5, B6).
4. Mauro: provision Neon via Vercel Marketplace (Preview first), fund a devnet deployer for the Anchor program, optionally set `AGENCY_SECRET_KEY` and a dedicated RPC on Preview.
5. Lead: wire `ESCROW_MODE=program` to the deployed program (sol-client hand-offs in `docs/onchain.md`), align `addMonthsTs` with the program's fixed period, and fix the B6 marker-funding griefing (`allocateWithSeed`).

## Estado 04/10 10:20

```
ESTADO — AlquilIA / repo Malejo01/keyhold — dom 04/10, ~10:20 ART

PRODUCCIÓN (https://keyhold-app.vercel.app)
- main se descongeló y los 9 PRs están mergeados en orden (#1 CI, #3 DB, #4 Solana Pay, #5 Anchor,
  #6 panel inmobiliaria, #7 uploads, #2 bilingüe, #8 README/submission, #9 validación).
- También entraron los reviews y docs de #10 (integration/overnight). GitHub muestra #10 como MERGED
  porque su contenido ya está en main; no se mergeó como bloque. Último commit: b6a56af.
- Después de CADA merge: deploy de Vercel OK + e2e contra producción 59/59. No hubo ningún revert.
- Guion completo en Chrome headless contra producción: /en 4 corridas y /es 5 corridas, 0 problemas.
- REPLAY=1 sigue activo y el flag de Solana Pay sigue apagado.

NEON
- Proyecto "alquilia" (sa-east-1). DATABASE_URL está en Preview Y en Production.
- Migraciones corridas en Neon ANTES de mergear #3. Verificado: producción ya escribe pagos
  (1 depósito + 1 alquiler confirmados de la e2e).
- No se usó `vercel env pull` (el CLI no está instalado): las migraciones se aplicaron por el MCP de Neon.

ENV DE PRODUCCIÓN
- Creado DEMO_AGENCY_PIN (sensitive, solo Production). El PIN va por privado, no está en ningún archivo.
- AGENCY_SECRET_KEY TODAVÍA NO está creada en Production.

QUEDÓ A MEDIAS (se cortó la sesión; nada de esto está en main)
1. PIN del panel (rama f4-agency-pin): cambios hechos pero SIN commitear, sin tests verificados.
   Hasta que entre, la liberación del depósito en producción sigue deshabilitada: falta
   AGENCY_SECRET_KEY y falta el chequeo del PIN.
   El panel /en/agency SÍ está en producción (cola NEEDS_INFO + ledger on-chain).
2. Botón ES | EN visible + recordar idioma + no perder progreso (rama f4-lang-toggle):
   commiteado (ad5d69a) pero SIN pushear ni verificar. En producción hoy ya existe el selector ES|EN
   de B2 y la redirección por idioma del navegador (/es o /en), pero no la versión "bien visible".
3. Deploy Anchor (rama f4-anchor-deploy, pusheada, e9cb13c): workflow deploy-devnet.yml listo.
   Keypairs en .keys/ (no commiteadas). Deployer 7CUVgcDNNfbfFdfzH6GenbjQtXF8KUmefsbp1d2VgsDL
   fondeado con 4 SOL devnet. Program ID planificado B77PPK8P67vhzbhMNpu4mEJZY2h8wqS6AcAHe7WQCZbF.
   FALTA EL PERMISO DE MAURO para `gh secret set DEVNET_DEPLOYER_KEYPAIR` (y DEVNET_PROGRAM_KEYPAIR).
   Después: correr el workflow. NO está desplegado.
   Línea correcta HOY en README/guiones: "built and tested, not deployed".

PENDIENTE (no arrancado)
- Actualizar demo-script / pitch-script / recording-brief / checklist con links /en y /es
  y secciones opcionales "Agency panel + release" y "Language switch".
- Issue "Preselection form — copy/paste" (los textos y conteos ya están en docs/submission/preselection.md).
- Issue "READY TO RECORD".
- Anotar en cada PR las decisiones menores aplicadas.

¿SE PUEDE GRABAR YA?
Sí, el flujo principal (Bruno → Carla → Ana, pagos, Verify, explorer) en https://keyhold-app.vercel.app/en
está verificado en producción. Lo único que NO conviene grabar todavía es la liberación de depósito
con PIN. El botón de idioma "grande" tampoco está. Antes de grabar, alguien tiene que confirmar
que las etiquetas del guion coinciden con la UI actual (es la versión con hero + panel de agentes).

PRÓXIMOS PASOS PARA LA SESIÓN LEAD
a) Commitear, testear y pushear f4-agency-pin, crear AGENCY_SECRET_KEY en Production, mergear,
   y correr la e2e de producción.
b) Pushear f4-lang-toggle, correr el guion en /en y /es, mergear, y correr la e2e de producción.
c) Pedir a Mauro el permiso del gh secret set y desplegar Anchor en devnet.
d) Actualizar guiones y brief, y abrir los issues de preselección y READY TO RECORD.
```
