---
title: "SybilClaw Release Checklist"
summary: "Steps to cut a new SybilClaw release"
---

# SybilClaw Release Checklist

## Version Strategy

> **Important:** SybilClaw follows the upstream `2026.x.y` versioning scheme — do **not** bump to `1.0.0` or any semver that resets the major version. All upstream plugins declare `minHostVersion: ">=2026.x.y"` constraints that use numeric comparison. Resetting the major version below `2026` would break every plugin that hasn't opted into SybilClaw explicitly.
>
> Use the package **name** (`sybilclaw`) as the fork identity. Releases are tagged `v2026.x.y` (dropping the `-rc` suffix for stable releases).

---

## Pre-Release

- [ ] **CHANGELOG** — update `CHANGELOG-sybilclaw.md` with notable SybilClaw-specific changes since the last release (see format below)
- [ ] **Docs review** — confirm all `docs/sybilclaw/` docs are accurate and linked from README
- [ ] **Local build test** — `pnpm install && pnpm build` produces `sybilclaw.mjs` cleanly
- [ ] **Docker smoke test** — pull `ghcr.io/rdevaul/sybilclaw:<tag>` and run `openclaw --version` inside the container

## Publishing

- [ ] **Tag the release** — create and push a non-RC tag: `git tag v2026.x.y && git push origin v2026.x.y`
- [ ] **npm publish** — trigger `npm-release.yml` workflow manually with the release tag
- [ ] **GitHub Release** — create release from tag; paste relevant CHANGELOG section as the release notes; mark as latest
- [ ] **Docker `latest` tag** — confirm `ghcr.io/rdevaul/sybilclaw:latest` points at the new build (the Docker workflow tags `latest` for non-prerelease tags automatically)

## Post-Release

- [ ] **Smoke-test npm install** — `npm install -g sybilclaw && openclaw --version` on a clean machine
- [ ] **Announce** — Discord / X / wherever the OpenClaw community lives
- [ ] **Tag upstream diff** — note which upstream OpenClaw version this release forks from (for future merge tracking)

---

## CHANGELOG Format

SybilClaw-specific changes live in `CHANGELOG-sybilclaw.md` at the repo root. The upstream `CHANGELOG.md` is preserved as-is for plugin compatibility reference.

```markdown
## 2026.x.y — SybilClaw

### New (SybilClaw-specific)

- ...

### Inherited from OpenClaw 2026.x.y

- See CHANGELOG.md for full upstream notes
```
