# SybilClaw Changelog

SybilClaw-specific changes are listed here. For the full upstream OpenClaw change history, see [CHANGELOG.md](./CHANGELOG.md).

---

## SybilClaw Tier 1 — Security Backports (May 2026)

Per-commit cherry-picks of upstream OpenClaw security fixes that affect the
SybilClaw `2026.5.12` baseline, resolved at hunk level per
[`docs/sybilclaw/stability-policy.md`](./docs/sybilclaw/stability-policy.md).
Upstream attribution is preserved in each commit via `git cherry-pick -x`.

### Landed

- **GHSA-2hfg-4fh4-qp7f** (CVSS 7.7) — Browser `act` interactions bypassed
  private-network navigation checks. Enforce navigation/SSRF guards for `act`
  interactions. Backported upstream `3d93174c43` (#81070). Bloat ratio 1.0.

### Deferred (need follow-up — see `docs/sybilclaw/BATCH-A-EXECUTION-2026-05-30.md`)

The remaining eight high-severity fixes in this batch could not be cherry-picked
at hunk level against the `2026.5.12` baseline: each presupposes intervening
upstream refactors (or collides with a SybilClaw hand-divergence) that would
require taking whole upstream files or backporting prerequisite commits —
exactly the bloat failure mode the stability policy forbids. They are tracked
for re-implementation rather than force-resolved:
GHSA-mhq8-78pj-5j79, GHSA-3c6j-hq33-3jv4, GHSA-mgq6-vr84-7m2j,
GHSA-xww8-gqvh-92x9, GHSA-qjpc-qf9m-xwmr, GHSA-6fvr-66p3-3qj4,
GHSA-hw9r-h9mr-4jff, GHSA-q99w-vh6v-q3v7.

---

## 2026.4.1 — SybilClaw (first release)

### New (SybilClaw-specific)

- **Per-agent memory isolation** — each agent gets its own `memoryFile` and optional `memoryAllowedPaths` enforcement, preventing cross-agent memory leakage in multi-user households.
- **Tiered shared context** — `memory/shared/` directory for household-level facts visible to all agents; personal directories (`memory/personal/<name>/`) isolated per user.
- **Multi-agent household support** — first-class per-agent identity, persona, and memory config via `sybilclaw.json` (drop-in replacement for `openclaw.json`).
- **Binary rename** — CLI ships as `sybilclaw` with an `openclaw` compatibility symlink so existing scripts and plugin integrations continue to work unchanged.
- **Docker image** — `ghcr.io/rdevaul/sybilclaw:latest` and versioned tags available via GitHub Container Registry.
- **Migration guide** — `docs/sybilclaw/migrating-to-sybilclaw.md` covers upgrading from an existing OpenClaw install in 5 steps.

### Inherited from OpenClaw 2026.4.1

See [CHANGELOG.md](./CHANGELOG.md) for the full upstream release notes.
