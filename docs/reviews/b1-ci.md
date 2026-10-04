# Review: block B1 (CI), branch ci/setup

Reviewer: qa-security-reviewer. Scope: `git diff main..ci/setup` (`.github/workflows/ci.yml`, CHANGELOG.md, README.md) and Actions run 37177926780.

## Verdict: GO

No blocking issues. The non-blocking items below should be taken before B4 lands a real Anchor program.

## Blocking

None.

## Non-blocking

1. Third-party actions pinned by tag, not SHA (`.github/workflows/ci.yml` lines 33-35, 100, 127, 156, 204-207: `actions/checkout@v7`, `setup-node@v7`, `cache@v6`, `pnpm/action-setup@v6`). All four tags exist upstream (v7.0.1, v7.0.0, v6.1.0, v6.1.0). Scenario: a moved tag could run attacker code in the job. Impact is limited: the token is read-only and no secrets exist. Pin to SHAs when time allows (the run log already shows the resolved cache SHA 55cc834).
2. `ci.yml:177` runs `curl -sSfL https://release.anza.xyz/v4.1.2/install | sh`. The version is pinned but the installer script is not checksummed. Same low impact. Anchor's own CI does the same through a retry wrapper.
3. `ci.yml:182` runs `cargo install --git ... --tag v1.2.0 --locked`. A tag, not a commit. The run resolved it to 84a63f9f. Consider `--rev 84a63f9f`.
4. `actions/checkout` keeps `persist-credentials` at its default (true), so the read-only GITHUB_TOKEN stays in `.git/config` for later steps. Set `persist-credentials: false` (not needed here, since no step pushes).
5. Program path not exercised. Only the toolchain pins were verified (forced run: `solana-cli 4.1.2`, `anchor-cli 1.2.0`, rustc 1.93.0). The `anchor build` and `anchor test --validator legacy` steps (`ci.yml:221-227`) have never run against a real program. B4 should expect:
   - `anchor test` runs the `[scripts] test` entry of Anchor.toml. The Anchor default uses yarn/ts-mocha, not pnpm.
   - `anchor test` builds again, so the build runs twice.
   - `pnpm install` at the repo root needs the program's TS test deps in package.json.
6. The cache-hit path of the anchor job was never run, because the forced runs were all cold. Restoring `~/.cargo/bin` and `~/.avm` while skipping install is plausible but unproven. The pin check in "Activate toolchain" would catch a bad restore, so this fails loud, not silent.
7. `ci.yml:103`: `hashFiles('**/*.ts', '**/*.tsx')` changes on any source edit. It works because `restore-keys` falls back to the lockfile prefix, and node_modules does not exist yet at that step. Fine.
8. `push` plus `pull_request` double-runs every PR branch. Cosmetic cost only. `concurrency` with `cancel-in-progress` also applies on main, so a newer push cancels an older main run. Acceptable.
9. Every anchor-build run installs Rust 1.93.0 even though the runner image already ships rustup. Cost only.
10. Commit trailer: all 5 commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. The brief and project config require `Claude Opus 5.5 (1M context)`. Do not rewrite pushed history (no force-push rule). Use the correct trailer from now on.
11. The commit messages contain `[anchor-force]`, which triggers the toolchain install on push. It is only a compute cost, but note that a fork PR that adds `Anchor.toml` or `programs/` also triggers the install (up to 60 minutes). No secrets are exposed.
12. Runner label warning: `ubuntu-latest` migrates to Ubuntu 26 on 2026-10-19. Consider pinning `ubuntu-24.04` to keep the demo-period CI stable.

## Checks

- Least privilege: pass. Top-level `permissions: contents: read` and no job overrides. The log "GITHUB_TOKEN Permissions" shows only Contents: read and Metadata: read.
- Secrets: pass. `${{ secrets.* }}` is not referenced. `SESSION_SECRET` is an obvious dummy value (visible in logs by design). Build env holds only public devnet values. `grep` of the diff for secret, private, keypair and token finds only comments and the throwaway `solana-keygen` step (`ci.yml:215-219`). That step runs only on the program path, writes to `$HOME`, and is never committed.
- Fork PRs: pass. They use the `pull_request` event (not `pull_request_target`), so the token is read-only and no secrets are passed. Cache scope is per PR ref, so a fork cannot write to the cache that main and other branches read. Untrusted data (`head_commit.message`, `inputs`) goes through `env:` and is not interpolated into the script (`ci.yml:131-138`), so there is no script injection. `head_commit` is null on PRs, so `[anchor-force]` cannot be set from a fork.
- Cache poisoning: pass. Caches are keyed by version only. GitHub scopes writes per branch, and the default branch cache is readable by all branches but writable only from main. A branch cannot poison main. Residual risk: a collaborator pushing to main can seed `~/.cargo/bin`.
- Toolchain pins: verified against official sources.
  - `coral-xyz/anchor` redirects to `otter-sec/anchor` (GitHub API `full_name`). Release `v1.2.0` was published 2026-09-04.
  - `.github/workflows/tests.yaml@v1.2.0` sets `solana_version: 4.1.2`, matching the pin.
  - `cli/src/lib.rs` has `--validator` with default `surfpool`. `config.rs` defines `ValidatorType { Surfpool, Legacy }`, so `--validator legacy` is valid and the workflow comment is correct.
  - Workspace `version = "1.2.0"`. The run installed `avm v1.2.0 (otter-sec/anchor?tag=v1.2.0#84a63f9f)`. The first failure (run 37177742208) showed that Rust >= 1.91 is needed, and the fix to 1.93.0 is in the log (`rustc 1.93.0 (254b59607 2026-01-19)`).
- No-program path: pass. In run 37177640652, `anchor-build` took the Detect step, printed the notice "No program yet ... this job passes", and all later steps were skipped (steps list: Install Rust through `anchor test` all `skipped`), with conclusion success. The `if:` guards on lines 147-227 are coherent: `!= 'false'` for toolchain steps, `== 'true'` for JS, build and test steps.
- Program path (static review): pnpm setup comes before setup-node (needed for the pnpm cache), then install, keygen, `anchor build`, `anchor test --validator legacy`. Logic is correct. Not run end to end (item 5).
- `next typegen` step (`ci.yml:54`): correct. Run 37177640652 went from failure to success after adding it, and typecheck is green in the final run.
- Final run 37177926780: all 6 jobs success. vitest ran 6 files and 39 tests, all passing (first Linux run of `pnpm test`). evals ran in REPLAY with no API keys. build passed in 27 s.
- README badge: pass. It points to `Malejo01/keyhold/actions/workflows/ci.yml/badge.svg`, matching the repo and workflow file name. The repo name is still "keyhold", as the README notes.
- CHANGELOG: pass. An entry is present under the newest day section. It is accurate and has no invented claims.
