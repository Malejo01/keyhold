# AlquilIA

> "AlquilIA" (alquilar + IA) is a provisional working name, formerly "Keyhold"; the final brand is still to be decided. The repo and production URLs still use "keyhold".

AI leasing back-office for real-estate agencies in Argentina's interior. Agents pre-qualify tenants and draft contracts; deposit and rent are paid on Solana with the contract hash in every payment. The trust-minimised escrow is in progress and not built yet; today it is custodial.

Built for the Colosseum Crypto World's Fair hackathon, Superteam Argentina track. Team based in Salta, Argentina.

- Live demo: https://keyhold-app.vercel.app
- Demo video (max 3 min): TODO(Ani) add the link after recording.
- Devnet transaction links: see [`docs/submission/tx-links.md`](docs/submission/tx-links.md).
- Demo script: [`docs/submission/demo-script.md`](docs/submission/demo-script.md).

## Status in one paragraph

This is a hackathon build, version 0. It runs end to end on Solana **devnet only**, with fake properties, fake people and fake documents. The deposit escrow is **custodial** at this point: the deposit goes to a platform custody wallet and the server signs every transaction with demo keypairs. An Anchor program with 2-of-3 release (tenant, landlord, agency) is **planned for this week and is not built yet**. See [Current status](#current-status-custodial-escrow-on-devnet) below.

## The problem

In Salta, and in most of Argentina's interior, a rental is still handled by hand by a small agency:

- The agency checks the tenant's documents (ID, payslip, income proof, guarantee) one by one. This is slow and errors get through, such as an old payslip or a name that does not match between documents.
- The security deposit is held by whoever is in the middle. When there is a dispute about returning it, the tenant has little proof of what was agreed or paid.
- The payment history of a good tenant stays in the agency's files and is not portable.

Search portals already exist and AI search assistants are becoming common, so AlquilIA does not compete there. AlquilIA's effort goes into the back-office steps where agencies spend manual time: pre-qualification, cross-checking, contract, deposit and payment record.

Note on currency: rents in Salta are mostly priced in pesos. This build settles in USDC (a devnet test token). The next step after the hackathon is to let tenants pay in pesos through an on-ramp and settle in USDC. That is roadmap, not built. See [Roadmap](#roadmap-for-the-week).

## How it works

The tenant-facing front door is a chat on the left and a lease timeline on the right. The same pipeline is meant to be operated by an agency (an agency panel is on the roadmap).

### Product agents

Not to be confused with the dev agents that build this repo (`.claude/agents/`). The product agents live in `lib/agents/` and run inside the app.

| Agent | What it does |
|---|---|
| Orchestrator | A stage machine: `SEARCH`, `VISIT`, `DOCUMENTS`, `CONTRACT`, `PAYMENT`, `ACTIVE`, `MOVE_OUT`. Each stage exposes only its own tools to the model. |
| Listings | Searches and reads properties from the catalogue (`seed/properties.json`, 10 properties in Salta). It answers only from catalogue data. |
| Prequal | The model extracts fields from the tenant's documents into strict JSON (validated with zod). Deterministic rules then decide: `APPROVED`, `NEEDS_INFO` or `REJECTED`. |
| Crosscheck | A second, independent pass with a separate prompt. It extracts again from the original documents and the rules compare. If it disagrees with prequal, the case becomes `NEEDS_INFO`. |
| Lease | Builds a contract from a template, computes its sha256, and prepares the payment (deposit, rent). It emits a payment intent; it does not touch Solana libraries or keys. |

A visits agent with fixed slots is planned and is not part of this build.

### Principle: the model extracts, the code decides

The language model never approves or rejects anybody and never computes a price. It turns documents into JSON. Everything that decides something lives in `lib/rules/`:

- payslip older than 90 days is flagged;
- the name on the ID and on the payslip must match;
- rent must be at most 35% of income;
- the status (`APPROVED` / `NEEDS_INFO` / `REJECTED`);
- discounts and on-time status.

This makes the demo cases reproducible and keeps decisions testable without a model.

### The three demo tenants

All data is simulated. A persona switcher in the UI selects one of them.

| Tenant | Expected outcome | Why |
|---|---|---|
| Ana | Approved | Documents are complete, consistent and current. |
| Bruno | Stopped (`NEEDS_INFO`, `expired_payslip`) | His payslip is older than 90 days. Prequal flags it. |
| Carla | Stopped by the crosscheck (`NEEDS_INFO`, `name_mismatch`) | Prequal approves her; the independent crosscheck finds a different name on the ID and on the payslip and overrides it. |

The evals in `evals/` check these three outcomes, live and in replay mode.

## What Solana is used for, and why

Solana is not used to decide anything about the tenant. It is used for the money and the record:

1. **Deposit custody.** The deposit is moved as an SPL token transfer into a custody account. Today this is a platform wallet (custodial). The plan is a program-owned vault (see status below).
2. **USDC-denominated payment with discounts computed from confirmed time.** Rent and deposit are paid in the demo token. The payment screen shows the list price crossed out and the discounted price (one discount for paying in USDC, one for paying on time). Whether a payment is on time is computed from the `blockTime` of the **confirmed transaction**, never from a client button or a client clock. The amounts use integer math: `list * (10000 - discountBps) / 10000`.
3. **Payment record.** Every payment carries a Memo instruction in the same transaction. The tenant or anyone else can recompute the contract hash and compare it with the one on-chain (the Verify button).

### Memo convention

```
lease:v1:<leaseId>:deposit:<sha256hex>
lease:v1:<leaseId>:rent:<monthIndex>:<sha256hex>
```

- `leaseId` is a random opaque id. It is never a name, ID number or address.
- `sha256hex` is the hash of the final contract text.
- Only hashes, amounts, timestamps and public keys go on-chain. Contract text and documents stay off-chain.

## Current status: custodial escrow on devnet

Stated plainly, so nobody has to guess:

- **Escrow mode today is `ESCROW_MODE=custodial`.** The deposit is transferred to a **platform custody wallet** on devnet. This is not trustless escrow. Whoever controls the platform keypair controls those funds.
- **Transactions are signed server-side** with demo keypairs generated by `pnpm setup:devnet` and held in environment variables. The platform wallet is also the fee payer. The tenant is not signing in a wallet in this build.
- **Not built yet:** the Anchor program `rental_escrow` with a PDA vault and `release_deposit` that needs 2 signatures out of 3 (tenant, landlord, agency). It is planned for this week. Until it exists and passes its tests, nothing in this repo or in the demo should be read as trustless escrow.
- The custodial path will stay as a fallback after the program lands. If the program is not ready in time, the submission will remain custodial and say so.
- Not built yet either: Solana Pay QR payable from Phantom, a persistent database, the agency panel.

## What is simulated

- **Devnet only.** No mainnet, no real funds.
- **Own test token `tUSDC`** (6 decimals), minted by `pnpm setup:devnet`. The UI labels it "USDC (devnet test token)". It is not Circle's USDC.
- **Fake properties** (10 listings in Salta zones, 250 to 700 in demo-token prices), **fake people** (Ana, Bruno, Carla, a landlord and an agency) and **fake documents** (`seed/docs/`). No real person's data is used anywhere.
- Discount percentages and the due date are demo configuration. For the demo the first due date is set to "tomorrow" so that an immediate payment counts as on time.
- A banner in the UI reads "Demo · Solana devnet · simulated data".

## Run it locally

Prerequisites: Node 20 or newer, and pnpm. This project uses pnpm only.

```bash
pnpm install
cp .env.example .env.local
```

Edit `.env.local`:

- `GEMINI_API_KEY`: your own Google Gemini key (only needed for live model calls; without it the app serves recorded responses). `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` is an optional alternative.
- `SESSION_SECRET`: a random string of 32 or more characters. For example `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- Leave `ESCROW_MODE=custodial`, `SOLANA_CLUSTER=devnet` and the devnet RPC URL as they are.

Set up devnet:

```bash
pnpm setup:devnet
```

The script generates demo keypairs and prints the **platform wallet address**. If its balance is zero it stops. Fund that address with devnet SOL at https://faucet.solana.com, then run `pnpm setup:devnet` again. The second run is idempotent: it creates the `tUSDC` mint, the token accounts and funds the three demo tenants, and writes the mint and keys for you to put in `.env.local` (`PAYMENT_MINT`, `*_SECRET_KEY`). Those secret keys are demo keys; never commit them.

Then:

```bash
pnpm dev        # run the app at http://localhost:3000
pnpm test       # unit tests (vitest): discount cases, hashing, rules
pnpm evals      # the Ana / Bruno / Carla eval
```

**Replay mode.** `REPLAY=1` serves recorded model responses for the three demo tenants so the demo does not call the API. Set `REPLAY=1` in `.env.local` (or in the shell, for example `REPLAY=1 pnpm dev` or `REPLAY=1 pnpm evals`) to use it. Replay exists as a fallback for recording the demo if the API fails; it is not a different product behaviour, since the decisions are made by `lib/rules/` either way.

## Security considerations

This is a demo, and these notes say what is and is not protected.

- **Server-side demo keys.** All keypairs are devnet demo keys read from environment variables on the server. They are never sent to the browser and are not in git (`.env*` is ignored; only `.env.example`, with empty values, is committed). Treat the platform key as a hot custody key: it is acceptable only because the funds are a test token on devnet.
- **No PII on-chain or in memos.** On-chain data is limited to public keys, amounts, timestamps and sha256 hashes. Memo strings use an opaque random `leaseId`.
- **Signed client-held session.** Until the database lands, the client keeps the session state and resends it. The server signs it with HMAC-SHA256 (`SESSION_SECRET`) and rejects a bad signature. The client is never the source of truth for an approval: the server recomputes prequal and crosscheck before creating a lease (`POST /api/lease` returns 409 unless the tenant is `APPROVED`), and payment amounts are derived on the server from the lease in the signed session.
- **Uploaded document text is untrusted data.** The extraction prompt treats document content as data, not instructions, and the model's output is only a zod-validated JSON. Decisions stay in `lib/rules/`, so an injected instruction in a payslip cannot approve a tenant. A prompt-injection eval is planned for this week (it is not in v0).
- **Discounts are never computed from client input.** The client sends neither amounts nor timestamps. Discounts and on-time status come from the lease on the server and from the confirmed transaction's `blockTime`.
- **Agents prepare, code executes.** Product agents emit a payment intent. Only `lib/solana/` builds, signs and confirms transactions.
- **Known limitations of v0:** the escrow is custodial (see above); sessions are not persisted; there is no authentication or role model; the program has not been written, so nothing has been audited. TODO(Mauro): re-read this section after the QA gate (`docs/reviews/phase-0.md`) and update it with what QA found.

## How AlquilIA differs from similar projects

To our reading of their public descriptions (TODO(Ani): re-check before submitting; we have not tested these products):

- **Fiador.sol** (Superteam Brazil hackathon): a stablecoin deposit escrow with yield and reputation seals that lower future deposits. AlquilIA's focus is the agency back-office (pre-qualification, cross-check, contract) and a planned 2-of-3 release with the agency as arbiter.
- **RentLock** (United States): rent and deposit escrow in Solana PDAs. AlquilIA is built for Argentine interior agencies and puts the document checks first.

Both comparisons describe the plan for AlquilIA's escrow. The 2-of-3 release is not built yet.

## Questions we expect

- **"Rents in Salta are in pesos. Who pays in USDC?"** Fair question. We have no evidence yet on how many tenants or landlords would. This build settles in USDC; the roadmap is to accept pesos through an on-ramp and settle in USDC. Validation is described below.
- **"What about regulation?"** We have not received legal advice and do not make legal claims here. The design is meant to be regime-agnostic: the contract stays off-chain, only its hash goes on-chain, and USDC is a payment method. The product is intended as software for agencies that stay the intermediary, not as an intermediary itself. TODO(Ani): optional short legal consult; record any outcome in `docs/validation/evidence.md` before citing it.
- **Validation and traction.** None is claimed. Nothing is recorded in `docs/validation/evidence.md` yet. The plan is outreach to real-estate agencies in Salta, landlords and tenants/students, with a letter of intent or pilot as the target. TODO(Ani): replace this paragraph with real, recorded entries only (interviews held, dates, what was said) once they exist.

## Roadmap for the week

Planned, not done:

1. **Anchor escrow program** `rental_escrow` with a PDA vault, `Lease` and `PaymentRecord` accounts, and `release_deposit` that needs 2 of 3 signatures (tenant, landlord, agency). With tests, devnet deployment and a documented account table. If it is not ready by Thursday 08/10 at 12:00 the build stays custodial and says so.
2. **Solana Pay QR** payable with Phantom on devnet, with `reference` polling.
3. **Agency panel**, minimal: the `NEEDS_INFO` queue and a deposit release action.
4. **Persistence** on Neon Postgres (Drizzle), replacing the signed client-held session.
5. Real document upload extraction and a prompt-injection eval.
6. After the hackathon: pay in pesos through an on-ramp and settle in USDC.

Cut for the hackathon: embedded wallet, deposit reduction from payment streak, compressed-NFT badge.

## Tools

- **Blockchain:** Solana (devnet), SPL Token, Memo program.
- **AI model in the product:** Google Gemini (Flash), behind a provider wrapper in `lib/ai/`.
- **App:** Next.js (App Router), TypeScript, Tailwind CSS, Framer Motion, zod. Hosted on Vercel.

## Disclosures

Written for the Superteam Earn "Progress & Disclosures" component.

- **Starting point:** tag `v0-hackathon-start` in https://github.com/Malejo01/keyhold. Work before the hackathon window is not claimed.
- **Pre-existing code imported so far: none.** Any future import will be made in its own commit with the message `chore(import): <module> from <repo>@<sha> (pre-existing)` and will be listed here with that commit.
- **AI-assisted coding:** the code was co-written with Claude Code (AI-assisted). The architecture, prompts and rules were written by the team. The product itself uses Google Gemini at runtime (the model extracts fields from documents and answers catalog questions; it never decides an approval).
- **Third-party open-source components:** Next.js, React, Tailwind CSS, Framer Motion, zod, @solana/web3.js, @solana/spl-token, Google Gen AI SDK (`@google/genai`), Anthropic SDK (optional provider), plus the dev tools in `package.json` (TypeScript, ESLint, Vitest, tsx, dotenv).
- **Funding:** none.
- **License:** MIT (see [`LICENSE`](LICENSE)).
- **Changelog:** `CHANGELOG.md`, one section per day.

## Team

Based in Salta, Argentina.

- **Mauro** (tech lead). TODO(Mauro): one or two factual lines on your background and links (GitHub, X). Do not add anything not verifiable.
- **Ani** (product, pitch, validation). TODO(Ani): one or two factual lines on your background and links.

## Repository layout

```
app/                 Next.js App Router: chat UI and API routes (chat, lease, pay, verify)
components/          UI components (chat, lease timeline, cards)
lib/agents/          Product agents: orchestrator, listings, prequal, crosscheck, lease
lib/rules/           Deterministic rules: prequal, names, pricing
lib/ai/              Model provider wrapper
lib/solana/          Devnet connection, SPL transfer + Memo, hashing, explorer links, verify
seed/                Properties, tenants and simulated documents
scripts/             setup-devnet.ts
evals/               The Ana / Bruno / Carla eval
docs/                Rules, architecture decisions, submission texts
```

Some of these paths are still being written during phase 0. TODO(Mauro): re-check this tree against the repo before submitting.
