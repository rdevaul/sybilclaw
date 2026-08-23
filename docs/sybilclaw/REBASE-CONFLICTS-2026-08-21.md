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
