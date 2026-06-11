# SybilClaw Rebase Conflicts — 2026-06-11

**Rebase target:** `v2026.5.27`
**Strategy:** Manual re-apply of SybilClaw features onto clean v2026.5.27 base (not git rebase)

---

## Why manual re-apply instead of git rebase

The 97 SybilClaw-unique commits sit atop a divergence point 21,160 commits behind upstream.
Individual cherry-picks produced cascading conflicts because:

1. `src/agents/agent-scope.ts` was massively refactored upstream — many functions moved to `agent-scope-config.ts`
2. `src/agents/pi-embedded-runner/run/attempt.ts` gained `contextTokenBudgetForGuard`, `midTurnPrecheck`, and other features that shifted the code around our compaction ownership changes
3. Path/config files changed enough that mechanical replacements were cleaner than conflict resolution

**Decision:** Start from clean `v2026.5.27`, apply functional changes as clean patches.

---

## Conflicts encountered and resolutions

### 1. `src/agents/agent-scope.ts` — cherry-pick of `5bdb001ea4` (memoryFile)

**Type:** Massive structural divergence — upstream refactored most functions into `agent-scope-config.ts`
**Resolution:** Abandoned cherry-pick. Applied `memoryFile` and `memoryAllowedPaths` directly to the new upstream structure:
- Added fields to `ResolvedAgentConfig` type in `agent-scope-config.ts`
- Wired through `resolveAgentConfig()` in the same file
- Modified `loadWorkspaceBootstrapFiles()` in `workspace.ts` to accept optional params
- Modified `getOrLoadBootstrapFiles()` in `bootstrap-cache.ts` to pass params through
- Modified `resolveBootstrapFilesForRun()` in `bootstrap-files.ts` to resolve agent config and pass memoryFile/memoryAllowedPaths
**Outcome:** Clean, well-structured addition that follows upstream conventions.

### 2. `src/agents/pi-embedded-runner/run/attempt.ts` — cherry-pick of `4babd563d5f` (per-session compaction)

**Type:** 3 conflict regions due to upstream evolution of the compaction and precheck infrastructure
**Resolution:** Took upstream code (`--ours`) and manually inserted the per-session `ownsCompactionForSession` resolution block before the static `ownsCompaction` check. Kept upstream's `contextTokenBudgetForGuard`, `midTurnPrecheck`, and composite `removeToolResultContextGuard` pattern.
**Outcome:** Clean. The per-session resolution block runs before the branching if/else, and `attemptOwnsCompaction` replaces the static `activeContextEngine?.info.ownsCompaction === true` check.

### 3. `src/context-engine/types.ts` — cherry-pick of `4babd563d5f`

**Type:** No conflict — applied cleanly.

### 4. `src/config/paths.ts` — rebrand changes

**Type:** Not a cherry-pick conflict; manual modification.
**Details:** Updated state dir, config filename, and env var references to use SYBILCLAW_* with OPENCLAW_* fallbacks. Added `.openclaw` to `LEGACY_STATE_DIRNAMES` and `openclaw.json` to `LEGACY_CONFIG_FILENAMES` for backward compatibility.

### 5. `src/config/paths.test.ts` — test expectations

**Type:** 4 test failures due to rebrand changing expected config filename from `openclaw.json` to `sybilclaw.json`.
**Resolution:** Updated test expectations to match new canonical filenames and added the full expanded candidate list.

### 6. `src/gateway/server-methods/chat.abort-persistence.test.ts` — test mock

**Type:** 1 test failure due to missing `debug` method on `logGateway` mock.
**Resolution:** Added `debug: vi.fn()` to the mock.

---

## Features NOT re-applied (deferred)

| Feature | Commits | Reason |
|---------|---------|--------|
| `/skills enable\|disable\|reset` commands | 925be39, 673a044 | Upstream has native skill management; custom commands need re-evaluation against v5.27 skill infrastructure |
| Per-agent skill filtering (Phase 1) | 405ba8ee | Upstream `v5.27` already has `resolveEffectiveAgentSkillFilter` in `agent-filter.ts` — our implementation is essentially identical |
| Release version bumps | 7aa16ec, 385ef2c, 485eea6, 1964a04 | Superseded by new `2026.6.1` version |
| Security backport changelog entries | c2fe33a, f099022, d256603, c9a01cb | Superseded; security fixes are now in the baseline |
| CI workflow rebrand details | Multiple | Needs separate pass for GitHub Actions workflow updates |
| Migration scripts | 4e6f71384e, 0dc3ca3631 | Existing SybilClaw users already migrated; not needed for fresh rebase |

---

## Summary

| Metric | Value |
|--------|-------|
| Total SybilClaw commits analyzed | 97 |
| Commits re-applied (via manual patches) | 4 logical patches covering ~51 commits' functionality |
| Cherry-pick conflicts resolved | 2 (agent-scope refactor + attempt.ts structure change) |
| Test failures fixed | 5 (4 path expectations + 1 missing mock method) |
| Features deferred for follow-up | 6 categories (see above) |
