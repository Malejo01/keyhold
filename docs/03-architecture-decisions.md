# 03 — Architecture decisions (override the spec where they differ)

Format: decision · context · consequence. Status: **Accepted** unless noted.

## AD-01 · The model extracts, the code decides
- **Context:** demo cases must be deterministic (Bruno and Carla must always be caught), and judges distrust "AI slop". This is the same pattern as Mauro's Qué Pinta Salta pipeline: LLM extractor, then a deterministic filter, then human review.
- **Decision:**
  - The LLM returns strict JSON validated with zod.
  - `lib/rules/*` decides `APPROVED | NEEDS_INFO | REJECTED`, payslip expiry (> 90 days), the DNI/payslip name match, rent ≤ 35% of income, and discounts.
- **Consequence:**
  - Evals are reproducible.
  - The model never approves anybody.

## AD-02 · Independent crosscheck agent
- **Decision:**
  - The crosscheck agent gets the original documents plus prequal's output, with a separate prompt.
  - Disagreement forces `NEEDS_INFO` and goes to the agency review queue.
- **Consequence:** it justifies the "multi-agent" claim. Carla's case is the demo's "aha" moment.

## AD-03 · Escrow evolves in two steps
- **Phase 0–2 (`ESCROW_MODE=custodial`):**
  - The deposit goes to a platform custody wallet on devnet.
  - Every movement carries a neutral, versioned Memo: `lease:v1:<id>:deposit:<sha256>` or `lease:v1:<id>:rent:<month>:<sha256>` (revised 2026-10-04). Transactions sent on 2026-10-03 used the legacy prefix `tuki:lease:`; they stay valid and `readMemoHash` accepts both.
  - This is stated explicitly in the README and video.
- **Phase 3+ (`ESCROW_MODE=program`):** Anchor `rental_escrow` with a PDA vault.
- The custodial path stays as a fallback.

## AD-04 · 2-of-3 deposit release with agency as arbiter
- **Context:**
  - Deposit disputes cannot be settled on-chain without a judge.
  - In Salta, intermediation requires a registered broker (CUCIS, Ley 7629).
- **Decision:** `release_deposit` needs 2 signatures out of tenant, landlord and agency. Add `agency: Pubkey` to `Lease`.
- **Consequence:**
  - A realistic dispute flow.
  - A B2B buyer: the agency.
  - A differentiator vs Fiador.sol and RentLock.

## AD-05 · Positioning: B2B back-office for agencies
- **Decision:**
  - Primary user/buyer: real-estate agencies.
  - Tenant-facing chat is the front door.
  - The agency panel moves from P2 to P1.
- **Consequence:** search/visits stay simple, because they are a commodity. Effort goes to prequal, crosscheck, escrow and the payment record.

## AD-06 · Payment token
- **Decision:**
  - Own SPL test token `tUSDC` (6 decimals), minted by `scripts/setup-devnet.ts`.
  - Shown as "USDC (devnet test token)".
- **Consequence:** no dependency on third-party faucets during demos.

## AD-07 · Pesos in the narrative
- **Context:** Salta rents are priced in ARS, and USDT dominates over USDC in Argentina.
- **Decision:**
  - The hackathon build settles in USDC.
  - The roadmap and UI copy show "pay in pesos via on-ramp, settle in USDC" as the next step.
  - No ARS rails are built during the hackathon.

## AD-08 · Solana libraries
- **Decision:**
  - `@solana/web3.js` 1.x, `@solana/spl-token` and `@solana/pay` for the client.
  - Anchor for the program.
  - Versions are verified and pinned on day 1 ([VERIFY] in official docs).
  - Migrating to `@solana/kit` is out of scope.

## AD-09 · AI provider (revised 2026-10-03: Gemini is the default)
- **Context:** the team has a Gemini key and no Anthropic key. Mauro's Qué Pinta Salta pipeline already runs on Gemini Flash.
- **Decision:**
  - One interface in `lib/ai/`: structured JSON generation with a zod schema, and chat with tools.
  - Provider from env: `AI_PROVIDER=gemini|anthropic`. Default: `gemini`, through Google's official SDK `@google/genai`.
  - Models from env: `AI_MODEL` for orchestration and chat, `EXTRACTION_MODEL` for document extraction. Default for both: `gemini-3.5-flash-lite`, chosen for cost and latency: the model only extracts fields and answers catalog questions, and every decision lives in `lib/rules`.
  - Fallback: if the orchestrator fails the evals with Flash-Lite, raise only `AI_MODEL` to `gemini-3.6-flash`.
  - **Checked on 2026-10-03:** Flash-Lite passes every eval live, 3/3, so both models stay on Flash-Lite. Two things had to be fixed first: the crosscheck prompt now says how to build the full name when an ID card gives names and surname in separate fields (Flash-Lite had dropped the surname, Carla 1/3), and the listings eval now also accepts "no tiene / no cuenta con ningún…" as a not-in-catalog answer.
  - `AI_DAILY_CALL_CAP` (default 300) caps live calls per day; past it the app serves recordings.
  - Production stays on `REPLAY=1` until a `GEMINI_API_KEY` from a separate Google project is loaded.
  - Structured output through a JSON schema, validated again with zod. Function calling for the orchestrator tools.
  - Retry with backoff on 429, because the free tier has low rate limits.
  - Anthropic stays as an optional provider and nothing breaks when its key is missing.
- **Consequence:**
  - `REPLAY=1` records and serves responses for the 3 demo tenants, and is the fallback while recording the demo.
  - Judge-facing texts name Google Gemini as the product model. Claude Code remains declared as the AI coding assistant.

## AD-10 · Wallets
- **Phase 0–2:** server-side devnet keypairs from env. Demo only, and stated as such.
- **Phase 4:**
  - Embedded wallet. Privy, Crossmint or Dynamic: pick the one with Solana devnet support and a free tier ([VERIFY]).
  - Plus Phantom via Solana Pay QR for the live demo.

## AD-11 · Data layer
- **Phase 0–1:** in-memory/JSON keyed by session cookie.
- **Phase 2:**
  - Supabase Postgres (team default, RLS) or SQLite + Drizzle.
  - Decide at the start of Phase 2 and record the decision here as AD-11b.

## AD-11b · Neon Postgres + Drizzle (decided 2026-10-03)
- **Decision:**
  - Neon (Postgres, free plan), created through the Neon MCP.
  - `drizzle-orm` + `@neondatabase/serverless`.
  - No file-based SQLite. Supabase is dropped.
- **Phase 0–1 session state:** the client holds the session blob, signed by the server with HMAC (`SESSION_SECRET`). The server recomputes every prequal/crosscheck result; the client is never the source of truth for an approval.

## AD-10b · No embedded wallet (decided 2026-10-03)
- **Decision:** Phantom via Solana Pay QR only. The embedded wallet in AD-10 Phase 4 is cut.
- AD-13 and AD-14 are also out of scope for the hackathon.

## AD-12 · Privacy
- On-chain: pubkeys, amounts, timestamps and sha256 hashes only.
- Documents and contract text stay off-chain.
- Uploaded document text is treated as untrusted data (prompt-injection test in evals).

## Open
- **AD-13 (Proposed):** deposit reduction based on `on_time_streak` for the next lease. Stretch goal for Phase 5.
- **AD-14 (Proposed):** compressed-NFT badge (Metaplex Bubblegum). Only if everything else is done.
