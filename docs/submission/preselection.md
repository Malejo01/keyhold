# Pre-selection form answers (superteam.ar/colosseum/preseleccion)

Deadline: Sun 04/10, before 16:00 ART (internal target: before 15:30). Fields are in the order listed in `docs/02-hackathon-rules-market-judges.md` §1.1.
Character counts were done by hand, counting spaces and punctuation, with a single space between sentences and a single line break counted as 1 character. Paste each answer into the form and re-check the counter the form shows; if it disagrees, trust the form and trim.
Status of the product at the time of writing: devnet only, simulated data, escrow is **custodial** (platform wallet, server signs with demo keys), Anchor program with 2-of-3 release in progress and not built.

## 1. Name, email, Telegram, city and province

| Field | Answer |
|---|---|
| Name | TODO(Ani) or TODO(Mauro): whoever submits the form, full name |
| Email | TODO(Ani) or TODO(Mauro) |
| Telegram | TODO(Ani) or TODO(Mauro): handle. The Google Form also asks whether the Telegram name was changed to "Name Surname \| Keyhold" and for the X link: TODO(Ani) |
| City and province | Salta, Salta |

## 2. Project name

`Keyhold` (working name; the final brand is not defined). Count: 7.

## 3. One-liner (limit 140 characters)

```
AI leasing back-office for agencies in Argentina's interior; deposits and rent recorded on Solana with the contract hash.
```

Count: **121** of 140. (Based on the positioning line, but without "trustless", because the escrow is custodial today.)

## 4. Description (limit 50 to 2000 characters)

```
Keyhold is an AI leasing back-office for real-estate agencies in Argentina's interior. Small agencies in Salta check each tenant's ID, payslip and guarantee by hand, and the security deposit sits with whoever is in the middle. Keyhold's agents read the documents and a second, independent agent re-checks them. The model only extracts fields; deterministic code decides approval. The lease is hashed (sha256), and the deposit and rent are paid as SPL token transfers on Solana devnet, each with a Memo carrying the contract hash. Only hashes, amounts, timestamps and public keys go on-chain; no personal data. What is real today: a working app at keyhold-app.vercel.app with three simulated tenants (one approved, one stopped for an old payslip, one stopped by the cross-check for a name mismatch) and real devnet transactions. What is not: the escrow is custodial today (a platform wallet on devnet, signed by the server with demo keys). An Anchor program with 2-of-3 release between tenant, landlord and agency is in progress, not built. Rents in Salta are in pesos; the roadmap is a peso on-ramp with USDC as the settlement layer. All data and the tUSDC token are simulated.
```

Count: **1,177** (nine sentences of 86, 139, 83, 68, 149, 79, 217, 211 and 137 characters plus 8 spaces). Inside 50 to 2000.

## 5. Blockchains and tools

```
Solana (devnet), SPL Token, Memo program, @solana/web3.js, Google Gemini (Flash-Lite), Next.js, TypeScript, Tailwind CSS, Vercel
```

Count: 128. Notes: the model in the product is Google Gemini. Claude Code is not listed here; it is declared as the AI coding assistant in the README Disclosures. Solana Pay is not listed because it is planned, not built (the draft in docs/02 listed it).

## 6. Logo (optional)

TODO(Ani): link to the logo, or leave empty. Do not add one that was not made for this project.

## 7. Pitch video (2 min) and demo video (max 3 min)

| Field | Answer |
|---|---|
| Pitch video link (max 2:00, English, YouTube, Loom or Drive) | TODO(Ani): link after recording. Script: `docs/submission/pitch-script.md` (243 words) |
| Demo video link (max 3:00, English) | TODO(Ani) or TODO(Mauro): link after recording. Script: `docs/submission/demo-script.md`. The product team records; set link sharing to "anyone with the link can view" |

Rule from docs/02: no real people or material without permission in the videos. Data is 100% simulated.

## 8. GitHub repository

```
https://github.com/Malejo01/keyhold
```

Count: 35. TODO(Mauro): confirm the repo is public. If it is private, share it with `hackathon@superteam.ar` (and later `hackathon@colosseum.com` for the Colosseum submission) before submitting.

## 9. Colosseum project (optional)

TODO(Ani): link to the project on arena.colosseum.org if it has been registered with location Argentina, or leave empty.

## 10. Team (limit 2000 characters)

Draft with placeholders. Do not add claims that cannot be backed by a link. The fixed text below is about 330 characters, so the humans have roughly 1,600 left; re-count after filling in.

```
Based in Salta, Salta, Argentina.

Mauro Alejandro Lizarraga, tech lead. Builds the app, the agents, the rules and the Solana integration. TODO(Mauro): one or two verifiable lines on past work, with links (GitHub, X, any shipped project).

Ani TODO(Ani): surname, product lead. Owns the pitch, the validation plan and the agency conversations. TODO(Ani): one or two verifiable lines on background, with links.

Design partner: TODO(Ani): name and role, or delete this line.

The code was co-written with Claude Code (AI-assisted); architecture, prompts and rules are by the team.
```

Notes:
- docs/02 §6.1 says Mauro took an assistant (Tuki) to a formal municipal proposal and built the QPS pipeline in production. These are Mauro's own claims, not recorded as evidence in the repo. Include them only if Mauro confirms the wording and can link to them. Say "formal proposal", not "contract" or "client", unless that is true.
- If other modules from those projects are ever copied, they go in their own commit and in README Disclosures. Nothing has been imported so far.

## 11. Go-to-market and validation (limit 2000 characters)

Align with `docs/submission/gtm.md` (written in parallel by the market teammate): if that file has a final text, replace this draft with it, keeping the "no traction" statement and the count under 2000. This draft is a plan, not traction.

```
No traction yet: Keyhold has no users, pilots, letters of intent or revenue. This is a plan.
Buyer: small real-estate agencies in Salta that run lettings by hand.
Hypothesis, not yet tested: they would pay a fee per lease for faster, more consistent tenant checks.
Keyhold is software for agencies, which stay the registered intermediary; it is not an intermediary itself.
Validation plan for the coming week: interview 5 real-estate agencies in Salta (time spent on tenant checks, deposit disputes, willingness to pay), 5 direct landlords, and survey 30 tenants or students (was the deposit returned; do they hold stablecoins). Target: one letter of intent or pilot. Each conversation is logged with date and notes in the repo before we cite it.
Currency: rents in Salta are in pesos. USDC is the settlement layer in this build; the roadmap is a peso on-ramp so tenants pay in pesos and the agency receives USDC or pesos. Early adopters we would test first: mining professionals, remote workers paid abroad, and students supported from abroad. We do not yet know how many hold USDC.
Regulation: no legal advice yet. The design is regime-agnostic: the contract stays off-chain, only its hash goes on-chain, and USDC is a payment method. Rental rules in Argentina may change, and the product does not depend on one regime. A short legal consult is planned.
Similar projects: Fiador.sol (deposit escrow with yield and reputation) and RentLock (rent escrow in Solana PDAs). Keyhold starts from the agency back-office, with document checks before any money moves; its planned 2-of-3 release is not built yet. Comparison based on public descriptions; we have not tested them.
```

Count: **1,670** characters (eight paragraphs of 92, 69, 101, 108, 372, 336, 271 and 314 characters, plus 7 line breaks counted as 1 each; paragraphs 2 to 4 are separate lines in the block above). If the form counts a line break as 2, it is 1,677. Under 2000.

Open items for the market teammate: replace the plan with real, recorded contacts only after they are logged in `docs/validation/evidence.md` (the file does not exist yet at the time of writing). The mining, remote-worker and student segments come from the market notes in docs/02 §5.3 and are hypotheses.

## 12. Privacy checkbox

TODO(Ani) or TODO(Mauro): read the privacy notice and tick the box yourself.

## Before submitting (checklist)

- [ ] Every team member has an account on arena.colosseum.org with country Argentina, and the project is registered with location Argentina (docs/02 §1). If unsure whether one member or all must be registered, ask Nico Fernandez on Telegram (t.me/NicoFernandez17).
- [ ] Team Leader decided (prizes are paid to the Team Leader, with KYC): TODO(Ani) and TODO(Mauro).
- [ ] Pitch video recorded, English, 2:00 or less, link opens without login.
- [ ] Demo video recorded, English, 3:00 or less, link opens without login. No real people or real documents shown.
- [ ] Repo is public, or shared with `hackathon@superteam.ar` if private.
- [ ] README is in English and has a Disclosures section (pre-existing code: none imported so far; third-party components; AI-assisted coding with Claude Code; funding: none). Starting-point tag `v0-hackathon-start` is on GitHub.
- [ ] README open TODOs closed or consciously left: team bios and links, video links, Fiador.sol and RentLock comparison re-check.
- [ ] The text in the form says "custodial" wherever escrow is mentioned; nothing says "trustless escrow" as a present fact.
- [ ] Production URL https://keyhold-app.vercel.app loads and shows the banner "Demo · Solana devnet · simulated data".
- [ ] Character counts checked against the form's own counters (one-liner 140, description 50 to 2000, team 2000, GTM 2000).
- [ ] No invented traction anywhere. Anything in the GTM field about contacts must be backed by an entry in `docs/validation/evidence.md`.
- [ ] Submit before 15:30 ART; the form closes at 16:00 ART.
