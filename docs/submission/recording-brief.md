# Recording brief

Product name: AlquilIA (provisional; formerly Keyhold). Full script with timings: `demo-script.md`. Pitch: `pitch-script.md`.
Labels below were checked against the current production page text (English UI).

## For the product team

- **URL:** https://keyhold-app.vercel.app/en (judge link, always `/en`). Do not use the bare `/`: it redirects by browser language, so a Spanish browser lands on https://keyhold-app.vercel.app/es. The address still says "keyhold"; the product is AlquilIA. Use a clean Chrome window, 1280 px wide, zoom 100 to 110 percent, other tabs closed.
- **Script:** `docs/submission/demo-script.md`. Max 3:00, English. The 2-minute pitch is a separate video.
- **Order:** click "Try the demo", then Bruno, then Carla, then Ana (buttons in the chat header, under "DEMO TENANT"). The chat opens as Ana; each switch resets the chat.
- **Each persona:** chip "Find a place", then the button "Book a visit" on the first property card, then chip "Upload my documents".
- **Ana only:** button "Generate the contract", then the pay button on the "Security deposit" card **Pay deposit · 420.00 USDC**. Do **not** click the chip "Pay the deposit": it only shows the same card again. Then "Verify", then chip "Pay my first rent", then the pay button on the "Rent payment" card **Pay rent · 399.00 USDC**, then "View on Solana Explorer" on the deposit receipt.
- **While it says "Confirming your payment…"** do not click or type anything until the receipt appears (about 4 seconds).
- **Rate limit:** 120 chat messages per 5 minutes per IP on production. A take uses about 10. If "too many requests" appears, wait 5 minutes.
- **Say:** "The model never approves anybody: it extracts, and code decides." and the honest note: the escrow is custodial today (platform wallet on devnet, demo keys) and the Anchor program with two-of-three release is **built and tested, not deployed**. Say the AI answers in this take are recorded.
- **Do not show:** env files, a terminal, the Vercel dashboard, wallet secret keys, `tx-links.md`, the `?fixtures=1` mode, bookmarks, your Chrome profile name.
- **Do not say:** anything about users, pilots, revenue or partnerships (none exist); that the escrow is trustless; that the Anchor program is deployed; anything about what the law allows; that the AI is live; that the property images are photos.

## Language switch (optional, about 10 s)

- **Where:** the ES | EN selector is at the top right of the landing page (next to "Agency panel") and in the chat header, next to Ana, Bruno and Carla.
- **Click:** on the landing page click **ES**, wait 2 seconds, click **EN** to return.
- **What changes:** the page goes to `/es`; headline becomes "Los trámites de alquiler, revisados por agentes de IA y decididos por reglas claras.", button "Probar la demo", strip "Demo · Solana devnet · datos simulados", chips "Buscar propiedad", "Reservar visita", "Subir mis documentos", "Generar el contrato", "Pagar el depósito", "Pagar mi primer alquiler".
- Optional: skip it if the take is near 3:00. Switching before the contract keeps the conversation; after the contract or a payment the app shows "You switched language." and keeps the other-language demo saved, so do not switch mid-flow on camera. End on `/en`.

## Mauro's 5-minute production checklist

Run before the team records. Production serves recorded answers (`REPLAY=1`). Escrow is custodial; the Anchor program is built and tested, not deployed.

1. Open https://keyhold-app.vercel.app/en and also https://keyhold-app.vercel.app/es (both must load; "/" redirects by browser language). The English hero shows the strip "Demo · Solana devnet · simulated data", the logo AlquilIA, the headline "Rental paperwork, checked by AI agents and decided by clear rules.", the button "Try the demo" and "No sign-up. Test tokens only.". At 1280 px the "Preview" illustration is on the right. The Spanish page shows "Probar la demo".
2. Click "Try the demo": the page scrolls to the chat ("Hi Ana, I'm AlquilIA."). The sidebar shows "LEASE TIMELINE" with a "Now" pill and "AGENT ACTIVITY" with five agents (Orchestrator, Listings, Pre-qualification, Cross-check, Lease).
3. Bruno: chip "Find a place" returns two property cards (420 and 480 USDC / month, illustrations); "Book a visit" on the first card, then chip "Upload my documents" gives "More information needed", "Payslip out of date · Payslip", "2026-06-05 (120 days old)", "Over 90 days old".
4. Carla: the same steps give "Independent cross-check found a discrepancy", "FIRST REVIEW Approved", "CROSS-CHECK Discrepancy found", "Name on ID" against "Name on payslip" tagged "Does not match".
5. Ana: the same steps give "Approved", "All checks passed, and the independent cross-check agrees." and the button "Generate the contract".
6. "Generate the contract": card "Lease contract" with "Contract fingerprint (SHA-256)", "Verify" with "Checks this text against the fingerprint recorded with your deposit payment.", and one "Security deposit" card (420.00 USDC). No rent card yet.
7. Deposit pay button: "Confirming your payment…" for about 4 seconds, then "Deposit payment confirmed." and "Payment confirmed · Deposit". Asking for rent before this should answer "The deposit comes first." (not in the page dump; confirm in the run).
8. Open "View on Solana Explorer": the devnet transaction shows the token transfer and the Memo `lease:v1:<leaseId>:deposit:<sha256>`. Back in the app, "Verify" shows a green match: "Match: this is the contract you paid against".
9. Chip "Pay my first rent": the "Rent payment" card shows "List price 420.00" and 399.00 ("Paid in USDC" −3%, "On-time payment" −2%, "Total discount" −5%); the pay button gives "Rent payment confirmed." and "Payment confirmed · Rent" with "On-time payment", and the timeline at "Active lease".
10. Mobile check at 375 px: the compact "STEP 3 OF 7" style bar and the agent lines (Orchestrator, Listings, Pre-qualification, Cross-check, Lease) show; no horizontal scroll. Optional: click ES then EN to confirm the language switch. Last, confirm the Vercel env still has `REPLAY=1`, `ESCROW_MODE=custodial` and the rate limit at 120, and that the platform wallet still has devnet SOL.

## Agency panel + release (optional, about 25 s, after Ana has paid the deposit)

Record this only if time allows. The PIN is shared privately; never say it or show it on screen.

| Click or type | What should be on screen | What to say |
|---|---|---|
| Click **Agency panel** (top right, next to the ES / EN toggle; Spanish: "Panel de la inmobiliaria"). | The agency view: the NEEDS_INFO queue (Bruno: payslip out of date; Carla: cross-check name mismatch) and the leases read from devnet. If it says it is still reading, wait a few seconds. | "This is what the agency sees: the cases that need a human, and every lease and payment read straight from devnet." |
| On Ana's newest lease (deposit held), click **Release deposit**. Enter the split (for example 400 to the tenant, 20 to the landlord) and a short reason. Type the PIN in **Demo PIN** (off camera or blurred). Click **Approve and release**. | A release confirmation with a "View on Solana Explorer" link; the lease shows as released. A second attempt is refused as already released. | "At move-out the deposit is released with two of three approvals. In this demo the server holds all three keys, so it is a simulation; the Anchor program, built and tested but not deployed, is what will enforce it on chain." |

Spanish labels: "Liberar depósito", "PIN de la demo", "Aprobar y liberar".
