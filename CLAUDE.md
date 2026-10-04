# CLAUDE.md — Tuki (AI rental agents + Solana)

Hackathon: **Colosseum Crypto World's Fair · Superteam Argentina track**. Team based in Salta, Argentina.
Tech lead: Mauro. Product, pitch and brand: Ani, with a design partner.

## Read first
1. `docs/02-hackathon-rules-market-judges.md`: deadlines, rules, form fields, market and judges.
2. `docs/01-spec-mvp.md`: product spec (agents, on-chain model, UI, seeds).
3. `docs/03-architecture-decisions.md`: decisions that **override** the spec where they differ.
4. `docs/04-brand-handoff.md`: how brand identity arrives via Claude Design.
5. `PLAN.md`: current phase, task board, owners. Update it at every phase gate.

@AGENTS.md

## Two meanings of "agents"
- **Dev agents** live in `.claude/agents/*.md`. They are the subagents that build this repo.
- **Product agents** live in `lib/agents/*`: orchestrator, listings, visits, prequal, crosscheck and lease. They run inside the app.
- Never mix the two in names or docs.

## Hard deadlines (ART, UTC-3)
- **Sun 04/10, 16:00:** pre-selection form. Needs pitch (2 min) + demo (≤3 min) + GitHub repo, all in English.
- Sun 04/10, 19:30: Demo Day.
- **Mon 12/10, 23:59:** Superteam Earn submission and Colosseum submission. Target internal freeze: **Sun 11/10, 20:00**.

## Non-negotiables
- **English** for README, UI copy shown to judges, commits, code and comments. Product agents answer in the user's language.
- **Devnet only.** No keypairs, `.env` or API keys in git.
- **No PII on-chain** and none in Memo strings. Only pubkeys, amounts, timestamps and sha256 hashes.
- **The model extracts, the code decides.** Business decisions live in `lib/rules/*`.
- Discounts and on-time status come from the confirmed tx `blockTime` or the program `Clock`, never from the client.
- **Honesty:** if escrow is custodial, say so. Never fabricate traction.
- **Disclosure:** pre-existing code (e.g. modules from `que-pinta-salta` or Tuki municipal) enters in its own commit with the message `chore(import): <module> from <repo>@<sha> (pre-existing)`. The README's Disclosures section lists it, and also states that AI-assisted coding (Claude Code) was used.
- **Mauro's other projects (`que-pinta-salta`, Tuki municipal) are READ-ONLY.** Reading and copying code from them into this repo is allowed. Never edit files, run scripts, install dependencies or run git inside those folders. Ask Mauro for the paths when needed. Everything copied goes in its own `chore(import)` commit (format above) and is listed in README › Disclosures.
- pnpm only. Regenerate the lockfile on every dependency change.

## Conventions
- Conventional commits (`feat(agents): …`, `fix(solana): …`).
- Every commit ends with the co-author trailer configured in Claude Code.
- Branch per phase task. Short-lived PRs. Vercel preview per PR. `main` must stay demoable.
- `CHANGELOG.md`: one section per day. Every dev agent appends its entry.
- File ownership is defined in each `.claude/agents/*.md`. Do not edit another agent's paths. Hand off instead.
- Server Components by default. Client Components only where interactivity requires it.
- Tailwind for styling and Framer Motion for animation. Tokens live in `styles/tokens.css`.

## Phase gates
A phase closes only when:
- qa-security-reviewer writes `docs/reviews/phase-<n>.md` with GO;
- `PLAN.md` is updated;
- `CHANGELOG.md` has an entry for that day.
