# SybilClaw Rebase Plan — 2026-08-21

**Author:** Jarvis + Rich DeVaul
**Trigger:** Gateway memory leak (fixed upstream in v2026.6.11, #94942/#90455). We run OpenClaw 2026.6.1-base / SybilClaw 2026.6.17 — behind the fix.
**Target:** A recent stable upstream tag that contains the memory fix — candidate **`v2026.6.34`** (latest stable 2026.6.x, minimizes behavioral drift) with **`v2026.7.1`** as an alternative if we want the Gateway-recovery improvements too.
**Governing docs:** `LTS-REBASE-PLAN.md` (methodology), `REBASE-CONFLICTS-2026-06-11.md` (prior conflict log), `stability-policy.md`.
**Overriding constraint:** 🔴 **DO NOT DISRUPT PRODUCTION.** This box runs live gateways for Rich, Garrett, Umair, Yang, Jeremy, Dion via `~/Projects/sybilclaw/dist/index.js`. The rebase must happen entirely off to the side and only touch prod in one deliberate, reversible cutover.

---

## The scoping facts (measured 2026-08-21)

- **Fork divergence:** 110 commits ahead of merge-base `b7a5bcba788` (2026-05-27). Upstream is 28,226 commits ahead of that base.
- **BUT the real customization surface is small.** Of the 110, the overwhelming majority are (a) release/CI plumbing and (b) cherry-picked upstream `#PR` fixes that a rebase makes **redundant** (they'll be in the target). The genuinely SybilClaw-unique, load-bearing changes are a curated stack:
  1. **Rebrand + path migration** (`.openclaw`→`.sybilclaw`, CLI shim, logo/README): `sybilclaw.mjs`, `src/entry.ts`, `src/version.ts`, `src/infra/openclaw-root.ts`, `src/config/paths.ts`, `src/daemon/paths.ts`, `src/is-main.*`.
  2. **Per-agent memory / multi-user identity** (`memoryFile`, `memoryAllowedPaths`, `memory/personal/<name>/`): `src/config/types.agents.ts`, `zod-schema.agent-runtime.ts`, `src/agents/agent-scope-config.ts`, `bootstrap-files.ts`, `bootstrap-cache.ts`, `workspace.ts`.
  3. **Per-session compaction ownership**: `src/context-engine/types.ts`, `src/agents/pi-embedded-runner/run/attempt.ts`.
  4. **`/skills` operator command**: `src/auto-reply/reply/commands-skills.ts`, `commands-registry.shared.ts`, `commands-handlers.runtime.ts`.
  5. **Hand-rolled security backports** — MOSTLY REDUNDANT after rebase (target already contains the upstream versions); re-apply only SybilClaw-unique _intent_ (e.g. `#75781` no-auth-local-backend), not our copies of upstream fixes. See LTS plan §category-3.
- **Proven methodology exists:** the June rebase used **manual re-apply of the curated feature stack onto a clean upstream tag** (NOT `git rebase`/cherry-pick), precisely because the divergence is too large for mechanical replay. We follow the same approach.
- **Known high-conflict zones** (from June): `agent-scope*.ts` (upstream heavily refactored → functions moved to `agent-scope-config.ts`) and `pi-embedded-runner/run/attempt.ts` (gained guard/precheck features around our compaction hooks). Expect these two again.

---

## Production-safety architecture (the core of "don't stomp prod")

**The live gateway executes `~/Projects/sybilclaw/dist/index.js` directly.** Therefore:

- ❌ **NEVER** run the rebase, `git checkout`, or `npm run build` in `~/Projects/sybilclaw` while it's the live tree. A mid-rebase working tree or a partial `dist/` rebuild = instant multi-user outage.
- ✅ Do ALL rebase work in a **separate clone**: `~/Projects/sybilclaw-rebase/`. Build + test there. Production `~/Projects/sybilclaw` stays frozen on `41c26071270` (v2026.6.17) the entire time.
- ✅ Cutover is a **single atomic swap** of which directory the launchd gateway points at (or a tag checkout + rebuild done during a planned maintenance window), with an instant rollback path.

```
~/Projects/sybilclaw/           <- PRODUCTION. Frozen. Live gateway runs its dist/.
~/Projects/sybilclaw-rebase/    <- ALL rebase work happens here. Never touches prod.
                                   Becomes prod only at the deliberate cutover step.
```

---

## Phase plan

### Phase 0 — Prep & safety net (no prod impact)

1. **Tag current prod state:** in `~/Projects/sybilclaw`, `git tag prod-frozen-2026-08-21 41c26071270` and push. This is the rollback anchor.
2. **Snapshot the working dist:** `cp -a ~/Projects/sybilclaw/dist ~/Projects/sybilclaw-dist.bak-2026-08-21` — the exact bytes prod is running, for instant restore.
3. **Fresh clone for work:** `git clone ~/Projects/sybilclaw ~/Projects/sybilclaw-rebase` (local clone; inherits remotes). Add upstream, `git fetch upstream --tags`.
4. **Confirm target tag** contains the memory fix: verify `v2026.6.34` (or chosen tag) includes #94942 in its history/notes.
5. **Extract the curated feature stack as clean patches** from prod HEAD (in the rebase clone): produce `git format-patch` or a documented diff for each of the 4 load-bearing feature groups above, so re-apply is mechanical and reviewable. Update/append to `REBASE-CONFLICTS-2026-08-21.md`.

### Phase 1 — Build the rebased tree (in sybilclaw-rebase, no prod impact)

6. `git checkout -b rebase-2026.6.34 v2026.6.34` (clean upstream base).
7. **Manually re-apply the curated stack** in dependency order: rebrand/paths → per-agent memory → compaction ownership → /skills → any still-needed unique security intent. Resolve conflicts against the new base; expect `agent-scope-config.ts` + `pi-embedded-runner/.../attempt.ts` churn (consult June conflict log — the compaction hooks may have moved again).
8. **Drop the now-redundant items:** our copies of upstream `#PR` fixes and hand-backported security fixes that the target already contains. Keep only SybilClaw-unique intent.
9. Re-apply the SybilClaw version/branding scheme + `sybilclaw` wrapper so `sybilclaw --version` resolves.

### Phase 2 — Validate off-prod (no prod impact)

10. `npm ci && npm run build` in the rebase clone. Fix build breaks.
11. **Run the test suite** — especially the rebase-regression tests the fork already carries (`is-main.test.ts`, `commands-skills.test.ts`, gateway-server tests, chat.abort-persistence). The June rebase caught "3 rebase regressions in validation" — budget for the same.
12. **Stand up a throwaway test gateway on a DIFFERENT port** (e.g. `--port 18999`) with an **isolated state dir** (`SYBILCLAW profile pointing at a scratch `~/.sybilclaw-rebasetest/`), so it never touches the live `~/.openclaw-Jarvis/`state. Smoke-test: startup, a chat turn, model auth, a Multigraph pane, contextgraph, per-agent memory isolation,`/skills`.
13. **The acceptance gate that matters for THIS rebase:** run the test gateway under load for several hours and confirm the **memory leak is actually gone** (RSS stays bounded, no heap-pinned-2GB sawtooth). This is the whole point — validate the fix landed before cutover.

### Phase 3 — Cutover (the ONLY prod-affecting step; planned window)

14. **Pick a low-use window.** Notify team agents (bus post) that a gateway restart is coming.
15. **Freeze + backup live state:** the gateway persists to `~/.openclaw-Jarvis/`. Snapshot it (`cp -a` or tar) immediately before cutover.
16. **Swap:** point production at the rebased tree. Cleanest: promote the rebase clone — merge `rebase-2026.6.34` into `~/Projects/sybilclaw` main (fast-forward or replace), `npm ci && npm run build` **during the window**, then `launchctl kickstart -k gui/$UID/ai.openclaw.Jarvis`. (Remember: a true restart on this box = `kickstart`, not SIGUSR1 — SIGUSR1 only hot-reloads config.)
17. **Also handle the Atlas profile** (`ai.openclaw.Atlas`, the second gateway on 18790) — decide whether it rebases too or stays; it currently runs stock `npm`-global openclaw, so it's independent, but confirm.
18. **Post-cutover smoke:** health 200, a chat turn from Rich + one other user, Multigraph, contextgraph, per-agent memory, model auth all working.

### Phase 4 — Watch & rollback readiness

19. **Keep the memory watchdog running** — confirm over 24–48h that RSS stays bounded (the success metric).
20. **Rollback path (instant):** if anything breaks, `git checkout prod-frozen-2026-08-21`, restore `dist` from `sybilclaw-dist.bak`, `kickstart`. Back on the known-good build in <2 min. State dir was snapshotted in step 15.
21. Once stable 48h, delete scratch state dir; keep the frozen tag + dist backup for a couple weeks.

---

## Effort estimate

- **Phases 0–2 (all off-prod):** the real work — realistically **1–2 focused days**, dominated by re-applying the 4 feature groups against the new base and chasing `agent-scope`/`attempt.ts` conflicts + test regressions. The June rebase is the template; this one is _smaller_ (our base is newer: 2026-05-27 vs the prior 21k-behind divergence).
- **Phase 3 cutover:** ~30–60 min planned window.
- **Risk:** MODERATE. Mitigated by: off-prod build, isolated test gateway, instant rollback, and a proven prior methodology. The one genuinely delicate area is any remaining hand-rolled auth/security intent (`#75781` no-auth-local-backend) — re-express against the new upstream auth model, don't blind-reapply.

## Decisions needed from Rich before Phase 1

1. **Target tag:** `v2026.6.34` (safest, gets the memory fix, least drift) vs `v2026.7.1` (also gets Gateway-recovery + Control-UI changes, more drift). **Recommend 6.34** for a memory-focused rebase — minimize surface, take 7.x later.
2. **Atlas profile:** rebase it too, or leave on stock openclaw?
3. **Maintenance window:** when's acceptable for the ~30-60 min cutover restart affecting all users?

## What I can start now (zero prod risk, no cutover)

Phases 0–2 entirely. I can set up the rebase clone, extract the feature-stack patches, build the rebased tree against v2026.6.34, and validate memory in an isolated test gateway — all without touching production. Only Phase 3 needs your window + go.

---

## Phase 0 EXECUTION LOG (2026-08-21, completed)

**Decisions locked (Rich):** target `v2026.6.34`; Atlas left untouched; no maintenance window until cutover (all work off-prod first).

**Atlas resolved:** runs stock `/opt/homebrew/lib/node_modules/openclaw/dist/index.js` = **openclaw 2026.3.11** (npm-global), a DIFFERENT codebase from our SybilClaw fork. Per Rich's rule ("if it isn't the same codebase, don't touch it") → **Atlas is out of scope. Left alone.**

**Rollback anchors created:**

- git tag `prod-frozen-2026-08-21` → 41c26071270 (prod HEAD)
- dist snapshot `~/Projects/sybilclaw-dist.bak-2026-08-21` (125M, exact bytes prod runs)

**Work clone:** `~/Projects/sybilclaw-rebase/` (isolated; origin=github fork, upstream=openclaw). Full upstream history fetched (.git ~4.8G).

**Target verified — v2026.6.34 CONTAINS the fixes we need (our fork does NOT):**

- `#94942` fix(matrix): prune finished fake-indexeddb transactions to prevent OOM
- **`fix(gateway): plug long-running memory leaks`** ← directly our symptom
- 3× memory-core leak fixes (dream diary/narrative session leaks)
- Confirmed `origin/main` (our fork) is NOT a descendant of v2026.6.11 → the gap is real; rebase closes it.
- v2026.6.34 dated 2026-08-04; 9,282 commits ahead of our merge-base (b7a5bcba788, 2026-05-27).

**Feature stack extracted** to `~/Projects/sybilclaw-rebase-patches/` as reviewable `.diff`s (8 clean single-parent commits, 37 file-changes):

- 00 rebrand/path migration (736L) — sybilclaw.mjs, entry.ts, version.ts, config/paths.ts, daemon/paths.ts, infra/openclaw-root.ts
- 01 per-agent memoryFile/memoryAllowedPaths (354L) — config/types.agents.ts, zod-schema.agent-runtime.ts, agent-scope-config.ts, bootstrap-files.ts, bootstrap-cache.ts, workspace.ts
- 02 per-session compaction ownership (82L) — context-engine/types.ts, pi-embedded-runner/run/attempt.ts
- 03 /skills operator command (638L) — commands-skills.ts(+test), commands-registry.shared.ts, commands-handlers.runtime.ts, plugins/command-registration.ts
- 04 sybilclaw wrapper is-main (62L) — entry.ts, infra/is-main.test.ts
- 05 version resolver (46L) — version.ts, package.json
- 06 branding/README/docs (3612L, mostly docs/sybilclaw + README — low-risk)
- 07 canonical sessionKey in chat.send abort (61L) — gateway/server-methods/chat.ts

**Known high-conflict zones for Phase 1** (per June log): `agent-scope-config.ts` and `pi-embedded-runner/run/attempt.ts` (upstream refactors around our compaction hooks). Budget conflict resolution there.

**Status: Phase 0 DONE. Zero production impact — prod untouched, still on v2026.6.17.** Ready for Phase 1 (re-apply feature stack onto v2026.6.34) on Rich's go.
