# Superteam Earn submission draft (Colosseum Crypto World's Fair, Superteam Argentina track)

Deadline: Mon 12/10, 23:59 ART. Internal freeze: Sun 11/10, 20:00. Submit before 18:00 on Mon 12/10 (PLAN R7-2).
Draft written Sun 04/10/2026. **Refresh every answer at the freeze**: escrow mode, links, validation log and status can all change (see the checklist at the end).

## Assumptions (read first)

- `docs/02-hackathon-rules-market-judges.md` §2 lists the five Earn components as: **(1)** deployed link, **(2)** repo with overview and security, **(3)** verifiable validation, **(4)** disclosures, **(5)** team and roadmap. The draft follows that order. The task brief names component 4 "Progress & Disclosures", so it also holds the starting-point record and the changelog link.
- The exact field names, order and character limits on the Earn listing are **not verified**: docs/02 §8 says the listing page is JavaScript-rendered and was not read. Each answer is therefore written as one paragraph under 2,000 characters, which fits a typical long text box. If a field has a lower limit, trim from the end of the paragraph; the facts are ordered most important first.
- Counts are in characters (Unicode code points, spaces and punctuation included, LF line endings), first measured with exact-length regex probes on 2026-10-04 and re-checked by QA with node. Answers 2, 4 and 5 were edited afterwards (branch status, see `docs/reviews/b8-submission.md`); their new counts were computed by hand and need a recount by the lead. Paste into the form and trust the form's own counter if it disagrees.
- The product name is **AlquilIA**, provisional; the repo and URL still say "keyhold".
- `TODO(...)` markers are for humans and must be gone before submitting.

## Summary table

| # | Component | Answer | Chars |
|---|---|---|---|
| 1 | Deployed link | below | 731 |
| 2 | Repo with overview and security | below | 1,222 (hand count; recount by lead) |
| 3 | Verifiable validation | below | 1,240 |
| 4 | Progress & Disclosures | below | 1,610 (hand count; recount by lead) |
| 5 | Team and roadmap | below | 1,164 (hand count; recount by lead) |

## 1. Deployed link (731 characters)

```
Live demo: https://keyhold-app.vercel.app (the product is called AlquilIA; the address keeps the earlier working name). It runs on Solana devnet with simulated data and a test token. Click "Try the demo", pick a tenant (Ana, Bruno or Carla), and follow the chips: find a place, upload documents, generate the contract, pay the deposit, verify, pay the first rent. Every payment is a real devnet transaction, and the receipt links to the explorer. The AI answers on this URL are recordings of real Gemini responses, so the demo is repeatable; decisions are made by deterministic code either way. The escrow is custodial today (a platform wallet with demo keys). Repo: https://github.com/Malejo01/keyhold. Demo video: TODO(Ani) link.
```

Check before sending: the URL loads, shows the banner "Demo · Solana devnet · simulated data", and `node tests/e2e/phase0.mjs` passes against it (the demo wallets need test tokens: `pnpm setup:devnet`).

## 2. Repo with overview and security (1,222 characters, hand count; recount by lead)

```
Repository: https://github.com/Malejo01/keyhold (MIT). The README covers the problem, the demo flow, the architecture with a Mermaid diagram, the product agents, what Solana is used for, security considerations, what is simulated, disclosures, the roadmap and how to run it. Overview: AlquilIA is an AI leasing back-office for agencies in Argentina's interior. A model extracts fields from a tenant's documents, a second independent agent extracts them again, and plain code in lib/rules decides APPROVED, NEEDS_INFO or REJECTED. For an approved tenant the app builds a contract, hashes it with sha256, and moves the deposit and rent as SPL token transfers on devnet, each with a Memo carrying the lease id and the contract hash. Security: devnet only; no keys in git; keys stay in server modules; no personal data on-chain; sessions are HMAC-signed and the server recomputes approvals and amounts; on-time status comes from the confirmed blockTime; document text is untrusted and the model cannot approve anyone. Known gaps, stated in the README: custodial escrow, the Anchor program is on a branch and not deployed, a signed session can be replayed (a fix is on a branch, not merged), no authentication, nothing audited.
```

Check before sending: the repo is public, or shared with `hackathon@superteam.ar` (and `hackathon@colosseum.com` for Colosseum); the README has no leftover `TODO` that a judge would see (team lines are the expected exception until filled).

## 3. Verifiable validation (1,240 characters)

```
No market validation exists yet, and we do not claim any: no users, pilots, letters of intent, interviews, surveys or revenue. docs/validation/evidence.md is the log and has no entries. What we have is technical evidence you can check yourself: real devnet transactions for a demo lease (a deposit and a rent payment, each with a Memo whose trailing hash equals the contract sha256) listed in docs/submission/tx-links.md, and test runs recorded in docs/reviews/ (the API end-to-end script passed 59 of 59 checks on the deployed app). That shows the product works. It does not show that anyone wants it. Validation plan, 05/10 to 10/10: 5 interviews with Salta real-estate agencies, 5 with direct landlords, a 30-answer tenant and student survey, a short legal consult, and one letter of intent or pilot request as the target. Each contact is logged with date, role, what was said and a link to the note before we cite it anywhere. A negative answer is logged as negative. Pricing is untested: per active lease, per cross-checked file, or a hybrid, quoted in pesos. Contact list: docs/validation/agencies-salta.md. Plan: docs/submission/gtm.md. TODO(Ani): replace this text with a summary of the real log if entries exist at submission time.
```

Rule for this component: every number or claim about people must point to a row in `docs/validation/evidence.md`. If there is no row, there is no claim. If interviews happen, rewrite the first two sentences to state the real counts and keep the sentence "It does not show that anyone wants it" only if it is still true. A negative result is a valid entry and should be reported as such.

## 4. Progress & Disclosures (1,610 characters, hand count; recount by lead)

```
Starting point: tag v0-hackathon-start (2026-10-03) in the repo above. Nothing before it is claimed. CHANGELOG.md has one section per day. Progress so far, from the changelog: a custodial devnet payment flow with Memo and blockTime pricing; an orchestrator and four product agents with replayable recordings; evals for Ana, Bruno and Carla; a redesigned UI; a QA gate with recorded findings. Built on branches, not merged into main: an Anchor program (69 of 69 integration tests and 6 of 6 cargo tests in CI, not deployed), a green Linux CI workflow, persistence with a fallback (Neon not provisioned), Solana Pay behind a flag, an agency panel, real uploads and an ES/EN UI. Pre-existing code: none imported. The pattern of a model that extracts and a deterministic filter that decides is the one Mauro used in an earlier project (Qué Pinta Salta); no code was copied. Any future import goes in its own commit, "chore(import): <module> from <repo>@<sha> (pre-existing)", and is listed in the README. AI use: most of the implementation was written with Claude Code, Anthropic's AI coding assistant, from the team's specs; the team sets the architecture, the rules and the intent of the prompts. The product itself calls Google Gemini (gemini-3.5-flash-lite) to extract fields and answer catalogue questions; it never decides an approval or a price. Open-source components: Next.js, React, Tailwind CSS, Framer Motion, zod, @solana/web3.js, @solana/spl-token, @google/genai. Funding: none. Simulated: devnet, the test token tUSDC, fake properties, people and documents. Escrow: custodial at the time of writing.
```

Notes:
- The pre-existing-code statement is true as of the draft (README › Disclosures, PLAN §8). If any module is imported later, it needs its own `chore(import)` commit first; update this answer and the README together.
- "Most of the implementation was written with Claude Code" is the honest scale of AI use. TODO(Mauro): confirm the wording.
- Update "Progress so far" from `CHANGELOG.md` at the freeze. The branch sentence names work as "not merged"; when a branch merges, move it into the main list, and say "deployed" only for what is deployed. The test figures come from the `f3-anchor` branch's CI and QA review, not from a run by the writer.

## 5. Team and roadmap (1,164 characters, hand count; recount by lead)

```
Team, based in Salta, Argentina. Mauro Alejandro Lizarraga, tech lead: app, agents, rules, Solana integration. TODO(Mauro): verifiable background lines and links. Ani (TODO(Ani): surname), product, pitch and validation. TODO(Ani): verifiable background lines and links. Design partner: TODO(Ani) or delete. Team Leader for prize payout and KYC: TODO(Ani) and TODO(Mauro) decide. Roadmap, hackathon week (each already exists on a branch, not merged; the work left is merging, verifying and deploying): Neon persistence replacing the signed browser session and closing its replay gap; real document upload with a prompt-injection eval; an Anchor program rental_escrow with a PDA vault and 2-of-3 release (tenant, landlord, agency), with tests; a Solana Pay QR for Phantom; a minimal agency panel; an ES/EN UI. Plan B: if the program is not merged and deployed by Thu 08/10 at 12:00, the submission stays custodial and says so. After the hackathon: pay in pesos through an on-ramp with USDC as the settlement layer; a legal review and a program audit before any real funds; agency pilots only if validation supports them. The 90-day plan is in docs/submission/gtm.md.
```

Before submitting: delete the "Team Leader" sentence from the answer (it is a note to the humans), and delete "Plan B" once the escrow mode is final. Every team member must be registered on Colosseum with country Argentina (docs/02 §1).

## Evidence index for the jury

| Claim | Where to check |
|---|---|
| Real devnet transactions with Memo | `docs/submission/tx-links.md` (deposit `55eFWkSF…`, rent `2w5SyNqw…`, lease `demo-de2034a10738`, contract sha256 `360f2888…ed69e`) |
| Custodial escrow stated | README › "Custodial escrow on devnet, stated plainly" |
| QA gate and findings | `docs/reviews/phase-0.md`, `phase-1-design.md`, `phase-1-recording.md` |
| Architecture decisions | `docs/03-architecture-decisions.md` |
| Weekly progress | `CHANGELOG.md` |
| Validation log (empty at the time of writing) | `docs/validation/evidence.md` |

## Refresh checklist at the freeze (Sun 11/10)

- [ ] Escrow mode: still custodial? The Anchor program already passes its tests on branch `f3-anchor` but is not merged or deployed. If it is merged, deployed and called by the demo, change answers 1, 2, 4 and 5 and the README together, and add the program id and test results; never claim trustless before that, and keep the custody sentence (the demo server holds the landlord and agency keys, so the escrow stays custodial in substance).
- [ ] Branch work (persistence, Solana Pay, agency panel, uploads, ES/EN, CI): for each branch merged, move it from "on a branch" to "built" in answers 4 and 5 and the README table; for each not merged, leave the wording.
- [ ] Demo video and pitch video links (TODO(Ani)); the repo is public or shared; Team Leader chosen.
- [ ] `docs/validation/evidence.md`: rewrite answer 3 from the real rows only.
- [ ] Re-run `node tests/e2e/phase0.mjs` against production; update the "59 of 59" figure if it changes.
- [ ] Re-count every answer that changed (exact-length probe or `node -e "console.log(s.length)"`); update the table.
- [ ] No `TODO(` left in the text pasted into Earn.
