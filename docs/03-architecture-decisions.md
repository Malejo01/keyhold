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
  - Production stays on `REPLAY=1` until further notice. No new key (corrected 2026-10-04): local development uses the current `GEMINI_API_KEY`, bounded by `AI_DAILY_CALL_CAP`.
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
- **Implementation (block B3, branch `f2-db`, 2026-10-04):**
  - Schema `lib/db/schema.ts`: `agencies`, `tenants`, `sessions`, `documents` (metadata only), `prequal_decisions`, `leases` (with `agency_id`, `contract_hash`, `lang`, `stage`, `onchain_address`), `payments`. Migrations are generated with drizzle-kit into `drizzle/` (committed) and applied with `pnpm db:migrate`.
  - Properties are NOT a table: `seed/properties.json` stays the catalog and `property_id` is a plain text reference (no FK). A table would be a second source of truth; it appears when landlords can publish listings.
  - Idempotency: `payments` has `UNIQUE (lease_id, kind, month_index)`. `month_index` is NOT NULL and the deposit uses the sentinel `-1` (a CHECK ties it to `kind`), because Postgres treats NULLs as distinct in unique constraints. `NULLS NOT DISTINCT` would also work on PG15+; the sentinel works everywhere.
  - Replay protection: the signed session carries `issuedAt` and a `version` that grows with every signing. With a database the server stores the latest version per `sessionId` (written by `/api/lease` and `/api/pay`; chat moves no money) and rejects an older blob (409 `stale_session`). Blobs older than `SESSION_MAX_AGE_HOURS` (default 168) or issued in the future are rejected (401) in both modes.
  - `/api/pay` with a database runs in steps: **claim -> prepare -> store the signature -> send -> confirm**.
    - Claim: the intent row is inserted with status `pending` BEFORE anything else; the unique constraint lets exactly one request go on; the loser gets 409.
    - Prepare (`preparePayment`): validate, quote, read the balance, build and sign the transaction. It has no network side effect, so ANY error here (missing keypair env, RPC 429, blockhash failure, insufficient tokens) frees the claim and the tenant can simply retry.
    - Store the signature: the signature is known after signing, so it is saved on the pending row (with `last_valid_block_height`, amount, discount, memo) BEFORE the send. If that write fails, nothing was sent and the claim is freed (503).
    - Send (`submitPayment`): a failure here is ambiguous (the tx may have landed). The row stays `pending` WITH its signature and the answer is 502 `pending_confirmation`.
    - Reconcile on retry: a retry that finds a `pending` row asks devnet about the stored signature (`getSignatureStatuses`, history search). Confirmed: the row is marked `confirmed` and the receipt plus a re-signed session are returned (also recovers a lost response of the original request). Failed on chain, or unknown after the blockhash expired (+40 blocks margin): it can never land, so the row is released and the same request pays once. Still possible to land: 409 `in_progress`. RPC unreachable: 503 `reconcile_unavailable`, the claim is kept. A pending row with no signature older than 180 s means the request died before signing (nothing was sent): released.
    - The row is marked `confirmed` with the signature, `blockTime` and `on_time` from the confirmed tx. If the database is unreachable `/api/pay` answers 503 and sends nothing.
  - One paid lease per session is a database rule: `payments.session_id` plus `UNIQUE (session_id) WHERE kind = 'deposit'` (migration `0001_payment_reconcile`). The read check stays as a friendly first line; the constraint decides the race across instances. A released claim is deleted, which frees the slot.
  - DB errors are logged without bound parameters (`describeError`): drizzle's "Failed query ... params: ..." message is replaced by the driver's code and message.
  - The client drops a session refused as `stale_session` instead of telling the user to reload (reloading restored the same blob from sessionStorage and looped).
  - Without `DATABASE_URL` the legacy HMAC path runs unchanged (plus the storage-free `issuedAt` checks), the server logs once that persistence is off, and a sequential replay of an old blob is NOT blocked (documented limitation, covered by a test).
  - Drivers: `@neondatabase/serverless` (neon-http) in the app; tests run the same migrations on in-process PGlite (`@electric-sql/pglite`, dev dependency), so CI needs no database service. neon-http has no interactive transactions, so every store helper is a single atomic statement and `pnpm db:migrate` applies each migration without a wrapping transaction (if one ever fails half way on an empty database, drop the `public` and `drizzle` schemas and re-run).
  - Open: restoring a session from the database after a lost response of an already `confirmed` payment (409 `already_paid` carries no session; B3-3), rate limit per instance (issue 5), moving the chat history out of the blob. These belong to the session debate (Debate B).

## AD-10b · No embedded wallet (decided 2026-10-03)
- **Decision:** Phantom via Solana Pay QR only. The embedded wallet in AD-10 Phase 4 is cut.
- AD-13 and AD-14 are also out of scope for the hackathon.

## AD-12 · Privacy
- On-chain: pubkeys, amounts, timestamps and sha256 hashes only.
- Documents and contract text stay off-chain.
- Uploaded document text is treated as untrusted data (prompt-injection test in evals).

## AD-15 · Bilingual UI, English for judges, Spanish for Spanish browsers (decided 2026-10-04, implemented)
- **Context:** Mauro asked for every text on the web in Spanish; the hackathon asks for the pitch, demo and repo in English.
- **Decision:** the web UI ships in Spanish and English with a prominent ES | EN pill toggle in the hero and chat headers (44 px touch targets, visible focus, `aria-current`, group label "Change language / Cambiar idioma"). README, code, comments and commits stay in English. Product agents answer in the route language.
- **Routing (`proxy.ts`, matcher `/` only):** `/en` and `/es` are never redirected (the judge link is `/en`). At `/` the `lang` cookie wins; without it, a Spanish-first `Accept-Language` goes to `/es`; anything else goes to `/en`. The toggle sets the cookie (1 year, `SameSite=Lax`, `path=/`, `secure` on https).
- **Switching mid-demo:** one saved conversation per language (the contract text and its SHA-256 differ per language). Before a lease exists (search, visit, documents) the saved conversation is re-keyed to the new language and its messages are kept; later turns are answered in the new language. Once the conversation has a lease/contract or a payment it stays under the old language and the new page shows a notice with a "Start over in <language>" button; switching back resumes it. A conversation already saved in the destination language is never overwritten.
- **Timing:** the English demo script runs on `/en`, unchanged by this decision.

## Open
- **AD-13 (Proposed):** deposit reduction based on `on_time_streak` for the next lease. Stretch goal for Phase 5.
- **AD-14 (Proposed):** compressed-NFT badge (Metaplex Bubblegum). Only if everything else is done.
