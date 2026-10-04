# Demo script (max 3:00, English)

For the product team (Ani and teammates). You do not need to know the code. Everything below is what you click, what you should see, and what you say. Labels were checked against the current production page text (headless Chrome dump, English UI); the product name AlquilIA is provisional.
Target length 2:58, hard stop 3:00. The pitch (`pitch-script.md`, 2:00) covers the problem, the market and the ask, so this video does **not** repeat them: it shows the product. A one-page version is in `recording-brief.md`.

Anchor line, to say and to keep on screen or in the description: **"built and tested, not deployed"** (the Anchor escrow program is not deployed; escrow is custodial today).

## Before you press record

- [ ] Open **https://keyhold-app.vercel.app/en** (the judge link, always `/en`). Do not open the bare `/`: it redirects by browser language, so a Spanish browser lands on `/es`. Use a clean Chrome window (new profile or guest window, so no bookmarks bar, extensions or profile name show). Light theme, window 1280 px wide, browser zoom 100 to 110 percent. At 1280 px the hero shows a "Preview" illustration on the right; that is static, not live.
- [ ] Close every other tab and app. Turn off notifications (Do Not Disturb).
- [ ] Reload the page. The top of the page must show the strip "Demo · Solana devnet · simulated data". Keep it in frame at the start. The hero text also says "(custodial, devnet test tokens)" and the chat footer says "Amounts are in USDC (devnet test token). No real money moves."
- [ ] Have a second tab ready in the same window with a devnet explorer page for a recent AlquilIA deposit payment (take the link from a receipt of a practice run, not from old notes). It is a backup if the explorer loads slowly. Do not show it unless needed.
- [ ] Rate limit: production (recorded answers) allows 120 chat messages per 5 minutes per IP; with live AI the limit is 30. A full take uses about 10 messages, so several takes in a row are fine. If a "too many requests" message ever appears, wait 5 minutes and start again.
- [ ] Do one practice run first. Then reload and record.
- [ ] Record screen and microphone. English only. No real person's data or real documents appear anywhere; everything is simulated.

## Script

Persona order: Bruno (fast), Carla (the key moment), Ana (full flow). The chat opens as Ana ("Hi Ana, I'm AlquilIA."); the buttons Ana, Bruno and Carla sit in the chat header, under the label "DEMO TENANT", next to the ES | EN selector. Switching persona resets the chat. On desktop the right sidebar has "LEASE TIMELINE" (steps Search, Visit, Documents, Contract, Payment, Active lease, Move-out; the current one has a "Now" pill, finished ones say "Done") and below it "AGENT ACTIVITY" with five agents: Orchestrator, Listings, Pre-qualification, Cross-check, Lease. Point at it while you talk; it is the multi-agent part.

| Time | Click or type (exact text) | What should be on screen | What to say |
|---|---|---|---|
| 0:00 - 0:14 | Nothing for the first seconds, then click **Try the demo**. | The hero: strip "Demo · Solana devnet · simulated data", logo AlquilIA, headline "Rental paperwork, checked by AI agents and decided by clear rules.", the line "AlquilIA is an AI leasing back-office built for rental agencies in Salta, Argentina. ..." ending "(custodial, devnet test tokens).", button "Try the demo" with "No sign-up. Test tokens only.", and the steps "Find and visit", "Two AI agents check documents", "Contract hash, deposit and rent". After the click the page scrolls to the chat. | "This is AlquilIA, an AI back-office for rental agencies. Everything here is simulated, on Solana devnet, and the AI answers in this take are recorded." |
| 0:14 - 0:40 | Click **Bruno** (chat header). Click chip **Find a place**. When the property cards appear, click **Book a visit** on the first card ("Bright 2-bedroom apartment near Tres Cerritos park", 420 USDC / month). The agent asks "Shall I confirm it?". Click chip **Upload my documents**. | Chat sends "2-bedroom near Tres Cerritos, under 500 USDC, pets ok". Two property cards (generated illustrations, not photos): the 420 USDC / month apartment and "Pet-friendly 2-bedroom duplex in Tres Cerritos", 480 USDC / month. After the last click: "Visit confirmed for tomorrow at 10:00 ... (simulated agenda).", then the card "Pre-qualification" with badge "More information needed", under "WHY": "Payslip out of date · Payslip", "The payslip was issued on 2026-06-05, 120 days before 2026-10-03. It must be at most 90 days old." Evidence: "Payslip issue date" "2026-06-05 (120 days old)" tagged "Over 90 days old", "Reference date" "2026-10-03", and "Rule: The payslip must be at most 90 days old." In the sidebar Orchestrator, Listings and Pre-qualification show "Checked 4 documents → Needs info". | "Bruno first: a search, a visit, then his documents. The listings agent only answers from the catalog. Google Gemini reads his payslip, but plain code decides: it is 120 days old, over the 90-day rule, so he must send a newer one." |
| 0:40 - 1:15 | Click **Carla**. Click chip **Find a place**. Click **Book a visit** on the first card. Click chip **Upload my documents**. Point the cursor at "FIRST REVIEW Approved", then "CROSS-CHECK Discrepancy found", then at the two names. | Pre-qualification card headed "Independent cross-check found a discrepancy" with "A second agent read the same documents on its own and disagreed with the first result.", badge "More information needed". "FIRST REVIEW" "Approved" next to "CROSS-CHECK" "Discrepancy found". Under "WHAT THE CROSS-CHECK FOUND": "Name does not match · Payslip", "Name on ID" CARLA BEATRIZ DEMO INVENTADA against "Name on payslip" Camila Demo Inventada, tagged "Does not match", and "Rule: The name on every document must match the ID." Sidebar Cross-check: "Re-read the documents independently → found a mismatch". | "Carla, same steps. The first agent approves her. Then a second agent, with its own prompt, reads the same documents and finds the name on her payslip is Camila, not Carla Beatriz. They disagree, so the case stops. The model never approves anybody: it extracts, and code decides." |
| 1:15 - 1:28 | Click **Ana**. Click chip **Find a place**. Click **Book a visit** on the first card. Click chip **Upload my documents**. | Chat: "You're pre-qualified! Your documents are complete, the payslip is recent, the rent is within 35% of your income, and our independent cross-check agrees. Shall I prepare the lease contract?" Card "Pre-qualification", badge "Approved", "All checks passed, and the independent cross-check agrees.", chips ID, Payslip, Income proof, Guarantee, and the button "Generate the contract". Sidebar Cross-check: "Re-read the documents independently → agrees". | "Ana, same steps. Both agents agree, so she is approved." |
| 1:28 - 1:42 | Click **Generate the contract**. | The chat shows "Generate the contract", then "Your lease contract is ready (demo, simulated data, not legal advice). Its SHA-256 fingerprint is 2ab08e6ffab9…" and "Deposit: 420 USDC, held in the demo custody wallet (no discount)." Card "Lease contract" (12 months, Monthly rent 420.00 USDC, Deposit 420.00 USDC, Discounts −3% USDC, −2% on time), the contract text, "Contract fingerprint (SHA-256)", a **Verify** button with "Checks this text against the fingerprint recorded with your deposit payment." Below it the card "Security deposit", 420.00 "USDC (devnet test token)", with its pay button. The Lease agent lights up: "Drafted the contract · SHA-256 2ab08e6f…". The fingerprint value changes per lease id, so do not read it aloud. | "The contract is built from a template. Its SHA-256 fingerprint is what goes on-chain, never the text and never a name. Verify checks it against the deposit payment." |
| 1:42 - 1:57 | Click the pay button on the "Security deposit" card **Pay deposit · 420.00 USDC**. Do **not** click the chip "Pay the deposit": it only shows the same card again. | A "Confirming your payment…" state for about 4 seconds. **Do not click or type anything until the receipt appears.** Then the chat says "Deposit payment confirmed." and the receipt "Payment confirmed · Deposit" appears: "AMOUNT PAID" 420.00 USDC (devnet test token), "Discount applied" none, "Confirmed" with date and time, "Receipt ID", and the link "View on Solana Explorer". | "The deposit moves as a real token transfer on devnet. No discount applies to a deposit." (Say it before or after the 4 seconds, not during a click.) |
| 1:57 - 2:07 | Scroll up to the contract card. Click **Verify**. | A green match result "Match: this is the contract you paid against", with the computed and stored fingerprints equal. | "Verify recomputes the fingerprint and compares it with the one in the payment. It matches." |
| 2:07 - 2:22 | Click chip **Pay my first rent**. Watch the price. Click the pay button on the rent card **Pay rent · 399.00 USDC**. | Chat: "Deposit received. First month's rent: 420 USDC list price, 399 USDC if you pay in USDC and on time (5% off)." Card "Rent payment" with the badge "On time", "List price 420.00" and the price 399.00 USDC (devnet test token); lines "Paid in USDC" −3%, "On-time payment" −2%, "Total discount" −5%. Wait for the receipt: "Rent payment confirmed.", then "Payment confirmed · Rent" with "On-time payment", "AMOUNT PAID" 399.00 USDC (devnet test token), "Discount applied" −5%. **Do not click or type until the receipt appears.** The timeline reaches "Active lease" with the "Now" pill and the note "Rent payments on record". | "Rent shows two prices. The on-time discount is checked from the confirmed block time on Solana, not from a button or the browser's clock." |
| 2:22 - 2:42 | On the **deposit** receipt ("Payment confirmed · Deposit") click **View on Solana Explorer**. A new tab opens. Show the token transfer and the Memo line `lease:v1:<leaseId>:deposit:<sha256>`. | Devnet explorer page for the transaction: the token transfer and the Memo. | "Here is the transaction on the devnet explorer: the token transfer and a memo with the contract fingerprint. Only hashes, amounts, timestamps and public keys are on-chain. No personal data." |
| 2:42 - 2:58 | Close the explorer tab. Show the app with the timeline at "Active lease" and the five agents in the sidebar. | App, timeline at "Active lease", receipts in the chat, "AGENT ACTIVITY" panel. | "One honest note: the escrow is custodial today, a platform wallet on devnet with demo keys. The Anchor program with two-of-three release is built and tested, not deployed. This is AlquilIA." |

Order matters: if anyone asks for the rent before the deposit is paid, the agent answers "The deposit comes first." Pay the deposit, then the rent.

If the take runs over 3:00: talk while pages load, shorten the Bruno and Carla searches, and skip the Verify click (keep the line about the fingerprint). Do not cut the honest note.

## Language switch (optional, about 10 s)

Skip it if the take is close to 3:00. Do it only if there are 10 spare seconds, or record it as a separate short clip.

- **Where:** the ES | EN selector is at the top right of the landing page (next to the "Agency panel" link) and again in the chat header, next to the buttons Ana, Bruno and Carla.
- **What to click:** on the landing page, click **ES**, wait 2 seconds, then click **EN** to come back.
- **What changes:** the page moves to `/es` and all text turns Spanish: the strip "Demo · Solana devnet · datos simulados", the headline "Los trámites de alquiler, revisados por agentes de IA y decididos por reglas claras.", the button "Probar la demo", and in the chat the chips "Buscar propiedad", "Reservar visita", "Subir mis documentos", "Generar el contrato", "Pagar el depósito", "Pagar mi primer alquiler".
- **What to say:** "The interface is bilingual, Spanish and English. The agents answer in the language of the user."
- Do it on the landing page, not in the middle of a payment. Whether a running chat survives the switch was not checked, so do not switch during the flow. End the take on `/en`.

## Lines to keep word for word

- "Everything here is simulated, on Solana devnet, and the AI answers in this take are recorded." (The production site serves recorded Gemini answers; the decisions are made by code either way. Do not say the answers are live.)
- "The model never approves anybody: it extracts, and code decides."
- "The escrow is custodial today ... The Anchor program with two-of-three release is built and tested, not deployed."

## Do not show

- `.env` files, any terminal, the Vercel dashboard, wallet secret keys or keypair files.
- `docs/submission/tx-links.md` (it also lists old transactions with the previous `tuki:lease:` prefix).
- The `?fixtures=1` mode of the app (fake data without the server).
- The browser bookmarks bar, extensions, or your Chrome profile name and photo.
- Any real person's data or documents.

## Do not say

- Anything about users, pilots, revenue, agencies that "use" AlquilIA, or partnerships. None exist.
- That the escrow is trustless or non-custodial. It is custodial.
- That the Anchor program is deployed. It is built and tested, not deployed.
- That the contract is legally valid, that USDC is legal tender, or anything about what the law allows. If asked: the contract stays off-chain, only its hash goes on-chain, USDC is a payment method, legal review is pending.
- That the AI is live in this take, or that Claude is the product's model. The product model is Google Gemini.
- That the property images are photos (they are generated illustrations) or that the "Preview" in the hero is the live product.
- "Blockchain" on screen copy (the UI avoids it; say Solana in the voice-over).

## Expected questions (short answers, no invented facts)

- "Who pays in USDC in Salta?" "We do not have evidence yet. Rents there are in pesos. The plan is a peso on-ramp with USDC as the settlement layer. We are starting validation with Salta agencies."
- "Is the escrow real?" "The transfers are real devnet transactions. The custody is a platform wallet today, so it is custodial. The Anchor program is the fix: it is built and tested, and not deployed yet."
- "How is this different from Fiador.sol or RentLock?" "We start from the agency back-office: pre-qualification and a cross-check agent before any money moves, and the planned release needs 2 of 3 signatures with the agency as arbiter. We have only read their public descriptions."

## Check after recording

- The video is 3:00 or less, in English, with the devnet strip visible at the start and no item from "Do not show".
- Link sharing is "anyone with the link can view". Send the link to Ani for the README and to the pre-selection form (`preselection.md`, section 7).
