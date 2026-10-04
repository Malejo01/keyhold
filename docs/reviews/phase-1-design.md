# Phase 1 review: design layer (branch `f1-design`) for the demo video

**Verdict: GO for recording on this branch, once two things are done.**
- The one blocking issue below must be fixed: a single line, cosmetic, but on screen at a scripted moment.
- The usual production conditions must be met (see Preconditions).

Function, honesty, deposit-before-rent, 375 px layout, token contrast and secrets all pass. The API e2e passes 59/59 on the preview, and the browser run of the full script finishes with 0 issues.

Reviewer: qa-security-reviewer (dev agent). Date: Sun 2026-10-04, about 01:00 ART.
Target: Vercel preview of `f1-design` (protected; accessed with a share-link cookie that was not stored in the repo). Production was not touched.
Diff reviewed: `git diff main..f1-design` (commits `132baa8..4496325`, 43 files). Also reviewed: `docs/submission/demo-script.md` and `docs/submission/recording-brief.md`. They were reviewed in the working tree and then committed by the lead as `d1f1e6c` during this review.

## Preconditions before recording

1. `demo-script.md` and `recording-brief.md` are committed (`d1f1e6c`). Nothing to do.
2. Merge `f1-design` and deploy it to production. The script and brief use https://keyhold-app.vercel.app, and their first step (the hero and "Try the demo") does not exist on production until then.
3. Once deployed, run `node tests/e2e/phase0.mjs` once against production and check for 59/59, then do one practice take. Recording-brief items 1 to 10 already cover the visual checks.

## Blocking issues

### B1. The Lease agent shows a malformed SHA-256 (prefix doubled, 72 hex characters)

- Code: `components/deriveAgents.ts:75` calls `shortHash(contract.lease.contractHash, 8, 0)`. In `components/format.ts:39-42`, `value.slice(-tail)` with `tail = 0` is `slice(-0)`, which equals `slice(0)` and returns the **whole** hash. The summary then becomes `"<first 8><all 64>…"`.
- Rendered in the preview: `Drafted the contract · SHA-256 4bd9f3124bd9f3126924b3db7e523d5be813d0d8e12ae97e412ece1b3a590c39869965da…` at 1280 px, and `SHA-256 7984d0247984d024b…` in the 375 px strip (`ana-375-dark-08-rent-receipt.png`).
- Failure scenario: script step 1:28 says the Lease agent lights up with "Drafted the contract · SHA-256 ...". Step 2:42 asks to show the five agents. The demo's core claim is "the fingerprint is what goes on-chain". A Solana-engineer judge sees a fingerprint with its first 8 characters repeated, which does not match the contract card's `4bd9f31269…869965da`.
- Fix (ui-motion-engineer, one line): `` `Drafted the contract · SHA-256 ${contract.lease.contractHash.slice(0, 8)}…` ``. Optionally, also make `shortHash` treat `tail <= 0` as "no tail".

## Non-blocking issues

1. **Text dimmed with opacity falls below AA, even though every token pair passes.**
   - `timelineLabel.pending` uses `opacity: 0.55` (`lib/motion/presets.ts:92-96`). Upcoming timeline hints then sit at about **2.4:1** in light mode (3.3:1 dark); upcoming labels at 3.6–3.7:1 light.
   - `agentState.idle` uses opacity 0.5 (`presets.ts:172`) on the agent name and role (`AgentActivity.tsx:79`). Idle roles are about **2.2:1** light (2.95 dark); idle names 3.2:1.
   - "Upcoming" and "idle" are states, not disabled controls, so the WCAG exemption does not clearly apply. Fix: drop the opacity and use `text-subtle` (6.5:1 light), or set the opacity to 0.85 or more.
2. **The hero ignores `prefers-reduced-motion`.** `Hero` is rendered outside ChatShell's `<MotionConfig reducedMotion="user">` (`app/page.tsx:11`). `heroItem` (`presets.ts:164`) therefore still rises 14 px with a stagger. The presets header promises a top-level MotionConfig ("components/Shell"), which does not exist. Fix: wrap `<main>` (or `Hero`) in `MotionConfig reducedMotion="user"`. Related: `checkDraw` animates `pathLength` (stroke-dash, not transform or opacity; `presets.ts:193`), which is small and acceptable.
3. **"Listings: Found 1 listing in the catalog" after a search that showed 2.** `deriveAgents.ts:52-57` counts the **last** properties card, which is the single card returned after "Book a visit". Visible at 1280 in the sidebar during the Bruno, Carla and Ana steps. Use the largest properties card, or wording such as "Showed N listings".
4. **The Agent activity panel is mostly below the fold at 1280 × 860.** Only Orchestrator, Listings and part of Pre-qualification are visible (`ana-1280-04-contract.png`). The script says "point at it while you talk" and, at 2:42, "show ... the five agents". Add to the brief: scroll the sidebar, or record at 90 % zoom. This interacts with B1: scrolling exposes the Lease row.
5. **Two additional `aria-live` regions** (`AgentActivity.tsx:57, 129`) on top of the chat `role="log" aria-live="polite"`. Every reply is likely to be announced twice (the reply, then the agent summary). The `:129` element is the compact strip, hidden at desktop widths. Consider removing live from the full panel.
6. **The demo script quotes some labels in a form that differs from the source.** These are all rendered correctly, confirmed in the browser text:
   - "Payment confirmed · Deposit" is a template.
   - "Rule: The payslip must be at most 90 days old." and "Name on payslip" are built from `lib/rules` templates.
   - "First review: Approved" and "Cross-check: Discrepancy found" are label/value pairs.
   - "Step N of 7" is rendered uppercase via CSS.
   - No mismatch found.
7. **Known from earlier reviews, still open:** the chat/payment race (mitigated only by the script note), replayable signed sessions, and vitest blocked on this machine.

## Checks that passed

| Area | Result | Evidence |
|---|---|---|
| Honesty | No testimonials, metrics, "trusted by", "secured" or "trustless" in the code diff. Hero: "Rental paperwork, checked by AI agents and decided by clear rules." and "...collects the deposit and rent (custodial, devnet test tokens)". The hero preview is labelled "Preview" (static). Property art is generated SVG (`PropertyArt.tsx`), not photos. The contract template now names the platform as custodian | grep over the `+` lines of `app components lib styles`; docs changes only add "none exist" statements |
| Deposit before rent | Not regressed. Lock logic in `PaymentCard`/`CardRenderer` is unchanged; the diff only adds CountUp, the animated check and error icons. Server: e2e 409 check passes on the preview | e2e below |
| Token contrast (AA) | All pass, light and dark: body 14.4 / 16.4; muted 5.45–8.6; subtle 5.0–6.5; button text on primary 6.3 / 8.7; "Now" pill 6.3 / 8.7; accent "IA" 5.5–10.6; badges on soft 6.1–9.0; focus ring against the page 5.5 / 10.6 (needs 3) | computed from `styles/tokens.css:17-125` |
| Focus | The global `:focus-visible` 2 px ring with offset is intact (`app/globals.css`); no `outline-none` added in the diff. Locked buttons use `aria-disabled` and stay focusable | |
| Live regions | Chat `role="log" aria-live="polite"`; PaymentCard and ContractCard status regions kept; CountUp is `aria-hidden` with an `sr-only` final amount | |
| Reduced motion | Inside the chat: MotionConfig "user" covers transform loops; `pulseRing` and payment loops use `loop(reduced, …)`; CountUp jumps to the final value. Exception: the hero (non-blocking 2) | |
| 375 px | No horizontal overflow at any step (the overflow probe in `run.mjs`). Compact "Step N of 7" bar and five-icon agent strip render; the chip row scrolls | `qa-preview/*-375-dark-*.png` |
| Brand via tokens | Components use token classes or `var(--…)`. Hard-coded hex appears only in `app/icon.svg` (with a dark-mode `@media` block) and `app/opengraph-image.tsx`, both accepted exceptions | grep for `#hex` and `rgb(` in the `+` lines |
| Secrets / PII | No keys or tokens in the diff. The share token and JWT appear nowhere in the repo; `tests/e2e/phase0.mjs` only has `<value>` placeholders. New `IssueEvidence` carries simulated names in API responses only, never on-chain. Binary files in the diff are app screenshots under `docs/reviews/ux/` (simulated data) | `git diff | grep` for key patterns → 0 |
| Type-check, lint, evals | `tsc --noEmit` 0; eslint clean; `REPLAY=1 pnpm evals` ALL PASS (7), including "deposit before rent" | |

### API e2e on the preview

`tests/e2e/phase0.mjs` gained optional `E2E_COOKIE`. It is sent as a `Cookie` header on app requests only (not on devnet RPC), never printed, and uses `redirect: 'manual'` so a failed auth does not silently follow to a login page. The cookie was taken with `curl -c` from the share link into a scratch file outside the repo.

```
BASE_URL=<preview> E2E_COOKIE="_vercel_jwt=<from share link>" node tests/e2e/phase0.mjs
Phase 0 e2e against https://keyhold-app-git-f1-design-lizarraga-mauros-projects.vercel.app (with cookie)
59/59 checks passed in 12s   (output grep for the JWT: 0 hits)
deposit https://explorer.solana.com/tx/5eVvXDGPdx7zMVsQHQpWsQw8QebcG4wBqSracq3yEZ9HsEfx2bhjq6dKEz36r92TUUSuadNHDZRr1fdmoqfQc9rn?cluster=devnet
rent    https://explorer.solana.com/tx/4XBbCqZFswqxxktJpKMZdmbkrxDVi6Z9hfynWWXEVzfjMGayKkXSWSMtFdTCKnjV8KMtBTmGg4jrnYfv7KPV3qXr?cluster=devnet
```

### Browser e2e on "/" (lead's headless-Chrome script, run by QA)

`BASE=<preview> SHARE=<share link> OUT=qa-preview node run.mjs` from the scratchpad `bt/` folder. Screenshots are in `scratchpad/bt/qa-preview/` (not committed).

```
ana-1280 (light): Try the demo → find 1.4s → visit 1.4s → docs 1.4s → contract 1.4s → pay-deposit 2.1s → verify 1.4s
                  → pay-rent-prompt 1.4s → pay-rent 2.4s → stage Active; done in 22 s
bruno-375-dark:   NEEDS_INFO, "Payslip out of date · Payslip", "2026-06-05 (120 days old)", "Over 90 days old"; 11 s
carla-375-dark:   "First review Approved / Cross-check Discrepancy found", "Name on ID" vs "Name on payslip", "Does not match"; 11 s
ana-375-dark:     full flow incl. both payments and Verify; final text shows "Step 6 of 7 · Active lease"; 21 s
=== ISSUES (0) ===   (no console errors, no HTTP ≥ 400 on /api/*, no horizontal overflow)
```

Screens checked by eye:
- `ana-1280-00-empty`: hero.
- `00b-after-cta`: chat fills the viewport, banner still visible.
- `05-paycard`: one "Security deposit" card, Verify locked with its hint.
- `08-rent-receipt`: "Payment confirmed · Rent", "On-time payment", "View on Solana Explorer", timeline "Active lease · Now".
- `carla-375-dark-03-docs`: evidence side by side.
- `ana-375-dark-00-empty`: hero at 375.

### Demo script and recording brief vs code

- **Labels:** every quoted label exists verbatim in `components/**`, `lib/agents/orchestrator.ts` or `lib/rules/*` (templates). The rendered text was confirmed in the browser run (see non-blocking 6).
- **Production rate limit:** "120 chat messages per 5 minutes" matches `app/api/chat/route.ts:16-29` in replay mode.
- **Timing:** the slots add up to 2:58. Voice-over at about 138 wpm needs 4–21 s per slot against 10–35 s available. UI waits observed in replay are about 1.4 s per chat turn and 2.1–2.4 s per payment, so every slot fits. The tightest slot is 2:22–2:42 (explorer page load plus 13 s of speech); the script keeps a backup explorer tab.

## Not covered

- **Production:** not deployed with this branch.
- **Real-device rendering and screen-reader output:** live-region verbosity is inferred from code.
- **Contrast of non-token colours inside `PropertyArt` SVGs:** decorative, `aria-hidden` assumed.
- **Unit tests:** vitest is blocked on this machine.
- **The OG image as rendered by social platforms.**
