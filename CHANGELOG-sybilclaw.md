# SybilClaw Changelog

SybilClaw-specific changes are listed here. For the full upstream OpenClaw change history, see [CHANGELOG.md](./CHANGELOG.md).

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
