# Pitch deck outline (10 slides)

For the product team (Ani and teammates). One message per slide, a visual suggestion and a speaker note. Written Sun 04/10/2026; the name AlquilIA is provisional.

The deck serves three uses: the 2:00 pitch video (the slides marked "2:00 video"), the live Demo Day pitch if we are pre-selected (all ten slides, about 4 minutes, at the organisers' timing), and the Colosseum submission page. It must stay consistent with `pitch-script.md`, which is the word-for-word script for the 2:00 video. If the two ever differ, `pitch-script.md` wins for the video and this file gets fixed.

## Rules for every slide

- Footer on every slide, plain text: "Demo · Solana devnet · simulated data".
- No metrics except the ones in this file, and each of those has a source in the repo. No users, pilots, letters of intent, revenue, partnerships or quotes: none exist.
- Say "custodial" wherever escrow appears. Do not say "trustless" without the next sentence about custody.
- No stock photos of people. No real person's data or documents; the tenants Ana, Bruno and Carla are simulated.
- Screenshots come from `docs/reviews/ux/after/` or from a fresh take of the live demo. They show the provisional design.
- Say nothing about what the law allows.

## Mapping to the 2:00 pitch script

| Deck slide | Pitch script slide | In the 2:00 video |
|---|---|---|
| 1 Title | none | Optional: show for 2 seconds, or skip |
| 2 Problem | 1 "The problem", 0:00 to 0:21 | Yes |
| 3 Solution | 2 "AlquilIA", 0:21 to 0:43 (first half) | Yes |
| 4 Model extracts, code decides | 2 "AlquilIA", 0:21 to 0:43 (second half) | Yes |
| 5 Why Solana | 3 "Why Solana", 0:43 to 1:10 | Yes |
| 6 What works today | none | No (Demo Day and Colosseum only; the demo video shows it) |
| 7 Why now and the honest points | 4 "Why now", 1:10 to 1:34 | Yes |
| 8 Similar projects | none | No (Q&A backup) |
| 9 Who pays, and how we will find out | none | No (Q&A backup; one line sits in slide 10) |
| 10 Roadmap, team and ask | 5 "Team" 1:34 to 1:41 and 6 "Ask" 1:41 to 1:56 | Yes |

## Slides

### 1. Title

- **Message:** AlquilIA is an AI leasing back-office for agencies in Argentina's interior.
- **On the slide:** the name, the line "AI leasing back-office for agencies in Argentina's interior; deposits and rent recorded on Solana with the contract hash", "Salta, Argentina", the live URL https://keyhold-app.vercel.app and the repo https://github.com/Malejo01/keyhold.
- **Visual:** the hero screenshot (`docs/reviews/ux/after/hero-1280-dark.png`), logo large, nothing else.
- **Speaker note (Demo Day only):** "We are from Salta. This is AlquilIA." Then straight to the problem. In the 2:00 video start on slide 2.

### 2. Problem

- **Message:** a small agency checks every tenant by hand, and the deposit sits with whoever is in the middle.
- **On the slide:** three plain lines. "ID + payslip + guarantee, checked by hand." "Deposit held by whoever is in the middle." "Salta, Argentina."
- **Visual:** text only on the brand background, or a simple sketch of three paper documents with one stamped "90 days". No photos of people.
- **Speaker note (2:00 video, 0:00 to 0:21, from the script):** "In Salta, a small agency checks every tenant by hand: ID, payslip, guarantee. An old payslip or a mismatched name slips through. Then the deposit sits with whoever is in the middle, and in a dispute the tenant has little proof of what was paid."
- **Do not add:** a statistic on disputes or unreturned deposits. We have none; the market notes say it is anecdotal.

### 3. Solution

- **Message:** agents check the documents and build the contract; Solana records the money.
- **On the slide:** the flow in five boxes: Find, Check documents, Contract and hash, Deposit and rent on Solana, Receipt and Verify.
- **Visual:** the contract screen (`docs/reviews/ux/after/ana-1280-04-contract.png`) next to the five boxes.
- **Speaker note (2:00 video, 0:21 to 0:43, first half of the script):** "AlquilIA is an AI leasing back-office for agencies in Argentina's interior. One agent reads the documents. A second, independent agent checks the first."
- **Say aloud once, for the jury:** the buyer is the agency; the tenant chat is the front door.

### 4. The model extracts, the code decides

- **Message:** the model never approves anybody; plain code does, so the same case gives the same answer every time.
- **On the slide:** a four-step line: Agent 1 reads, Agent 2 re-checks, Rules decide, Solana records. Under it the three tenants: Ana approved; Bruno stopped (payslip 120 days old, over 90); Carla stopped by the cross-check (name on the payslip differs from the ID).
- **Visual:** the side-by-side evidence screen for Carla (`docs/reviews/ux/after/carla-375-dark-03-docs.png`), "Name on ID" against "Name on payslip" tagged "Does not match". Add a small crop of the Agent activity panel if there is room.
- **Speaker note (2:00 video, second half of 0:21 to 0:43):** "But the model never approves anyone: it extracts, and plain code decides. Then the contract is hashed, and the deposit and rent move on Solana."
- **Backup for questions from technical judges:** the first agent approves Carla, the second agent has its own prompt and finds the different name, and a deterministic name-match rule on its extraction forces the case to need more information. Model output is strict JSON checked with a schema, and an injected line in a document cannot approve anyone because the model has no approval path.

### 5. Why Solana

- **Message:** every payment carries the contract hash, so what was agreed can be checked by anyone; the trustless part is next.
- **On the slide:** three bullets. "Deposit and rent as SPL token transfers." "Contract hash in the Memo of every payment." "No personal data on-chain." Footer line in plain text: "Today: custodial escrow, devnet. Anchor 2-of-3 release: tested on a branch, not deployed."
- **Visual:** a devnet explorer page for a demo deposit with the Memo line `lease:v1:<leaseId>:deposit:<sha256>` highlighted. Take a fresh transaction from a practice run, or use one from `docs/submission/tx-links.md`. The page holds no personal data, so nothing needs blurring.
- **Speaker note (2:00 video, 0:43 to 1:10, from the script):** "Why Solana: it can make the deposit and payment record trustless and portable. Every payment already carries the contract hash, so anyone can verify what was agreed. And the record can follow the tenant, not stay in an agency's files. Today the escrow is custodial, on devnet. The Anchor program with two-of-three release is tested on a branch, not deployed."
- **Do not say:** "secured", "trustless escrow" as a present fact, or that the tenant holds the keys. The server signs with demo keys.

### 6. What works today

- **Message:** a vertical slice that runs end to end with real devnet transactions, and a clear list of what is not in the deployed demo.
- **On the slide:** two columns. Built: chat and stage machine; listings agent; pre-qualification and cross-check with rules; contract hash and Verify; deposit and rent on devnet with Memo; recorded AI answers; evals and an end-to-end test. Not in the deployed demo: peso rails; and, on branches and not merged, the Anchor escrow (CI-tested, not deployed), Solana Pay QR, agency panel, persistence, real document upload, ES/EN UI.
- **Numbers allowed:** 3 simulated tenants; 10 catalogue properties; 2 real devnet transactions per full flow (deposit and rent); API end-to-end 59 of 59 checks (`docs/reviews/`); evals 3 of 3 live and 7 of 7 in replay. Re-check them against the repo before presenting.
- **Visual:** a three-image strip: deposit receipt, Verify match, rent receipt with the on-time badge (`docs/reviews/ux/after/ana-1280-06-deposit-receipt.png`, `ana-1280-08-rent-receipt.png`).
- **Speaker note (Demo Day, about 25 seconds):** "This is running today on devnet: three simulated tenants, real transactions, a public Verify. On the right is what is not in the demo, and we say so."

### 7. Why now, and the honest points

- **Message:** pesos and changing rules are real; the design does not depend on them.
- **On the slide:** three lines. "Stablecoins are already common in Argentina." "Rents in Salta are in pesos: plan is a peso on-ramp, USDC as settlement." "Contract off-chain, hash on-chain: no dependence on one legal regime." Small source line: "Chainalysis, 2026 (see docs/02 §5.3)".
- **Visual:** a simple three-step diagram: pesos, on-ramp (roadmap), USDC settlement and record. Mark the on-ramp "not built".
- **Speaker note (2:00 video, 1:10 to 1:34, from the script):** "Why now: stablecoins are already common in Argentina. Rents in Salta are in pesos, so the plan is a peso on-ramp with USDC as the settlement layer. And rental rules keep changing, so the contract stays off-chain, only its hash goes on-chain, and the design does not depend on one legal regime."
- **Backup for "who pays in USDC in Salta?":** "We have no evidence yet. Rents there are in pesos. USDT is used more than USDC in Argentina (Bitso, 2025: 57% against 14% of stablecoin purchases, per our market notes), so USDC is a settlement choice for the design, not a market claim. We are starting validation with Salta agencies."
- **Backup for regulation:** no legal advice yet; press reports a vote on the DNU 70/2023 on 15/10; the product is software for registered agencies, which stay the intermediary. Say nothing about what the law allows.

### 8. Similar projects

- **Message:** others are further along on-chain; we start from the agency back-office.
- **On the slide:** a small table, three rows. Fiador.sol: stablecoin deposit escrow with yield and reputation seals; on-chain program and tests. RentLock: rent and deposit escrow in PDAs; waitlist. AlquilIA: agency back-office first (cross-check agent, rules); 2-of-3 release with the agency as arbiter is built on a branch, not deployed. Source line: "Public descriptions; we have not run these products."
- **Visual:** the table only. A "ahead of us on-chain" tag on the first two rows is welcome: it is true and it builds trust.
- **Speaker note (Demo Day and Q&A only):** "Fiador.sol and RentLock have on-chain programs today and we do not. We start earlier in the process, with the agency's document checks, and our two-of-three release, where the agency is the arbiter, is tested on a branch and not deployed."
- **Before using:** TODO(Ani) re-read the Fiador.sol and RentLock pages and fix the wording if they have changed.

### 9. Who pays, and how we will find out

- **Message:** agencies are the buyer; that is a hypothesis, and this week is how we test it.
- **On the slide:** "Buyer: licensed real-estate agencies in Salta Capital (hypothesis)." "Wedge: pre-qualification and cross-check back-office." "Pricing: untested, in pesos." "No users, pilots or letters of intent yet." Then the plan: 5 agency interviews, 5 landlord interviews, a 30-answer tenant survey, one letter of intent or pilot as the target, 05/10 to 10/10, every contact logged in the repo.
- **Visual:** a simple checklist with empty boxes. Tick a box only when its row exists in `docs/validation/evidence.md`.
- **Speaker note (Demo Day and Q&A only):** "We have no users yet. This week we talk to Salta agencies, and every conversation goes into a log in the repo before we cite it. A no from an agency is a result too."
- **If real entries exist by the freeze:** replace the plan with the real counts, quoting only the log. If none exist, keep this slide as it is.

### 10. Roadmap, team and ask

- **Message:** what we build next, who we are, and what we ask for.
- **On the slide:** three columns. Roadmap: merge and deploy the Anchor escrow with 2-of-3 release (built on a branch); Solana Pay QR, agency panel, persistence, ES/EN UI (each on a branch, not merged); later, pesos on-ramp and USDC settlement. Team: names and "Salta, Argentina", photos only if the people agree. Ask: "Feedback and mentorship on the Anchor escrow" and "Introductions to agencies", plus the URL and the repo.
- **Visual:** a horizontal timeline with 08/10 12:00 marked "plan B: stay custodial if the program is not merged and deployed".
- **Speaker note (2:00 video, 1:34 to 1:56, from the script):** "We are from Salta. Mauro leads engineering; I lead product and validation." Then: "We have no users yet; this week we start with Salta agencies. We are asking for mentorship on the Anchor escrow, and introductions to agencies. This is AlquilIA."
- **Keep word for word:** "We have no users yet."
- **TODO(Ani):** decide who speaks and who appears; add a background line for Mauro or yourself only if it can be backed by a link (see the team field in `preselection.md`), and cut words elsewhere to stay under 2:00.

## Timing for the live Demo Day version

Suggested split for about 4 minutes, if the organisers give that time: slides 2 to 5 about 1:30, slide 6 about 0:25 (or play the demo video instead), slides 7 to 9 about 1:15, slide 10 about 0:30. If the live slot is 2 minutes, use the 2:00 video cut in the mapping table.

## Checks before recording

- [ ] Every slide has the footer; the escrow is called custodial wherever it appears.
- [ ] No number on a slide is missing from the list in slide 6 or from `docs/validation/evidence.md`.
- [ ] Screenshots are current (the UI is provisional) and show no real person or document.
- [ ] The speaker notes marked "from the script" still match `pitch-script.md` word for word.
- [ ] The video stays at 2:00 or less, in English.
