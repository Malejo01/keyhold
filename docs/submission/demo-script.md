# Demo script (max 3:00, English)

For the product team (Ani and teammates). You do not need to know the code. Everything below is what you click, what you should see, and what you say. Written for the redesigned UI on branch `f1-design` (checked in headless Chrome); the product name AlquilIA is provisional.
Target length 2:58, hard stop 3:00. The pitch (`pitch-script.md`, 2:00) covers the problem, the market and the ask, so this video does **not** repeat them: it shows the product. A one-page version is in `recording-brief.md`.

## Before you press record

- [ ] Open https://keyhold-app.vercel.app in a clean Chrome window (new profile or guest window, so no bookmarks bar, extensions or profile name show). Light theme, window 1280 px wide, browser zoom 100 to 110 percent. At 1280 px the hero shows a "Preview" illustration on the right; that is static, not live.
- [ ] Close every other tab and app. Turn off notifications (Do Not Disturb).
- [ ] Reload the page. The hero must show the strip "Demo · Solana devnet · simulated data". Keep it in frame at the start; in the chat view the right sidebar and the "Test tokens only" wording carry the same message.
- [ ] Have a second tab ready in the same window with a devnet explorer page for a recent AlquilIA deposit payment (take the link from a receipt of a practice run, not from old notes). It is a backup if the explorer loads slowly. Do not show it unless needed.
- [ ] Rate limit: production (recorded answers) allows 120 chat messages per 5 minutes per IP; with live AI the limit is 30. A full take uses about 10 messages, so several takes in a row are fine. If a "too many requests" message ever appears, wait 5 minutes and start again.
- [ ] Do one practice run first. Then reload and record.
- [ ] Record screen and microphone. English only. No real person's data or real documents appear anywhere; everything is simulated.

## Script

Persona order: Bruno (fast), Carla (the key moment), Ana (full flow). Each persona starts with an empty chat; switching persona resets the chat. In the chat view, the right sidebar has "Lease timeline" (the current step has a "Now" pill, finished steps say "Done") and, below it, "Agent activity" with five agents that light up as they act: Orchestrator, Listings, Pre-qualification, Cross-check, Lease. Point at it while you talk; it is the multi-agent part.

| Time | Click or type (exact text) | What should be on screen | What to say |
|---|---|---|---|
| 0:00 - 0:14 | Nothing for the first seconds, then click **Try the demo**. | The hero: strip "Demo · Solana devnet · simulated data", logo AlquilIA, headline "Rental paperwork, checked by AI agents and decided by clear rules.", button "Try the demo" with "No sign-up. Test tokens only.", and the three steps "Find and visit", "Two AI agents check documents", "Contract hash, deposit and rent". After the click the page scrolls to the chat, which fills the screen. | "This is AlquilIA, an AI back-office for rental agencies. Everything here is simulated, on Solana devnet, and the AI answers in this take are recorded." |
| 0:14 - 0:40 | Click **Bruno** (top right). Click chip **Find a place**. When the property cards appear, click **Book a visit** on the first card ("Bright 2-bedroom apartment near Tres Cerritos park", 420 USDC / month). Click chip **Upload my documents**. | Chat sends "2-bedroom near Tres Cerritos, under 500 USDC, pets ok". Property cards appear (generated illustrations, not photos). Then the pre-qualification card: badge "More information needed", "Payslip out of date · Payslip", and an evidence block: payslip issue date "2026-06-05 (120 days old)" tagged "Over 90 days old" against the reference date "2026-10-03", with "Rule: The payslip must be at most 90 days old." In the sidebar the Orchestrator, Listings and Pre-qualification agents light up. | "Bruno first: a search, a visit, then his documents. The listings agent only answers from the catalog. Google Gemini reads his payslip, but plain code decides: it is 120 days old, over the 90-day rule, so he must send a newer one." |
| 0:40 - 1:15 | Click **Carla**. Click chip **Find a place**. Click **Book a visit** on the first card. Click chip **Upload my documents**. Point the cursor at "First review: Approved", then "Cross-check: Discrepancy found", then at the two names. | Pre-qualification card with an accent border and the banner about the independent cross-check. "First review: Approved" next to "Cross-check: Discrepancy found". Evidence side by side: "Name on ID" CARLA BEATRIZ DEMO INVENTADA against "Name on payslip" Camila Demo Inventada, tagged "Does not match", and "Rule: The name on every document must match the ID." The Cross-check agent lights up in the sidebar. | "Carla, same steps. The first agent approves her. Then a second agent, with its own prompt, reads the same documents and finds the name on her payslip is Camila, not Carla Beatriz. They disagree, so the case stops. The model never approves anybody: it extracts, and code decides." |
| 1:15 - 1:28 | Click **Ana**. Click chip **Find a place**. Click **Book a visit** on the first card. Click chip **Upload my documents**. | Pre-qualification card: badge "Approved", text that all checks passed and the cross-check agrees, button "Generate the contract". Cross-check in the sidebar says it agrees. | "Ana, same steps. Both agents agree, so she is approved." |
| 1:28 - 1:42 | Click **Generate the contract**. | The chat first shows your message bubble "Generate the contract", then the contract card: contract text, "Contract fingerprint (SHA-256)", a disabled **Verify** with the hint "Available after the deposit is paid." Below it one card, "Security deposit", 420.00 USDC, with the button "Pay deposit · 420.00 USDC". The rent card is not shown yet. The Lease agent lights up ("Drafted the contract · SHA-256 ..."). | "The contract is built from a template. Its SHA-256 fingerprint is what goes on-chain, never the text and never a name. Verify unlocks after the deposit." |
| 1:42 - 1:57 | Click the button **Pay deposit · 420.00 USDC** on the "Security deposit" card. Do **not** click the chip "Pay the deposit": it only shows the same card again. | "Confirming your payment…" for about 4 seconds. **Do not click or type anything until the receipt appears.** Then an animated check, the chat says "Deposit payment confirmed." and the receipt "Payment confirmed · Deposit" appears with "View on Solana Explorer". | "The deposit moves as a real token transfer on devnet. No discount applies to a deposit." (Say it before or after the 4 seconds, not during a click.) |
| 1:57 - 2:07 | Scroll up to the contract card. Click **Verify**. | A green result "Match: this is the contract you paid against", with the computed and stored fingerprints equal. | "Verify recomputes the fingerprint and compares it with the one in the payment. It matches." |
| 2:07 - 2:22 | Click chip **Pay my first rent** (it is highlighted as the next step). Watch the price. Click **Pay rent · 399.00 USDC**. | Chat reply "Deposit received. First month's rent: ..." and the rent card: the price counts down from 420.00 to 399.00 USDC, with −3% for paying in USDC and −2% for paying on time. Click the button; "Confirming your payment…" shows. **Do not click or type until the receipt appears.** Then "Rent payment confirmed." and the receipt "Payment confirmed · Rent" with an on-time badge. The timeline reaches "Active lease" with the "Now" pill. | "Rent shows two prices. The on-time discount is checked from the confirmed block time on Solana, not from a button or the browser's clock." |
| 2:22 - 2:42 | On the **deposit** receipt ("Payment confirmed · Deposit") click **View on Solana Explorer**. A new tab opens. Show the token transfer and the Memo line `lease:v1:<leaseId>:deposit:<sha256>`. | Devnet explorer page for the transaction: the token transfer and the Memo. | "Here is the transaction on the devnet explorer: the token transfer and a memo with the contract fingerprint. Only hashes, amounts, timestamps and public keys are on-chain. No personal data." |
| 2:42 - 2:58 | Close the explorer tab. Show the app with the timeline at "Active lease" and the five agents in the sidebar. | App, timeline at Active lease, receipts in the chat, Agent activity panel. | "One honest note: the escrow is custodial today, a platform wallet on devnet with demo keys. The Anchor program with two-of-three release is tested on a branch, not deployed. This is AlquilIA." |

Order matters: if anyone asks for the rent before the deposit is paid, the agent answers "The deposit comes first." Pay the deposit, then the rent.

If the take runs over 3:00: talk while pages load, shorten the Bruno and Carla searches, and skip the Verify click (keep the line about the fingerprint). Do not cut the honest note.

## Lines to keep word for word

- "Everything here is simulated, on Solana devnet, and the AI answers in this take are recorded." (The production site serves recorded Gemini answers; the decisions are made by code either way. Do not say the answers are live.)
- "The model never approves anybody: it extracts, and code decides."
- "The escrow is custodial today ... The Anchor program with two-of-three release is tested on a branch, not deployed."

## Do not show

- `.env` files, any terminal, the Vercel dashboard, wallet secret keys or keypair files.
- `docs/submission/tx-links.md` (it also lists old transactions with the previous `tuki:lease:` prefix).
- The `?fixtures=1` mode of the app (fake data without the server).
- The browser bookmarks bar, extensions, or your Chrome profile name and photo.
- Any real person's data or documents.

## Do not say

- Anything about users, pilots, revenue, agencies that "use" AlquilIA, or partnerships. None exist.
- That the escrow is trustless or non-custodial. It is not yet.
- That the contract is legally valid, that USDC is legal tender, or anything about what the law allows. If asked: the contract stays off-chain, only its hash goes on-chain, USDC is a payment method, legal review is pending.
- That the AI is live in this take, or that Claude is the product's model. The product model is Google Gemini.
- That the property images are photos (they are generated illustrations) or that the "Preview" in the hero is the live product.
- "Blockchain" on screen copy (the UI avoids it; say Solana in the voice-over).

## Expected questions (short answers, no invented facts)

- "Who pays in USDC in Salta?" "We do not have evidence yet. Rents there are in pesos. The plan is a peso on-ramp with USDC as the settlement layer. We are starting validation with Salta agencies."
- "Is the escrow real?" "The transfers are real devnet transactions. The custody is a platform wallet today, so it is custodial. The Anchor program is the fix: it is tested on a branch and not deployed yet."
- "How is this different from Fiador.sol or RentLock?" "We start from the agency back-office: pre-qualification and a cross-check agent before any money moves, and the planned release needs 2 of 3 signatures with the agency as arbiter. We have only read their public descriptions."

## Check after recording

- The video is 3:00 or less, in English, with the devnet strip visible at the start and no item from "Do not show".
- Link sharing is "anyone with the link can view". Send the link to Ani for the README and to the pre-selection form (`preselection.md`, section 7).
