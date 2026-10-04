# Demo script (max 3:00, English)

For the product team (Ani and teammates). You do not need to know the code. Everything below is what you click, what you should see, and what you say. Flow checked in headless Chrome on 2026-10-04 (1280 px light, 375 px dark) against the local build; production must be redeployed with these changes before recording, and one practice run on production confirms it.
Target length 2:55, hard stop 3:00. The pitch (`pitch-script.md`, 2:00) covers the problem, the market and the ask, so this video does **not** repeat them: it shows the product.

## Before you press record

- [ ] Open https://keyhold-app.vercel.app in a clean Chrome window (new profile or guest window, so no bookmarks bar, extensions or profile name show). Light theme, window 1280 px wide, browser zoom 100 to 110 percent.
- [ ] Close every other tab and app. Turn off notifications (Do Not Disturb).
- [ ] Reload the page so the session is fresh. Check the banner "Demo · Solana devnet · simulated data" is visible. It must stay visible the whole video.
- [ ] Persona switcher (top right) shows Ana, Bruno, Carla. Chips above the input show: Find a place, Book a visit, Upload my documents, Generate the contract, Pay the deposit, Pay my first rent.
- [ ] Have a second tab ready in the same window with a devnet explorer page for a recent Keyhold deposit payment (take the link from a receipt of a practice run, not from old notes). It is a backup if the explorer loads slowly. Do not show it unless needed.
- [ ] Rate limit: the app allows 30 chat messages per 5 minutes per IP. A full take uses about 10. If a "too many requests" message appears, wait 5 minutes and start again.
- [ ] Do one practice run first. Then reload and record.
- [ ] Record screen and microphone. English only. No real person's data or real documents appear anywhere; everything is simulated.

## Script

Persona order: Bruno (fast), Carla (the key moment), Ana (full flow). Each persona starts with an empty chat; switching persona resets the chat.

| Time | Click or type (exact text) | What should be on screen | What to say |
|---|---|---|---|
| 0:00 - 0:12 | Nothing. | The app: banner "Demo · Solana devnet · simulated data", chat on the left, "Lease timeline" on the right, Ana selected. | "This is Keyhold, an AI back-office for rental agencies. Everything here is simulated, on Solana devnet, and the AI answers in this take are recorded." |
| 0:12 - 0:42 | Click **Bruno** (top right). Click chip **Find a place**. When the property cards appear, click **Book a visit** on the first card ("Bright 2-bedroom apartment near Tres Cerritos park", 420 USDC). Click chip **Upload my documents**. | Chat sends "2-bedroom near Tres Cerritos, under 500 USDC, pets ok". Property cards appear. Then the pre-qualification card: badge "More information needed", payslip 120 days old (over 90). Timeline stays on Documents. | "Three demo tenants. Bruno first: a search, a visit, then his documents. The listings agent only answers from the catalog. Google Gemini reads his documents, but plain code makes the call: his payslip is 120 days old, over the 90-day limit, so he needs to send a newer one." |
| 0:42 - 1:20 | Click **Carla**. Click chip **Find a place**. Click **Book a visit** on the first card. Click chip **Upload my documents**. Point the cursor at "First review: Approved" and then at "Cross-check: Discrepancy found". | Pre-qualification card with an accent border: banner "Independent cross-check found a discrepancy"; "First review: Approved" next to "Cross-check: Discrepancy found"; line "Name does not match · Payslip" showing Camila against CARLA BEATRIZ. | "Now Carla, same steps. The first agent approves her. Then a second, independent agent reads the same documents on its own, and finds the name on her payslip is Camila, not Carla Beatriz. They disagree, so the case stops. The model never approves anybody: it extracts, and code decides." |
| 1:20 - 1:35 | Click **Ana**. Click chip **Find a place**. Click **Book a visit** on the first card. Click chip **Upload my documents**. | Pre-qualification card: badge "Approved", text that all checks passed and the cross-check agrees, button "Generate the contract". Timeline on Documents. | "Ana, same steps. Both agents agree, so she is approved." |
| 1:35 - 1:50 | Click **Generate the contract**. | The chat first shows your message bubble "Generate the contract", then the contract card: contract text, "Contract fingerprint (SHA-256)", a disabled **Verify** button with the hint "Available after the deposit is paid." Below it one card, "Security deposit", 420.00 USDC, with the button "Pay deposit · 420.00 USDC". The rent card is not shown yet. | "The contract is built from a template. Its SHA-256 fingerprint is what goes on-chain, never the text and never a name. Verify unlocks after the deposit." |
| 1:50 - 2:05 | Click the button **Pay deposit · 420.00 USDC** on the "Security deposit" card. Do **not** click the chip "Pay the deposit": it only shows the same card again. | "Confirming your payment…" for about 4 seconds, then the chat says "Deposit payment confirmed." and a receipt "Payment confirmed · Deposit" appears with "View on explorer". While it says "Confirming your payment…", don't click or type anything until the receipt appears. Say nothing for the 4 seconds, or keep the sentence short. | "The deposit moves as a real token transfer on devnet. No discount applies to a deposit." |
| 2:05 - 2:15 | Scroll up to the contract card. Click **Verify**. | A green result "Match: this is the contract you paid against", with the computed and stored fingerprints equal. | "Verify recomputes the fingerprint and compares it with the one in the payment. It matches." |
| 2:15 - 2:30 | Click chip **Pay my first rent** (it is highlighted as the next step). Point at the crossed-out price. Click **Pay rent · 399.00 USDC**. | Chat reply "Deposit received. First month's rent: ..." and the rent card: list price 420.00 crossed out, then 399.00 USDC with −3% for paying in USDC and −2% for paying on time. While it says "Confirming your payment…", don't click or type anything until the receipt appears. After about 4 seconds: "Rent payment confirmed." and a receipt "Payment confirmed · Rent". The timeline reaches "Active lease" (on a narrow window it is the compact timeline at the top). | "Rent shows two prices. The on-time discount is checked from the confirmed block time on Solana, not from a button or the browser's clock." |
| 2:30 - 2:45 | On the **deposit** receipt ("Payment confirmed · Deposit") click **View on explorer**. A new tab opens. Show the token transfer and the Memo line `lease:v1:<leaseId>:deposit:<sha256>`. | Devnet explorer page for the transaction: the token transfer and the Memo. | "Here is the transaction on the devnet explorer: the token transfer and a memo with the contract fingerprint. Only hashes, amounts, timestamps and public keys are on-chain. No personal data." |
| 2:45 - 3:00 | Close the explorer tab. Show the app with the timeline at "Active lease". | App, timeline at Active lease, receipts in the chat. | "One honest note: the escrow is custodial today, a platform wallet on devnet with demo keys. The Anchor program with two-of-three release is in progress, not built. This is Keyhold." |

If the take runs over 3:00: shorten the Bruno and Carla searches by talking while the page loads, and skip the Verify click (keep the line about the fingerprint). Do not cut the honest note.

Order matters: if anyone asks for the rent before the deposit is paid, the agent answers "The deposit comes first." Pay the deposit, then the rent.

## Lines to keep word for word

- "Everything here is simulated, on Solana devnet, and the AI answers in this take are recorded." (The production site serves recorded Gemini answers; the decisions are made by code either way. Do not say the answers are live.)
- "The model never approves anybody: it extracts, and code decides."
- "The escrow is custodial today ... The Anchor program with two-of-three release is in progress, not built."

## Do not show

- `.env` files, any terminal, the Vercel dashboard, wallet secret keys or keypair files.
- `docs/submission/tx-links.md` (it also lists old transactions with the previous `tuki:lease:` prefix).
- The `?fixtures=1` mode of the app (fake data without the server).
- The browser bookmarks bar, extensions, or your Chrome profile name and photo.
- Any real person's data or documents.

## Do not say

- Anything about users, pilots, revenue, agencies that "use" Keyhold, or partnerships. None exist.
- That the escrow is trustless or non-custodial. It is not yet.
- That the contract is legally valid, that USDC is legal tender, or anything about what the law allows. If asked: the contract stays off-chain, only its hash goes on-chain, USDC is a payment method, legal review is pending.
- That the AI is live in this take, or that Claude is the product's model. The product model is Google Gemini.
- "Blockchain" on screen copy (the UI avoids it; say Solana in the voice-over).

## Expected questions (short answers, no invented facts)

- "Who pays in USDC in Salta?" "We do not have evidence yet. Rents there are in pesos. The plan is a peso on-ramp with USDC as the settlement layer. We are starting validation with Salta agencies."
- "Is the escrow real?" "The transfers are real devnet transactions. The custody is a platform wallet today, so it is custodial. The Anchor program is the fix and is in progress."
- "How is this different from Fiador.sol or RentLock?" "We start from the agency back-office: pre-qualification and a cross-check agent before any money moves, and the planned release needs 2 of 3 signatures with the agency as arbiter. We have only read their public descriptions."

## Check after recording

- The video is 3:00 or less, in English, with the banner visible throughout and no item from "Do not show".
- Link sharing is "anyone with the link can view". Send the link to Mauro for the README and to the pre-selection form (`preselection.md`, section 7).
