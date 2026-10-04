# Recording brief

Product name: AlquilIA (provisional; formerly Keyhold). Full script with timings: `demo-script.md`. Pitch: `pitch-script.md`.

## For the product team

- **URL:** https://keyhold-app.vercel.app (the address still says "keyhold"; the product is AlquilIA). Use a clean Chrome window, 1280 px wide, zoom 100 to 110 percent, other tabs closed.
- **Script:** `docs/submission/demo-script.md`. Max 3:00, English. The 2-minute pitch is a separate video.
- **Order:** click "Try the demo", then Bruno, then Carla, then Ana. Each switch resets the chat.
- **Each persona:** chip "Find a place", then the button "Book a visit" on the first property card, then chip "Upload my documents".
- **Ana only:** button "Generate the contract", then click the button **"Pay deposit · 420.00 USDC"** on the "Security deposit" card. Do **not** click the chip "Pay the deposit": it only shows the same card again. Then "Verify", then chip "Pay my first rent", then "Pay rent · 399.00 USDC", then "View on Solana Explorer" on the deposit receipt.
- **While it says "Confirming your payment…"** do not click or type anything until the receipt appears (about 4 seconds).
- **Rate limit:** 120 chat messages per 5 minutes per IP on production. A take uses about 10. If "too many requests" appears, wait 5 minutes.
- **Say:** "The model never approves anybody: it extracts, and code decides." and the honest note: the escrow is custodial today (platform wallet on devnet, demo keys) and the Anchor program with two-of-three release is tested on a branch, not deployed. Say the AI answers in this take are recorded.
- **Do not show:** env files, a terminal, the Vercel dashboard, wallet secret keys, `tx-links.md`, the `?fixtures=1` mode, bookmarks, your Chrome profile name.
- **Do not say:** anything about users, pilots, revenue or partnerships (none exist); that the escrow is trustless; anything about what the law allows; that the AI is live; that the property images are photos.

## Mauro's 5-minute production checklist

Run before the team records. Production serves recorded answers (`REPLAY=1`).

1. Open https://keyhold-app.vercel.app. The hero shows the strip "Demo · Solana devnet · simulated data", the logo AlquilIA, the headline "Rental paperwork, checked by AI agents and decided by clear rules." and the button "Try the demo". At 1280 px the "Preview" illustration is on the right.
2. Click "Try the demo": the page scrolls to the chat. The sidebar shows "Lease timeline" with a "Now" pill and "Agent activity" with five agents (Orchestrator, Listings, Pre-qualification, Cross-check, Lease).
3. Bruno: chip "Find a place" returns property cards (illustrations); "Book a visit" on the first card, then chip "Upload my documents" gives "More information needed", "Payslip out of date · Payslip", "2026-06-05 (120 days old)", "Over 90 days old".
4. Carla: the same steps give "First review: Approved", "Cross-check: Discrepancy found", "Name on ID" against "Name on payslip" tagged "Does not match".
5. Ana: the same steps give "Approved" and the button "Generate the contract".
6. "Generate the contract": contract card with the SHA-256 fingerprint, Verify disabled with "Available after the deposit is paid.", and one "Security deposit" card. No rent card yet.
7. "Pay deposit · 420.00 USDC": "Confirming your payment…" for about 4 seconds, then "Deposit payment confirmed." and "Payment confirmed · Deposit". Asking for rent before this must answer "The deposit comes first."
8. Open "View on Solana Explorer": the devnet transaction shows the token transfer and the Memo `lease:v1:<leaseId>:deposit:<sha256>`. Back in the app, "Verify" shows "Match: this is the contract you paid against".
9. Chip "Pay my first rent": rent card counts down 420.00 to 399.00 (−3% USDC, −2% on time); "Pay rent · 399.00 USDC" gives "Payment confirmed · Rent" with the on-time badge and the timeline at "Active lease".
10. Mobile check at 375 px: the compact "Step N of 7" bar and the five-icon agent strip show; no horizontal scroll. Last, confirm the Vercel env still has `REPLAY=1`, `ESCROW_MODE=custodial` and the rate limit at 120, and that the platform wallet still has devnet SOL.
