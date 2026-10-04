# AlquilIA: go-to-market and validation (draft, 2026-10-03)

Status: **plan only.** As of this writing there are **no users, no pilots, no LOIs, no interviews held and no partnerships**. Nothing in this document is a result. Anything citable will be logged in `docs/validation/evidence.md` and only then referenced elsewhere. Items marked **[Assumption]** or **[Hypothesis]** are untested.

## 1. Buyer and wedge

- **Buyer / operator (AD-05):** licensed real-estate agencies, starting in Salta Capital. The agency runs AlquilIA and, in the planned escrow design (AD-04), acts as arbiter: deposit release needs 2 of 3 signatures (tenant, landlord, agency).
- **Why agencies and not a marketplace:** intermediation in Salta requires a registered broker (CUCIS, Ley 7629). AlquilIA is positioned as software for registered agencies, not as an intermediary. **[Assumption: to be confirmed by a short legal consult.]**
- **Wedge:** the pre-qualification and cross-check back-office. The tenant-facing chat is the front door. The pre-qualifier extracts fields, deterministic rules decide, and an independent cross-check agent sends disagreements to the agency review queue. **[Assumption: agencies still do this document review by hand. This is what the interviews must confirm or refute.]**
- **Not the wedge:** search and visit scheduling. Other products already offer it, so we treat it as a commodity.

## 2. Pricing hypotheses (untested)

All of these are **hypotheses to test in interviews**. No agency has been asked yet and no price has been validated.

| # | Model | Unit | Why it might work | Open question |
|---|---|---|---|---|
| H1 | SaaS per active lease managed | ARS per lease per month | Predictable for the agency, aligned with admin work | Does the agency manage enough leases to care? |
| H2 | Per pre-qualification | ARS per completed, cross-checked file | Pay only when value is delivered, easy to pilot | Will agencies pass cost to tenants or absorb it? |
| H3 | Hybrid: flat monthly base plus per-file fee | ARS | Covers support cost | Complexity for a first pilot |

- Prices will be quoted in **ARS** (Salta rents are in pesos). No price point is proposed here until we hear what agencies currently spend in staff time. **[Hypothesis]**
- Interview script asks willingness to pay in open form first, then tests H1 vs H2.

## 3. Channel

1. **Direct outreach to Salta Capital agencies** (list: `docs/validation/agencies-salta.md`). Owner: Ani. First contact by public business channel (website form, business phone, WhatsApp, Instagram DM). Ask for a 15-minute call, not a sale.
2. **Colegio Único de Corredores Inmobiliarios de Salta (CUCIS)**: institutional context. Its public registry lists matriculated brokers. We will check whether a talk or a short presentation is feasible. No relationship exists today.
3. **Local network** of the team (Salta-based). Warm introductions where available, logged as such.
4. **Later:** landlords who list directly (Marketplace and similar) and student or professional tenant groups, as secondary signals only. They are not the buyer.

## 4. Validation plan, Mon 05/10 to Sat 10/10

These are **targets, not results.**

| Target | Count | Instrument | Where evidence goes |
|---|---|---|---|
| Agency interviews (include REMAX NOA if reachable) | 5 | 15-min call or visit, same question set each time | One row per interview in `docs/validation/evidence.md`, notes linked |
| Direct-owner (landlord) interviews | 5 | Short call or chat | Same |
| Tenant / student survey answers (UNSa, UCASAL, mining professionals, freelancers) | 30 | Form, at most 10 questions | Form export or screenshot, aggregated counts only |
| Letter of intent or pilot request from at least one agency | at least 1 | Non-binding LOI, or written pilot agreement via chat/email | Signed or written artifact, only with the agency's consent to be named |
| Short legal consult (Art. 765 CCyC with USDC, PSAV, CUCIS) | 1 | Lawyer consult | Written summary in evidence log |

Questions the interviews must answer:
- Time per tenant pre-qualification today, and who does it.
- Share of deposits that end in dispute (we have no statistic; this is anecdotal today).
- Willingness to pay for automated pre-qualification, and which unit (H1 or H2).
- Openness to settle in pesos via on-ramp with USDC as the settlement layer, versus USDT, versus not at all.
- What proof of property condition agencies keep, and who they would accept as arbiter.

Rules for the log: real entries only, roles instead of names, no personal data without written consent, one artifact link per row where possible. If a target is missed, the log says so.

## 5. Risks

| Risk | Detail | Mitigation |
|---|---|---|
| ARS pricing | Rents in Salta are quoted in pesos. USDC demand among tenants and landlords is unproven. | Roadmap: "pay in pesos via on-ramp, settle in USDC" (AD-07). The hackathon build settles in USDC only and builds no ARS rails. The survey measures actual wallet and stablecoin usage. |
| USDT vs USDC | Public data suggest USDT is more used than USDC in Argentina. | Treat USDC as a settlement choice for the design, not as a market claim. Ask in interviews and survey. Consider other stablecoins only if the evidence points there. |
| DNU 70/2023 regime uncertainty | Press reports say a congressional session on Oct 15 may vote on rejecting the DNU. The outcome and consequences are uncertain. | No law is treated as settled. Product features (pre-qualification, cross-check, deposit record) are meant to work under either regime. Contract text stays off-chain, only its hash goes on-chain. Legal review is pending. |
| Custody and virtual-asset regulation | If the escrow counts as custody, CNV rules for virtual-asset service providers (PSAV) might apply. **[Not assessed.]** | Be explicit that escrow is custodial on devnet today. The Anchor program is the planned path. Seek the legal consult above. |
| Brokerage rules (CUCIS, Ley 7629) | Operating as an intermediary could require registration. | Position as software for registered agencies. Confirm with counsel. |
| Willingness to pay | Agencies may see no pain or no budget. | Interviews are designed to refute as well as confirm. A negative signal is logged as negative. |
| Small local market | Salta alone is a small market. | Treat Salta as a beachhead. Any expansion claim is a hypothesis until evidence exists. |
| Competition | Similar projects exist (for example Fiador.sol, RentLock) and tenant-screening services exist elsewhere in Argentina. | Differentiator is the agency back-office plus a cross-check agent plus 2-of-3 release with the agency as arbiter. Not validated commercially. |

## 6. Next 90 days (plan, not commitments)

- **Weeks 1 to 2 (to about mid-October):** run the validation plan above. Publish the evidence log. Decide go or no-go on the agency wedge based on what we hear.
- **Weeks 3 to 6:** if at least one agency agrees, run a supervised pilot on real but consented pre-qualification files, with no money moving. Keep the escrow on devnet.
- **Weeks 7 to 10:** test one pricing model (H1 or H2) with the pilot agency. Complete legal review before any real-funds flow. Evaluate an on-ramp provider.
- **Weeks 11 to 13:** decide on a second agency cohort or a pivot, based only on logged evidence.

## 7. Where evidence will be added

| Evidence | File |
|---|---|
| Every interview, survey batch, outreach reply, LOI or pilot message | `docs/validation/evidence.md` |
| Contact list and outreach status | `docs/validation/agencies-salta.md` |
| Scripts, survey, LOI template | `docs/validation/` (to be added by the lead or market agent) |

Judge-facing statements about traction must cite a row of the evidence log. If there is no row, there is no claim.

## 8. Form field: "Market / GTM" paragraph (about 422 characters including spaces, hand-counted)

> Buyer: licensed real-estate agencies in Salta, starting in Salta Capital; wedge: pre-qualification and cross-check back-office, which we assume agencies still do by hand. No users, pilots or LOIs yet: from 05/10 to 10/10 we target 5 agency interviews, 5 landlord interviews, 30 tenant survey answers and at least 1 LOI or pilot request, logged in docs/validation/evidence.md. Pricing is a hypothesis to test, not a result.
