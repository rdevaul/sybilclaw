# SybilClaw Stability Policy

SybilClaw is a friendly fork of [OpenClaw](https://github.com/openclaw/openclaw)
maintained by Rich DeVaul and Dark Matter Lab. Our goal is **boring reliability**: the version
you ran yesterday should still work today, and you shouldn't have to babysit
upstream churn to stay safe.

This document explains how we decide which upstream changes to take and when.
If you operate SybilClaw in production, this is the contract you can plan
against.

## Mission statement

SybilClaw prioritizes, in order:

1. **Security.** Every fix that addresses a real exploit or hardening gap
   lands as fast as we can review it.
2. **Stability and correctness.** Bug fixes for production-impacting issues
   (lockups, dropped messages, persistence corruption, gateway flakiness) land
   continuously after review.
3. **Compatibility with the upcoming OpenClaw LTS release.** When upstream
   ships an LTS branch, SybilClaw rebases its mainline onto that LTS and
   tracks its security/stability stream from there.
4. **New features**, only after they are stable upstream and we have a reason
   to want them.

We do **not** track upstream's mainline 1:1. We do **not** YOLO merge
upstream's release branch. Every change that lands in SybilClaw `main` has
been reviewed by a human and verified to build cleanly.

## The three tiers

Upstream changes that we consider for backporting fall into one of three
tiers. Each tier has a different acceptance bar.

### Tier 1 — Security

**Examples:** CVE fixes, hardening against env-injection, credential
redaction, root-execution guards, dependency overrides for vulnerable
transitive packages, auth-failure-closed fixes.

**Bar:** Backport quickly (target: within a week of the upstream commit
landing on `openclaw/openclaw:main`). Accept temporary build-warning churn
or minor refactor exposure if needed to land the fix promptly.

**Process:**

- Cherry-pick per-commit from upstream onto a `chore/upstream-tier1-*` branch.
- Hunk-level conflict resolution only. **Never take entire upstream files**
  to "resolve" a conflict — that's how prior batches ballooned to 70× the
  upstream patch size.
- Verify bloat ratio (our diff size ÷ upstream's diff size) ≈ 1.0 after each
  pick. Ratios above 2.0 require justification.
- CHANGELOG entries for the batch are consolidated into a single
  "SybilClaw Tier 1 — Security Backports (Month YYYY)" section per release.
- Open one PR per batch, reviewed by at least one human reviewer before merge.
- Each pick that requires substantial structural reconciliation gets
  **deferred to its own follow-up PR** rather than risking subtle regressions
  in a large multi-commit batch.

### Tier 2 — Stability

**Examples:** Telegram polling-loop wedges, gateway reconnect-state
preservation, embedded session transcript persistence, cron job wake-now
retries, provider streaming error handling, codex stdio cleanup.

**Bar:** Backport when there is evidence the issue affects SybilClaw users
or operators in practice. We are slower here than tier 1 — a flaky-test
fix with no field reports can wait for the next batch.

**Process:**

- Same per-commit cherry-pick + bloat-ratio verification as tier 1.
- Batched roughly monthly into a single `chore/upstream-tier2-*` PR.
- CHANGELOG consolidated section: "SybilClaw Tier 2 — Stability Backports
  (Month YYYY)".
- Picks that require structural reconciliation (test-file divergence,
  refactor-bound changes) are deferred to follow-up PRs; we do not block
  the rest of a tier 2 batch on one tricky commit.

### Tier 3 — Features

**Examples:** New providers, new channel integrations, new tools, UX
overhauls, performance optimizations, new tunable knobs.

**Bar:** Land **only against the upcoming OpenClaw LTS release** once it
exists. Until then, SybilClaw is **feature-frozen relative to its current
upstream baseline**. We will not chase upstream features one-by-one on
mainline — that's the coupling we forked to escape.

**Exception:** A feature directly required by a tier 1 fix lands with
the tier 1 fix and is documented in the tier 1 CHANGELOG section.

**Operator-facing implication:** if you need a feature that exists in
upstream OpenClaw `main` but not in SybilClaw, file an issue describing the
operational need. We may carry a tier 3 cherry-pick early if the case is
strong, but the default answer is "wait for LTS rebase".

## LTS rebase plan

Upstream OpenClaw is preparing an LTS designation. When the first LTS tag
ships:

1. We branch the current SybilClaw `main` to `legacy/<version>` so existing
   deployments can keep getting our security backports without forced upgrade.
2. We hard-rebase SybilClaw `main` onto the LTS tag. Our SybilClaw-specific
   commits (rebrand, per-user agent identity, agent attachments path
   handling, pane-bus shape, etc.) re-apply as a curated stack.
3. We track the LTS branch from there using the same tier 1/2 process.
4. We bump the SybilClaw major version on the rebase to make the discontinuity
   obvious in `npm` and in `--version` output.
5. We open a tracking issue at least 30 days before the rebase so operators
   can plan upgrades.

Until LTS ships, SybilClaw `main` continues to track upstream `main` for
tier 1 and tier 2 changes only.

## What "feature freeze relative to upstream" means in practice

We are **not** stripping features that already exist in our current
SybilClaw baseline. We **are** declining to absorb new features upstream
adds after our baseline. Concretely:

- Existing channel integrations (Discord, Telegram, Signal, WhatsApp,
  Slack, Matrix, etc.): keep working, get tier 1/2 fixes.
- Existing model providers: keep working, get tier 1/2 fixes.
- Existing skills/plugins API: stable; we do not break it for upstream
  refactors unless required by a tier 1 fix.
- New providers/channels/skills/tools that upstream adds after our
  baseline: not automatically pulled in.

Operators and developers who want to write SybilClaw extensions can
target the SybilClaw API surface as a stable platform. We will publish
breaking-change notices in CHANGELOG with at least one minor version of
notice when we have to break things for security or LTS rebase reasons.

## Bloat-ratio diagnostic

For backport reviewers, the canonical sanity check on a per-commit
cherry-pick is:

```text
ratio = (lines inserted in our cherry-picked commit)
      / (lines inserted in the upstream commit)
```

A healthy hunk-level cherry-pick lands at ratio ≈ 1.0. Anything above 2.0
is a strong signal that the resolver took entire upstream files instead
of just the conflicted hunks, and the commit should be redone.

This metric was added after a May 2026 incident in which a tier 1/tier 2
batch landed with bloat ratios 4×–71×, including 12 unresolved conflict
markers committed to mainline. The fix was a hard reset of `main` and a
rebuild of both batches with per-commit verification. See the May 9, 2026
incident archive tag (`archive/main-pre-reset-2026-05-09`) for the original
broken state.

## What we will not do

- We will not silently track upstream `main` to add features.
- We will not bypass review to "keep up" with upstream.
- We will not commit conflict markers to fork branches.
- We will not roll up multiple security fixes into a single squash that
  loses upstream attribution.
- We will not promise zero downtime through an LTS rebase; we will
  promise notice and a parallel `legacy/*` branch.

## Questions or concerns

Open an issue at <https://github.com/rdevaul/sybilclaw/issues> with the
`stability-policy` label. For security-sensitive reports, see SECURITY.md
when present.
