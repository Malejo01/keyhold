# Demo script (max 3:00, English)

Speaker: Mauro, on screen. Follows section 3.5 of `docs/02-hackathon-rules-market-judges.md`.
Source for the on-screen behaviour: `lib/contracts.ts` and the UI built in F0-05. Where the exact button label or chat wording of the build may differ, the line is marked and listed in "Check before recording".

## Setup before pressing record

- Open the public URL (or localhost) in a clean browser window, light theme, 1280 px wide. The banner "Demo · Solana devnet · simulated data" must be visible at the top the whole time.
- Fresh session. Persona switcher visible: Ana / Bruno / Carla. Chat on the left, lease timeline on the right.
- Use `REPLAY=1` if the model API is slow or failing. The behaviour is the same because `lib/rules/` decides.
- Devnet explorer tab ready, not open on screen yet.
- Platform wallet funded with devnet SOL, `tUSDC` set up (`pnpm setup:devnet` ran clean).
- Have `docs/submission/tx-links.md` open off-screen as a backup if an explorer page loads slowly.
- No real person's data and no real documents on screen. Everything is simulated.

## Script

| Time | On screen | Mauro types | Mauro says |
|---|---|---|---|
| 0:00 - 0:20 | The app with the devnet banner. Persona switcher visible. | nothing | "Small real-estate agencies in Salta check every tenant by hand: ID, payslip, guarantee. Mistakes get through, and the deposit sits with someone in the middle. Tuki is an AI back-office for those agencies, and Solana holds the deposit and the payment record. Everything you see is simulated, on devnet." |
| 0:20 - 0:50 | Select persona **Bruno**. Chat on the left. Timeline on the right shows stage SEARCH. Property cards appear (2 or 3), all from the catalogue. | `2-bedroom near Tres Cerritos, under 500 USDC, pets ok` | "The listings agent only answers from the catalogue, so it cannot invent a property. The agent works in stages, shown on the timeline: search, documents, contract, payment." Pick one card. |
| 0:50 - 1:05 | Bruno submits his documents (chat message or upload action, whichever the build offers). Prequal card: status NEEDS_INFO, issue `expired_payslip`. Timeline stays on DOCUMENTS. | `I'd like to apply. Here are my documents.` (check wording) | "Bruno's payslip is older than 90 days. The model reads the documents, but a plain rule in code makes the call. The model never approves anybody. The agency would see this in its review queue." |
| 1:05 - 1:35 | Switch persona to **Carla** (session resets). Search and select the same property, then submit her documents. Prequal card shows APPROVED, then the crosscheck discrepancy card appears: `name_mismatch`, final status NEEDS_INFO, decided by crosscheck. | `2-bedroom near Tres Cerritos, under 500 USDC, pets ok`, then `I'd like to apply. Here are my documents.` (check wording) | "Carla looks fine to the first agent, which approves her. A second agent, with its own prompt, reads the original documents again and finds that the name on her ID is not the name on her payslip. When the two disagree, the case stops. This is the cross-check, and the decision is still made by code, not by the model." |
| 1:35 - 1:45 | Switch persona to **Ana**. Search, select the property, submit documents. Prequal card: APPROVED. Crosscheck agrees. Timeline moves to CONTRACT. | `2-bedroom near Tres Cerritos, under 500 USDC, pets ok`, then `I'd like to apply. Here are my documents.` (check wording) | "Ana's documents are complete and consistent. Both agents agree, so she moves on." |
| 1:45 - 2:10 | Contract card: contract text, sha256 shown. Press **Verify**. Green check. | nothing (click Verify) | "The lease is generated from a template and we compute its sha256. Only that hash goes on-chain, never the text and never a name. Verify recomputes the hash and compares it with the one in the transaction memo." (If Verify needs a payment first, say: "Verify turns green after the first payment, in a moment.") |
| 2:10 - 2:30 | Payment card with two prices: list price crossed out, discounted price shown, with the two discounts (paying in USDC, paying on time). Click pay deposit. Receipt card appears with an explorer link. | nothing (click Pay deposit) | "Two prices. The on-time discount is computed by the server from the block time of the confirmed transaction, not from a button or the browser's clock. Now the deposit." |
| 2:30 - 2:45 | Click pay rent. Second receipt. Open an explorer link: the devnet transaction shows the token transfer and the Memo `tuki:lease:<id>:deposit:<hash>`. Back in the app, press Verify again: green. | nothing (click Pay rent, open link, press Verify) | "Two real devnet transactions, each with a memo carrying the lease id and the contract hash. Only hashes, amounts, timestamps and public keys are on-chain. Verify is green." |
| 2:45 - 3:00 | Timeline at ACTIVE with the receipts. Optional: cut to the README "Current status" section. | nothing | "One honest note. Today the escrow is custodial: the deposit goes to a platform wallet on devnet and the server signs with demo keys. The Anchor program with 2-of-3 release between tenant, landlord and agency is in progress this week, not built yet. Next also come a Phantom QR payment and an agency panel. This is Tuki." |

Total: 3:00 hard stop. If the take runs over, cut the second explorer view, then shorten the Carla search by starting her chat already on the property.

## Exact lines to keep word for word

- "Everything you see is simulated, on devnet."
- "The model never approves anybody." (Principle: the model extracts, the code decides.)
- "Today the escrow is custodial ... The Anchor program with 2-of-3 release ... is in progress this week, not built yet."

## Do not say

- Anything about users, pilots, revenue, agencies that "use" Tuki, or partnerships. None exist in the evidence log.
- That the escrow is trustless or non-custodial. It is not, yet.
- That the contract is legally valid or that USDC is legal tender, or any statement about the law. If asked, say the design keeps the contract off-chain, puts only its hash on-chain, and treats USDC as a payment method, and that legal review is pending.
- "Blockchain" on the tenant-facing screens (the UI avoids the word; the voice-over can say Solana).

## Expected questions (short answers, no invented facts)

- "Who pays in USDC in Salta?" "We do not have evidence yet. Rents there are in pesos. The plan is to accept pesos through an on-ramp and settle in USDC. We are doing the validation work this week." (Ani owns this answer; see `docs/validation/evidence.md` for anything citable.)
- "Is the escrow real?" "The transfers are real devnet transactions. The custody is a platform wallet today, so it is custodial. The Anchor program is the fix and is in progress."
- "How is this different from Fiador.sol or RentLock?" "We start from the agency back-office: pre-qualification and a cross-check agent before any money moves, and the planned release needs 2 of 3 signatures with the agency as arbiter."

## Check before recording

- TODO(Mauro): confirm the exact chat sentence or upload action that submits a persona's documents, and the Verify and Pay button labels, against the UI after F0-08. Edit the "Mauro types" column to match.
- TODO(Mauro): confirm whether Verify is available before the first payment or only after it, and keep the matching line in the 1:45 row.
- TODO(Mauro): confirm that switching persona resets the session as designed (`ChatRequest.tenantId`), and that the property picked after the reset needs no extra step. If it does, move the 1:05 and 1:35 timings.
- TODO(Mauro): put the final public URL and the recorded video link in `README.md`.
- TODO(Ani): the 2-minute pitch has its own script (`pitch-script.md`, written in F1). Keep the problem statement here to one sentence so the two do not repeat.
- Run the full flow three times in a row before the final take. If one run differs, use `REPLAY=1`.
