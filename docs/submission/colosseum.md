# Colosseum submission draft (Crypto World's Fair, Superteam Argentina track)

Deadline: Mon 12/10, 23:59 PT is 13/10 03:59 ART, but the submission is **mandatory on 12/10** together with Superteam Earn (docs/02 §1). Internal freeze: Sun 11/10, 20:00. Target: submit before 18:00 ART on Mon 12/10.
Draft written Sun 04/10/2026. Status of the product at the time of writing: devnet only, simulated data, escrow **custodial**, Anchor program **not on `main`: built and CI-tested on a branch, not deployed**. Refresh at the freeze.

## Assumptions (read first)

- `docs/02-hackathon-rules-market-judges.md` lists the pre-selection form fields (§1.1) but **not** the field list of the Colosseum (Arena) project form. The fields below are an assumption based on the pre-selection form and the task brief: name, one-liner, description, tools, team, go-to-market, plus links and the project's country. If the Arena form has other fields (for example separate problem, solution or "challenges" boxes), reuse the matching paragraph of the description and the "Why Solana" and "Business model" answers; nothing needs to be invented.
- Limits on the Arena form are unknown. The one-liner is kept under 140 characters and every long answer under 2,000, the pre-selection limits.
- Counts are Unicode code points with spaces and punctuation, measured with exact-length regex probes on 2026-10-04 and re-checked by QA with node. The description and "Why Solana" were edited afterwards (branch status and the "trustless" wording); their new counts (1,828 and 1,036) were computed by hand and need a recount by the lead. Trust the form's own counter if it disagrees.
- Every team member needs an Arena account with country **Argentina**, and the project location must be Argentina (docs/02 §1). Whether one member or all must be registered is unconfirmed; ask Nico Fernandez on Telegram (t.me/NicoFernandez17).
- The product name is **AlquilIA**, provisional; the repo and URL still say "keyhold".

## Fields

### Project name

`AlquilIA` (provisional name; formerly Keyhold). Known name conflicts to weigh before confirming: alquilia.io, alquilia.eu and an app named "Alquilia" from Salta on Google Play (docs/HANDOFF.md). 8 characters.

### One-liner (limit 140 assumed)

```
AI leasing back-office for agencies in Argentina's interior; deposits and rent recorded on Solana with the contract hash.
```

121 characters. It avoids "trustless" because the escrow is custodial today. If the Anchor escrow is merged, deployed and used by the demo (it already passes its tests on a branch), the positioning line can be used: "AI leasing back-office for real-estate agencies in Argentina's interior; Solana makes the deposit and payment record trustless and portable." That line is exactly 140 characters, so it fits the limit with no room to spare.

### Description (1,828 characters, hand count; recount by lead)

```
AlquilIA is an AI leasing back-office for real-estate agencies in Argentina's interior; the aim is for Solana to make the deposit and payment record trustless and portable. In the deployed demo, only the first half and a recorded payment trail are built, and the escrow is custodial. In Salta a small agency checks each tenant's ID, payslip and guarantee by hand, and the deposit sits with whoever is in the middle. In AlquilIA a chat agent finds listings from a catalogue. Then one agent extracts fields from the tenant's documents, a second independent agent extracts them again with its own prompt, and plain code decides: payslip at most 90 days old, names matching the ID, rent at most 35% of income. The model never approves anybody. For an approved tenant the app builds a contract from a template, hashes it with sha256, and moves the deposit and the first rent as SPL token transfers on Solana devnet. Each transaction carries a Memo with the lease id and the contract hash, so anyone can verify what was agreed. The on-time discount is computed from the confirmed transaction's blockTime. Only hashes, amounts, timestamps and public keys go on-chain. Built: the full flow for three simulated tenants (one approved, one stopped for an old payslip, one stopped by the cross-check for a name mismatch), real devnet transactions, a public Verify, a replay mode for recorded AI answers, evals and an end-to-end test. Not in the deployed demo: peso rails, and work that sits on unmerged branches: the Anchor escrow with 2-of-3 release (CI-tested, not deployed), Solana Pay behind a flag, an agency panel, persistence, real document upload and an ES/EN UI. Rents in Salta are in pesos, so the plan is a peso on-ramp with USDC as the settlement layer. No users, pilots or revenue exist yet. All data and the tUSDC token are simulated.
```

### Why Solana (1,036 characters, hand count; recount by lead)

```
AlquilIA uses Solana for the money and the record, not for deciding anything about the tenant. Deposit and rent are SPL token transfers, and each carries a Memo in the same transaction with the lease id and the sha256 of the exact contract text. Fees are low enough for every rent payment to carry its own record, and confirmation is fast enough for a checkout screen. The on-time status comes from the confirmed blockTime, not from a client clock. A public Verify recomputes the hash from the contract and compares it with the chain. That is what exists today. What is not live yet is the part that makes it trustless: an Anchor program with a PDA vault and a 2-of-3 release between tenant, landlord and agency, where the program's Clock replaces the server's time. That program is built and CI-tested on a branch, but it is not merged or deployed, so the escrow in the demo is a platform wallet on devnet and the demo says so. Solana Pay with a Phantom QR, behind a flag on a branch, would let the tenant sign instead of a server key.
```

### Business model and go-to-market (1,279 characters)

```
Buyer: licensed real-estate agencies, starting in Salta Capital. Wedge: the pre-qualification and cross-check back-office, which we assume agencies still do by hand; search and visit booking are treated as a commodity. This is a hypothesis, and no agency has been asked yet. Pricing hypotheses, all untested and quoted in pesos: per active lease per month, per cross-checked file, or a flat base plus a per-file fee. No price is proposed until we learn what agencies spend today in staff time. AlquilIA is software for agencies, which stay the intermediary; the agency is also the planned arbiter in the 2-of-3 deposit release. Salta alone is a small market, so we treat it as a beachhead and make no expansion claim without evidence. Risks: rents are in pesos and USDC demand is unproven; regulation is uncertain and unreviewed (a vote on DNU 70/2023 is reported for 15/10, brokerage rules, virtual-asset rules if the escrow counts as custody); competitors such as Fiador.sol and RentLock are further along on-chain. Validation plan, 05/10 to 10/10: 5 agency interviews, 5 landlord interviews, a 30-answer tenant survey, a short legal consult and one letter of intent or pilot as the target, each logged in docs/validation/evidence.md before it is cited. Today the log is empty.
```

If the Arena form has a separate GTM box with the 2,000 limit, the pre-selection GTM text (`preselection.md` §11) can be used instead; both say there is no traction.

### Tools and technologies (128 characters)

```
Solana (devnet), SPL Token, Memo program, @solana/web3.js, Google Gemini (Flash-Lite), Next.js, TypeScript, Tailwind CSS, Vercel
```

Claude Code is declared as the AI coding assistant in the README Disclosures and the Earn submission, not as a product tool. Solana Pay and Anchor are not listed until they are merged and deployed.

### Team

Use `preselection.md` §10 (limit 2,000), after the humans fill the `TODO` markers: Mauro Alejandro Lizarraga (tech lead), Ani (product, pitch, validation), optional design partner, Salta, Argentina. Only verifiable background lines with links. docs/02 §6.1 mentions Mauro's earlier assistant for a municipal proposal and his production extraction pipeline (Qué Pinta Salta); include them only if Mauro confirms the wording and can link to them, and say "formal proposal", not "contract" or "client", unless that is true.

### Links

| Field | Value |
|---|---|
| Live demo | https://keyhold-app.vercel.app |
| Repository | https://github.com/Malejo01/keyhold (MIT; public, or shared with `hackathon@superteam.ar` and `hackathon@colosseum.com`) |
| Pitch video (max 2:00, English) | TODO(Ani) |
| Demo video (max 3:00, English) | TODO(Ani) or TODO(Mauro) |
| Devnet transactions | `docs/submission/tx-links.md` in the repo |
| Superteam Earn submission | filled separately: `docs/submission/earn.md` |
| Logo | TODO(Ani), or leave empty |
| X account | TODO(Ani) |

### Track and location

Superteam Argentina track. Project location: Argentina (Salta, Salta). Prize payout goes to the Team Leader after KYC: TODO(Ani) and TODO(Mauro) decide who it is.

## Honest status

| Piece | Built | Detail |
|---|---|---|
| Chat with stage machine (search, visit, documents, contract, payment, active) | Yes | Intent detection and transitions are code; the model never moves a stage |
| Listings agent over a 10-property catalogue | Yes | Catalogue tools only; deterministic fallback |
| Pre-qualification agent and independent cross-check agent | Yes | Three simulated tenants; the model extracts, `lib/rules` decides |
| Contract template, sha256, public Verify against the Memo | Yes | |
| Deposit and rent as SPL transfers with Memo on devnet | Yes | Real transactions; see `tx-links.md` |
| On-time status from confirmed `blockTime` | Yes | The rent quote still uses server time; `onTime` is recomputed from `blockTime` |
| Recorded AI answers (`REPLAY=1`) | Yes | Production serves recordings of real Gemini responses |
| Evals and API end-to-end test | Yes | Evals 3/3 live and 7/7 in replay; e2e 59/59 (docs/reviews) |
| Unit tests (vitest) | Written, not verified on `main` | Could not run on the author's machine; a Linux CI workflow is green on a branch, not on `main` |
| Escrow | Custodial | Platform wallet, server signs with demo keys. `ESCROW_MODE` in `.env.example` is a placeholder no code reads |
| Anchor `rental_escrow`, PDA vault, 2-of-3 release | Not on `main` | Built and CI-tested on branch `f3-anchor` (69 of 69 integration tests, 6 of 6 cargo tests; QA re-gate GO). Not deployed, not used by the demo. Plan B: freeze custodial on Thu 08/10 at 12:00 if it is not merged and deployed |
| Solana Pay QR with Phantom | On a branch | Behind a feature flag; not on `main` |
| Agency panel | On a branch | Not on `main` |
| Persistence and fix for session replay | On a branch | Falls back when no database is configured; Neon is not provisioned; the replay limitation is open on the deployed demo and documented |
| Real document upload and extraction | On a branch | On `main`, "Upload" loads simulated documents |
| Peso on-ramp, USDC settlement | No | Roadmap (AD-07) |
| Bilingual UI (ES/EN) | On a branch | Not on `main`; agents already reply in the user's language |
| Users, pilots, letters of intent, revenue | None | `docs/validation/evidence.md` is empty |

## Self-assessment against the official criteria

Criteria from docs/02 §6.1 (Colosseum rules, no published weights). The answers are for the team to check before submitting, not for pasting.

| Criterion | Where we stand today | What would raise it |
|---|---|---|
| Functionality | A working vertical slice with real devnet transactions and a deterministic decision layer; escrow is custodial | Merge and deploy the Anchor program, which already has an integration suite on a branch, and have the demo call it |
| Potential impact | Salta alone is small; the claim is the interior of Argentina, untested. Argentina's stablecoin adoption is high (docs/02 cites Chainalysis, 2026) but USDT is used more than USDC (Bitso, 2025) | Real agency interviews; a peso on-ramp |
| Novelty | An independent cross-check agent with code-decided rules is working. The 2-of-3 release with the agency as arbiter is built and CI-tested on a branch, not deployed. Fiador.sol and RentLock are further along on-chain | Deploy the program and use it in the demo; the payment record that reduces a deposit (AD-13, out of scope this week) |
| UX with blockchain | The word "blockchain" does not appear in the tenant UI; payment is one button. But the server signs, so the tenant does not hold keys | Solana Pay QR with Phantom |
| Open source and composability | MIT license; composes with the SPL Token and Memo programs | Public repo; merge the Anchor IDL and `docs/onchain.md` that already exist on the branch |
| Business plan | B2B for agencies; pricing and demand untested | Interviews, a letter of intent or pilot, a first price test |

## Before submitting

- [ ] Run Colosseum Copilot with the prompt "What's the weakest part of my submission?" and address the answer (PLAN F6). Not done yet.
- [ ] Re-read every answer against the product at the freeze; update the status table and the one-liner if the escrow mode changed.
- [ ] Videos recorded in English, 2:00 and 3:00 or less, links open without login; no real people or documents.
- [ ] Repo access for `hackathon@colosseum.com`; every team member registered with country Argentina; project location Argentina.
- [ ] No `TODO(` left in pasted text; no claim without a row in `docs/validation/evidence.md`.
- [ ] Submitted on 12/10 to both Earn and Colosseum, even though Colosseum closes at 03:59 ART on 13/10.
