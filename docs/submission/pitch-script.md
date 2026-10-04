# Pitch script (max 2:00, English)

Speaker: Ani (product lead), or whoever on the product team records it. Recorded by the product team, not by Mauro.
Pace: about 130 words per minute. Spoken words below: **243** (about 1:52 at that pace, leaving a few seconds of pause).
Rules: no users, pilots, LOIs, revenue or partnerships are claimed, because none exist. The pitch does not repeat the demo; the demo (max 3:00) shows the flow.

## Timed script

| Time | On screen / slide | Words |
|---|---|---|
| 0:00 - 0:21 | Slide 1, "The problem": a plain slide, three lines: "ID + payslip + guarantee, checked by hand" / "Deposit held by whoever is in the middle" / "Salta, Argentina". No stock photos of real people. | "In Salta, a small agency checks every tenant by hand: ID, payslip, guarantee. An old payslip or a mismatched name slips through. Then the deposit sits with whoever is in the middle, and in a dispute the tenant has little proof of what was paid." (45 words) |
| 0:21 - 0:43 | Slide 2, "AlquilIA": the line "AI leasing back-office for agencies in Argentina's interior; deposits and rent recorded on Solana with the contract hash", and a simple diagram: Agent 1 reads, Agent 2 re-checks, Rules decide, Solana records. | "AlquilIA is an AI leasing back-office for agencies in Argentina's interior. One agent reads the documents. A second, independent agent checks the first. But the model never approves anyone: it extracts, and plain code decides. Then the contract is hashed, and the deposit and rent move on Solana." (48 words) |
| 0:43 - 1:10 | Slide 3, "Why Solana": three bullets: "Deposit and rent as SPL token transfers", "Contract hash in the Memo of every payment", "No personal data on-chain". Footer in plain text: "Today: custodial escrow, devnet. Anchor 2-of-3 release: in progress." | "Why Solana: it can make the deposit and payment record trustless and portable. Every payment already carries the contract hash, so anyone can verify what was agreed. And the record can follow the tenant, not stay in an agency's files. Today the escrow is custodial, on devnet. The Anchor program with two-of-three release is in progress, not built." (58 words) |
| 1:10 - 1:34 | Slide 4, "Why now, and the honest points": "Stablecoins are common in Argentina" / "Rents in Salta: pesos. Plan: peso on-ramp, USDC settlement" / "Contract off-chain, hash on-chain: regime-agnostic". | "Why now: stablecoins are already common in Argentina. Rents in Salta are in pesos, so the plan is a peso on-ramp with USDC as the settlement layer. And rental rules keep changing, so the contract stays off-chain, only its hash goes on-chain, and the design does not depend on one legal regime." (52 words) |
| 1:34 - 1:41 | Slide 5, "Team": names and "Salta, Argentina". Photos only if the people agree. | "We are from Salta. Mauro leads engineering; I lead product and validation." (12 words) |
| 1:41 - 1:56 | Slide 6, "Ask": "Feedback and mentorship on the Anchor escrow" / "Introductions to agencies" / URL https://keyhold-app.vercel.app and repo https://github.com/Malejo01/keyhold. | "We have no users yet; this week we start with Salta agencies. We are asking for mentorship on the Anchor escrow, and introductions to agencies. This is AlquilIA." (28 words) |

Word count: 45 + 48 + 58 + 52 + 12 + 28 = **243 words** (hyphenated terms such as "back-office", "on-ramp" and "two-of-three" count as one word; counted by hand). That is about 1:52 at 130 words per minute, under the 2:00 limit.

## Notes for the recording

- The two honest lines to keep word for word: "Today the escrow is custodial, on devnet." and "We have no users yet."
- Do not add numbers or claims that are not in `docs/validation/evidence.md`. If the market teammate records real interviews before the recording, one sentence may be added here, citing only what the log says (see `gtm.md`).
- Do not say "trustless" without the next sentence about custody; the script keeps them together on purpose.
- Do not say anything about what the law allows. The only legal statement is the design one: contract off-chain, hash on-chain.
- The 0:00 line of `demo-script.md` currently repeats this problem statement. It will be rewritten so that the demo opens on the product, not the problem.
- TODO(Ani): decide who speaks and who is on slide 5. If you want a verified background line for Mauro or yourself, add it only if it can be backed by a link (see the team field in `preselection.md`), and cut words elsewhere to stay under 2:00.
- Language: English only, as required by the pre-selection.
