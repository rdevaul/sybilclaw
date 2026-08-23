# SybilClaw Rebase Conflicts & Re-expression Log — 2026-08-21/23

**Rebase target:** `v2026.6.34` (contains the gateway memory-leak fixes: #94942 + `fix(gateway): plug long-running memory leaks` + 3 memory-core leak fixes).
**Base merge point:** `b7a5bcba788` (2026-05-27). ~9,282 upstream commits between base and target.
**Strategy:** Manual re-apply of the SybilClaw feature stack onto the clean v2026.6.34 tag (same methodology as REBASE-CONFLICTS-2026-06-11.md), NOT git-rebase/cherry-pick.
**Work location:** `~/Projects/sybilclaw-rebase` branch `rebase-2026.6.34` (production tree `~/Projects/sybilclaw` untouched, frozen on v2026.6.17 / tag `prod-frozen-2026-08-21`).

---

## Result summary

**BUILD: clean** (`npm run build` → `✓ built`, dist/index.js produced, 0 errors; total 163.7s, tsdown 112.8s).
**RUN: works** — `node dist/index.js --version` → `OpenClaw 2026.6.34-sybilclaw (722652c)`.
**FEATURE TESTS: all pass** (241 tests across the re-applied features):

- rebrand/paths + is-main wrapper: 35 ✓
- per-session compaction ownership (compact.hooks): 69 ✓
- chat.send routing + abort persistence: 26 ✓
- /skills command: 11 ✓
- (paths/config: 25, is-main: 10 — included above)

## Feature groups re-applied (7 commits + 1 test-fix commit)

| Commit  | Feature                                          | Notes                                                                                                                                                                                                                                                                                                                                                |
| ------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4f28307 | rebrand: .openclaw→.sybilclaw CLI + paths        | Target files still existed; applied cleanly.                                                                                                                                                                                                                                                                                                         |
| 595e6a2 | per-agent memoryFile + memoryAllowedPaths        | agent-scope-config.ts — the June high-conflict zone; re-applied against current structure.                                                                                                                                                                                                                                                           |
| 0da2b42 | per-session compaction ownership                 | **Structural re-expression:** upstream renamed `pi-embedded-runner/run/attempt.ts` → `embedded-agent-runner/`. The `ownsCompaction` machinery still exists there; the per-session `ownsCompactionForSession()` hook was re-wired into the new runner. context-engine/types.ts half applied cleanly. **Validated by 69 passing compact.hooks tests.** |
| 88e4f17 | /skills operator command                         | **API re-expression:** upstream refactored the command registry (commands-registry.ts / commands-registry-list.ts) and added native `SkillCommandSpec`. Ported /skills to the new native command API. **Validated by 11 passing tests.**                                                                                                             |
| 431c6b7 | chat.send session routing debug log              | Re-expressed against current chat.ts server-method.                                                                                                                                                                                                                                                                                                  |
| cbe4049 | branding README + docs/sybilclaw/\*              | Low-risk docs.                                                                                                                                                                                                                                                                                                                                       |
| 722652c | test(config): paths.test rebrand expectation fix |                                                                                                                                                                                                                                                                                                                                                      |
| 3a5c565 | test(gateway): logGateway mock debug/info/error  | Completed the chat-routing test that was left uncommitted when the Phase-1 subagent hit its 33-min run limit.                                                                                                                                                                                                                                        |

## Known deltas vs. the June stack (intentional)

- Dropped: our copies of upstream `#PR` fixes and hand-backported security fixes now REDUNDANT (v2026.6.34 contains the upstream versions). Only SybilClaw-unique intent was carried.
- Version scheme: package name `sybilclaw`, version `2026.6.34-sybilclaw`.

## Still pending (before cutover)

1. **Full test-suite run** (thousands of tests) as a background pre-cutover gate — feature tests pass; broad regression sweep not yet run.
2. **Container smoke test** per REBASE-TEST-PLAN-2026-08-21.md (Layers 1–3).
3. **Memory-leak soak** (Layer 4) — THE acceptance gate: confirm RSS stays bounded on the new build (proves the upstream memory fix resolves our symptom).
4. **Push** rebased branch as the latest SybilClaw (Rich's sequencing: build+test+push before cutover).
5. **Cutover** (Phase 3) — Rich's call, maintenance window.

## Production safety status

Zero production impact throughout. Live gateway (Jarvis :18789) untouched on v2026.6.17; Atlas (:18790, stock openclaw 2026.3.11) out of scope per Rich. Rollback anchors in place: tag `prod-frozen-2026-08-21` + dist snapshot `~/Projects/sybilclaw-dist.bak-2026-08-21`.

---

## Phase 2 — Regression-test triage & fixes (2026-08-23, off-prod)

**Author:** Jarvis subagent (`sybilclaw-rebase-p2-fix`), for Rich.
**Scope:** Root-cause + fix the 25 test files that "failed" in the Phase-2 regression sweep (`/tmp/rebase-regression.log`). All work in `~/Projects/sybilclaw-rebase` (branch `rebase-2026.6.34`). Production tree untouched. A/B comparison against clean upstream worktree `/tmp/sc-clean-base` (tag `v2026.6.34`, node_modules symlinked to the rebase clone).

### TL;DR

- **The "25 failing files" was almost entirely a test-isolation artifact, not a code regression.** The initial regression sweep (and the first triage harness) ran with `OPENCLAW_STATE_DIR` overridden to a scratch dir **but left `SYBILCLAW_STATE_DIR` inherited from the parent shell** — and this debugging session runs _inside the production gateway's environment_, which exports `SYBILCLAW_STATE_DIR=/Users/jarvis/.openclaw-Jarvis` (and `OPENCLAW_STATE_DIR` = same). On our fork `SYBILCLAW_STATE_DIR` **takes precedence** over `OPENCLAW_STATE_DIR` (rebrand commit 4f28307, `src/config/paths.ts:resolveStateDir`), so the stale production value silently won and the tests read/spilled into real production state → false failures. The clean upstream base doesn't know `SYBILCLAW_STATE_DIR`, so the same tests pass there.
- **True genuine-regression count: 2** (both from the `/skills` feature re-apply, commit 88e4f17). **Both fixed & verified.**
- **1 file is a pre-existing OS/macOS artifact** (`openclaw-state-db.permissions.test.ts`) — it fails identically on the clean `v2026.6.34` base. Not our regression.
- **The remaining 22 files are test-isolation artifacts** — they pass on both trees under a properly-isolated env.

### Definitive 25-file classification

Method: each file run **isolated-env** on BOTH the rebase branch AND the clean base. "Isolated-env" done correctly this time = `env -i` with only `PATH/HOME/TMPDIR/LANG` + `OPENCLAW_STATE_DIR`/`OPENCLAW_CONFIG_DIR` set (SYBILCLAW\_\* explicitly cleared) so neither var family leaks from the parent gateway process.

Columns: **clean** = clean base (v2026.6.34) isolated; **pre** = rebase branch isolated _before_ fixes; **post** = rebase branch isolated _after_ fixes.

| Test file                                                      | clean | pre  | post | Category                                                  |
| -------------------------------------------------------------- | :---: | :--: | :--: | --------------------------------------------------------- |
| `packages/memory-host-sdk/src/host/session-files.test.ts`      | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/acp/runtime/session-meta.test.ts`                         | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/agents/failover-error.test.ts`                            | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/agents/sandbox/tool-policy.test.ts`                       | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/agents/workspace-run.test.ts`                             | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/commands/doctor-skills.test.ts`                           | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/commands/status.update.test.ts`                           | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/commitments/commitments-full-chain.integration.test.ts`   | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/commitments/extraction.test.ts`                           | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/commitments/runtime.test.ts`                              | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/commitments/store.test.ts`                                | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/crestodian/operations.test.ts`                            | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/docs/slash-commands-doc.test.ts`                          | PASS  | FAIL | PASS | **B (genuine regression — FIXED)**                        |
| `src/flows/channel-setup.status.test.ts`                       | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/infra/outbound/delivery-queue.storage.test.ts`            | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/media/local-roots.test.ts`                                | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/pairing/pairing-store.test.ts`                            | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/plugin-state/plugin-state-store.runtime.test.ts`          | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/plugin-state/plugin-state-store.test.ts`                  | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/plugins/contracts/deprecated-internal-config-api.test.ts` | PASS  | FAIL | PASS | **B (genuine regression — FIXED)**                        |
| `src/security/audit-hooks-routing.test.ts`                     | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/skills/workshop/service.test.ts`                          | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/state/openclaw-state-db.permissions.test.ts`              | FAIL  | FAIL | FAIL | A (pre-existing / OS artifact — fails clean base too)     |
| `src/state/openclaw-state-db.test.ts`                          | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |
| `src/status/status-plugin-health.runtime.test.ts`              | PASS  | PASS | PASS | A (test-isolation artifact — ambient SYBILCLAW_STATE_DIR) |

**Tally:** 2 genuine regressions (B, fixed) · 22 test-isolation artifacts (A) · 1 pre-existing OS artifact (A).

> ⚠️ Note on the _original_ `/tmp/rebase-regression.log`: all 25 showed FAIL there because that full-suite run inherited the production `SYBILCLAW_STATE_DIR`. Re-running the full suite from a shell that does NOT export `SYBILCLAW_*` (or inside the upstream container harness) will show only the OS-artifact permissions test — the same failure upstream sees on macOS.

### Root cause of the genuine regressions (both from the `/skills` re-apply)

Upstream tightened two guardrails between our merge base (2026-05-27) and `v2026.6.34`. Our re-applied `/skills` operator command (commit 88e4f17) predates them and violated both:

1. **`deprecated-internal-config-api.test.ts`** — Upstream's `scripts/lib/config-boundary-guard.mjs` now forbids production files under `src/auto-reply/reply/` (a "semantic config mutation scope") from importing the low-level config writer (`mutateConfigFile`/`transformConfigFile`/`replaceConfigFile`) from `config/config.js` **directly**; such files must route through the whitelisted domain helper `src/auto-reply/reply/config-mutations.ts`. `commands-skills.ts` imported `mutateConfigFile` directly for its three `agents.list[].skills` edits → guardrail violation (`commands-skills.ts:1 use the local domain config mutation helper instead of direct config writes`).

2. **`slash-commands-doc.test.ts`** — Requires every built-in chat-command `textAlias` to be documented in `docs/tools/slash-commands.md`. Our `/skills` command registers `textAlias: "/skills"` (`commands-registry.shared.ts:223`) but the feature commit never documented it.

Both are narrow, fork-owned gaps — the `/skills` port needed to conform to newer upstream conventions. Neither is a shared/systemic breakage.

### Fixes committed (branch `rebase-2026.6.34`)

- **`2508ea0` fix(rebase): resolve 2 genuine regressions from /skills feature re-apply**
  - Added `mutateAgentConfigEntry()` to the sanctioned `src/auto-reply/reply/config-mutations.ts` (matches an agent by normalized id, applies an in-place `skills` edit, no-op if absent — identical semantics to the old inline `mutateConfigFile` calls).
  - Refactored the three `/skills` enable/disable/reset call sites in `commands-skills.ts` to use it; dropped the direct `mutateConfigFile` import.
  - Documented `/skills` in `docs/tools/slash-commands.md` (Skills accordion).
- **`62e4373` test(rebase): make shared test-state helper SYBILCLAW-aware for isolation**
  - `src/test-utils/openclaw-test-state.ts` now captures + pins `SYBILCLAW_STATE_DIR` / `SYBILCLAW_CONFIG_PATH` to the same isolated paths as their `OPENCLAW_*` counterparts. Pure test-infra; no product behavior touched. This hardens helper-based tests so an ambient production `SYBILCLAW_STATE_DIR` can no longer defeat isolation (verified: `plugin-state-store(.runtime)`, `skills/workshop/service`, and the helper-based `openclaw-state-db` cases now pass even with the production var set).

### Verification (post-fix, isolated-env)

- **Both genuine-regression tests PASS** on the rebase branch: `slash-commands-doc` (1/1), `deprecated-internal-config-api` (1/1).
- **`commands-skills.test.ts` still PASS** (11/11) — the config-mutation refactor is behavior-preserving.
- **Full 25-file post-fix isolated sweep: 24/25 PASS.** The only remaining FAIL is `openclaw-state-db.permissions.test.ts` → **category A (fails clean `v2026.6.34` too; macOS filesystem-permission test: "rethrows EPERM when existing permissions are too broad" expects a throw that this OS/FS doesn't produce).**
- **4 core feature suites re-run, all green:** `config/paths` + `infra/is-main` (33), `embedded-agent-runner/compact.hooks` (69), `gateway/server-methods/chat.abort-persistence` (26), `auto-reply/reply/commands-skills` (11) → **226 tests / 6 files passed.**
- **`config/paths.test.ts` + `test-utils/openclaw-test-state.test.ts`** (helper's own tests) still pass (33) — the SYBILCLAW-aware helper change is safe.
- Type check: no `error TS` in the two touched source files (`tsgo` reports only 2 pre-existing unrelated inference quirks in `config/io.ts` + `secrets/config-io.ts`; the real tsdown/rolldown build already builds clean per this doc's Result summary). Vitest transforming+executing the refactored source (11 passing tests) is the compile proof.

### Category-A artifacts — how to run them cleanly

The 22 isolation-artifact tests fall into two isolation styles:

- **Helper-based** (`plugin-state-store*`, `skills/workshop/service`, `openclaw-state-db.test`): now robust after the `62e4373` helper fix.
- **Manual-env** (`pairing-store`, `delivery-queue.storage`, `crestodian/operations`, `acp/session-meta`, `commitments/*`, `media/local-roots`, `workspace-run`, `channel-setup.status`, `status.update`, `doctor-skills`, `failover-error`, `session-files`, `audit-hooks-routing`, `status-plugin-health`, `state-db.test` cron subtest): these do `{...process.env, OPENCLAW_STATE_DIR}` or `vi.stubEnv("OPENCLAW_STATE_DIR", …)` and rely on the _runner's_ env being clean of `SYBILCLAW_*`.

**Required harness** for a clean local run of the manual-env set (the upstream container / CI harness already satisfies this — it does not export SybilClaw production vars):

```bash
env -i PATH="$PATH" HOME=/tmp/sc-home LANG=en_US.UTF-8 \
    OPENCLAW_STATE_DIR=/tmp/sc-iso OPENCLAW_CONFIG_DIR=/tmp/sc-iso \
    npx vitest run <files>
```

The proper harness for the whole set is the **upstream Dockerfile container test** (REBASE-TEST-PLAN-2026-08-21.md, Layers 1–3): it never inherits this box's `SYBILCLAW_*`/`OPENCLAW_*` production exports, so the isolation artifacts don't occur there.

### For Rich's judgment (NOT changed here)

1. **Env-var precedence (`SYBILCLAW_STATE_DIR` > `OPENCLAW_STATE_DIR`) vs manual-env tests.** I did **not** change the source precedence — that's a SybilClaw feature decision. In production it's harmless (the launcher sets both to the same path). It only bites tests that isolate via `OPENCLAW_STATE_DIR` alone while a `SYBILCLAW_STATE_DIR` is ambiently exported. Options if you want belt-and-suspenders robustness (any of these is optional, none required to ship the rebase):
   - (a) Leave as-is; run the full suite in the container harness / a shell without `SYBILCLAW_*` exported (already the norm in CI). ← my recommendation.
   - (b) Extend the fix to the manual-env tests too (add `SYBILCLAW_STATE_DIR` next to each `OPENCLAW_STATE_DIR` stub). ~15 small test edits; test-only.
   - (c) Have `vitest`'s global setup clear `SYBILCLAW_*` unless a test opts in. Cleanest single choke-point; test-infra only.
2. **`openclaw-state-db.permissions.test.ts` EPERM subtest** fails on clean `v2026.6.34` on this macOS box (pre-existing upstream flake on this FS). Not our problem to fix in the rebase, but worth knowing it will show red locally on macOS; it should pass in the Linux container harness.

### What I did NOT do (per task scope)

Container smoke test, memory-leak soak, push, and cutover are separate steps — not touched. Production tree still frozen on v2026.6.17; rollback anchors intact.
