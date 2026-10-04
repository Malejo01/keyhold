# B8 review: submission docs (README, architecture, Earn, Colosseum, pitch deck, pre-selection)

**Verdict: NO-GO as written, GO after one text fix (B1).** Everything else is accurate against `main` today, honest about custody and traction, and the Mermaid, character counts and links check out. B1 is one sentence, but it is a false statement in the file judges read first.

- Reviewer: qa-security-reviewer (dev agent). I did not write any of this.
- Date: 2026-10-04 (ART).
- Target: branch `docs/submission` at `f3dd3f3` (= `main` at `ad57ca3` plus docs). Files: `README.md`, `docs/architecture.md`, `docs/submission/{earn,colosseum,pitch-deck,preselection}.md`, `CHANGELOG.md`.
- Method: read every file, compared each technical claim with the code in that worktree, ran the counters, parser and link checks below. Nothing was deployed, nothing was sent, no live model calls, no Solana transactions (only read-only `getTransaction` on devnet).

## Blocking

**B1. `README.md:225` says "The program has not been written".** That is false. Branch `f3-anchor` (`6d0379e`) contains `programs/rental_escrow`, 65 integration tests passing in CI, an IDL and `docs/onchain.md`, and its B4 re-gate is GO for the program code (`docs/reviews/b4-anchor.md` on that branch). It is not deployed (the placeholder program id has no account on devnet) and not merged into `main`. This is the mismatch flagged in the B4 review.

Required fix (one line): replace with "Nothing here has been audited. The Anchor program exists on a branch with a CI test suite, is not merged and not deployed; dependencies are not audited."

Related lines that are true for `main` today but should use the accurate phrasing "not on `main`; built and CI-tested on a branch, not deployed" at the next refresh. Not blocking, because they understate rather than overclaim:

- `README.md:7`, `README.md:53`, `README.md:199`, `README.md:266` ("`docs/onchain.md`, not written yet" is false on the branch), `docs/architecture.md:135` and `:137`, `docs/architecture.md:140` (the branch implements `vote_release` and `cancel_lease`, not `release_deposit`), `docs/submission/earn.md:35`, `docs/submission/colosseum.md:4`, `:91`, `docs/submission/pitch-deck.md:67`, `docs/submission/preselection.md:5` and `:31`.
- When B4 merges, every one of these must be rewritten together with the Earn checklist item at `earn.md:80`. Never write "trustless" until the program is deployed and the demo uses it.

## Non-blocking

**N1. "Trustless" in present tense in the first sentence.** `README.md:5` and `docs/submission/colosseum.md:31` open with "Solana makes the deposit and payment record trustless and portable". The next sentence qualifies it as custodial, so it is not a lie, and the pre-selection form and one-liners correctly avoid it. But a card or excerpt that shows only the first sentence will read as a present claim. Suggest "is meant to make ... trustless" or the 121-character one-liner already used in the forms. Same rule as `pitch-deck.md:11`.

**N2. `ESCROW_MODE` is not read by any code.** `grep -rn ESCROW_MODE` over `*.ts`, `*.tsx`, `*.mjs`, `*.json` finds only `.env.example:25`. `README.md:197` ("Escrow mode today is `ESCROW_MODE=custodial`"), `README.md:200` and `docs/architecture.md:133`, `:142` ("the custodial path stays behind `ESCROW_MODE`") describe a switch that does not exist on `main`. Reword to "custodial by construction; `ESCROW_MODE` in `.env.example` is a placeholder" or confirm it exists after B4.

**N3. `README.md:232` price range.** "priced 250 to 700" but `seed/properties.json` has 10 properties from 270 to 690 `priceUsdc`. Say "270 to 690".

**N4. Open `TODO(...)` markers.** README: `:12`, `:13`, `:243`, `:254`, `:256`, `:342`, `:352` to `:354`. Same in Earn, Colosseum, pre-selection (names, email, Telegram, videos, bios, Team Leader). These are human-only items and expected today, but the pre-selection form closes at 16:00 ART today; its checklist (`preselection.md:112-125`) lists them.

**N5. `earn.md:10`.** Says the counts were measured "because no Node runtime was available to the writer". Node confirms every figure (below), so the sentence can go or say "re-checked with node".

**N6. Unverified third-party facts.** The Fiador.sol figures (21 instructions, 66 tests), RentLock, Bitso 57% and 14%, Chainalysis and the 15/10 DNU vote come from `docs/02` with its own source tags; the README marks the comparison "TODO(Ani): re-check". I did not re-verify them. The wording is attributed and hedged, which is acceptable.

**N7. `README.md:330`, `:331`.** "All 7 evals pass in replay" and "Evals 3/3 live" come from the changelog and earlier reviews; I did not re-run evals (the brief blocks vitest locally and live calls). The e2e "59/59 on production after `c1f2ac0`" matches `docs/reviews/phase-1-recording.md:183` and `CHANGELOG.md:35`.

**N8. Preview of Earn field limits.** The Earn field names and character limits are unverified (docs/02 §8); the draft says so at `earn.md:9`. Good. Re-check at freeze.

## Checklist (as asked by the lead)

| Item | Result |
|---|---|
| Custodial escrow stated | Yes. `README.md:7`, `:52`, `:195-200`; Earn answers 1, 2, 4; Colosseum description; pitch deck "Say custodial wherever escrow appears". |
| Anchor described accurately | Understated, one false line (B1). On `main` "not built" is true. |
| No invented traction, users, pilots, LOIs, revenue | Pass. `README.md:60`, `:256`, `earn.md:43`, `colosseum.md:98`, `pitch-deck.md:10`, `:100`, `:111`. `docs/validation/evidence.md` is empty. |
| No "trustless" or "secured" as present fact | Mostly pass; see N1. "secured" appears only in "Do not say" lists. |
| Disclosures complete | Pass (`README.md:336-346`): Claude Code as AI coding assistant, Google Gemini `gemini-3.5-flash-lite` as product model, pre-existing code none (pattern reused, not code), starting tag `v0-hackathon-start` (exists on origin, created 2026-10-03), open-source list (matches `package.json`, Anthropic SDK listed as optional), funding none, MIT (`LICENSE`). `TODO(Mauro): confirm this wording` stays until Mauro confirms. |
| English quality | Good. Plain, hedged, no non-English text except proper nouns (Qué Pinta Salta, DNU, Ley 7629). |
| Earn's 5 components | Present in order: deployed link, repo with overview and security, verifiable validation, progress and disclosures, team and roadmap. Matches `docs/02:61`. |
| Security claims vs code | Pass. See "Verified against code". |

## Evidence

### Character counts (recounted with node, code points, LF)

Script: `scratchpad/count.mjs`, extracts each fenced answer block.

```
earn.md        731 | 1182 | 1240 | 1326 | 1053     (stated 731, 1,182, 1,240, 1,326, 1,053)
colosseum.md   one-liner 121 | description 1694 | why Solana 953 | GTM 1279 | tools 128   (all as stated)
preselection   one-liner 121 | description 1179 | tools 128 | repo URL 35 | GTM 1673 | team draft 579
positioning line (colosseum.md:26): 140 characters exactly, as stated
```

All stated counts equal the actual counts; all are under the 2,000 and 140 limits. The pre-selection GTM paragraph sizes (93, 69, 101, 108, 373, 336, 271, 315) match when CRLF is normalised. Team draft is 579 with placeholders (text says "about 330 fixed"; fine, it will grow).

### Mermaid

`mermaid.parse()` (npm `mermaid` under jsdom, scratchpad) on every block:

```
README.md        block 1 OK flowchart-v2
docs/architecture.md  block 1 OK flowchart-v2
docs/architecture.md  block 2 OK sequence
docs/architecture.md  block 3 OK flowchart-v2
```

### Links

```
https://keyhold-app.vercel.app                       200  (homepage contains "Try the demo" and the banner "Demo · Solana devnet · simulated data")
https://github.com/Malejo01/keyhold                  200  (anonymous request, so the repo is public)
https://github.com/Malejo01/keyhold/releases/tag/v0-hackathon-start  200
https://faucet.solana.com                            200
git ls-remote --tags origin                          c1058db... refs/tags/v0-hackathon-start
```

### Devnet transactions in `docs/submission/tx-links.md` (and the Earn evidence index)

`getTransaction` on `api.devnet.solana.com`: deposit `55eFWkSF...` and rent `2w5SyNqw...` both `err: null`, blockTime 1791078937 and 1791078939, Memos `lease:v1:demo-de2034a10738:deposit:360f2888...ed69e` and `...:rent:0:360f2888...ed69e`. `sha256("Keyhold demo lease demo-de2034a10738. Sample text for the hackathon recording; no personal data.")` = `360f288876e511122e530f9168b9a84e1afceb181b9ade7bbef8855e873ed69e`, equal to the trailing hash.

### Verified against code (worktree = main + docs)

- Rate limit 120 per 5 min in replay and 30 live, in-memory per instance: `app/api/chat/route.ts:14-18`. `AI_DAILY_CALL_CAP` default 300: `lib/ai/index.ts:61-67`. `/api/pay` and `/api/lease` are not rate limited (0 hits of `checkRateLimit`), as the README says.
- Model `gemini-3.5-flash-lite`: `lib/ai/models.ts:16`, `.env.example:10-11`. Anthropic provider exists and is optional: `lib/ai/anthropic.ts`.
- 409 "Pay the deposit first.": `app/api/pay/route.ts:58`. In-flight double-submit guard: `route.ts:35`, `:67-68`.
- Memo `lease:v1:...` and legacy `tuki:lease:` accepted by Verify: `lib/solana/pay.ts:15`, `lib/solana/verify.ts:22`.
- Document text escaped (`&`, `<`, `>`, `"`) and wrapped in tags: `lib/agents/prompts.ts:72-81`.
- Discount math `list * (10000 - bps) / 10000`, cap at 10,000 bps: `lib/rules/pricing.ts:29-30`. 420 x 0.95 = 399, as in the demo text. Due date "tomorrow": `lib/agents/lease.ts:82`. Contract banner text: `lib/agents/lease.ts:43`.
- `server-only` package not installed; guards are comments plus `typeof window` in `lib/solana/keys.ts:6`: matches `README.md:224`.
- Diff scan for secrets (`AIza`, `sk-`, private-key headers, 64-byte arrays, base58 blobs over 80 chars) over `git diff main..HEAD`: 0 hits. Tracked files: only `.env.example` and `.claude/settings.json` (no keys).
- Competitor, pricing and demand statements: all hedged as hypotheses; "TODO(Ani): re-check" is present.

## Go / no-go

NO-GO as written; GO once `README.md:225` is fixed (B1). Recommended before the freeze: N1 and N2. The lead should also schedule the full "Anchor built, not deployed" rewrite for the day B4 merges, and the answers 1, 2, 4 of Earn and the Colosseum status table with it.
