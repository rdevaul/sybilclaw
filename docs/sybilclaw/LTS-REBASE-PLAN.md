# SybilClaw LTS Rebase Plan

**Author:** Jarvis + Rich DeVaul
**Created:** 2026-05-30
**Status:** Standing plan — executes when upstream OpenClaw tags an LTS release (none exists yet as of 2026-05-30; verified against upstream tags + release announcements).
**Supersedes (for the deferred items):** the per-commit backport approach in `SECURITY-BACKPORT-PLAN-2026-05-30.md` for everything except the one fix already landed.
**Governing policy:** `docs/sybilclaw/stability-policy.md` §"LTS rebase plan".

---

## Why this plan exists / what we learned 2026-05-30

We attempted to backport the missing high-severity security fixes onto our `2026.5.12` baseline as per-commit cherry-picks (Batch A). **Result: 1 of 9 landed cleanly; 8 deferred.** The deferrals were not laziness — they were correct application of policy. The finding:

> **8 of 9 high-severity security fixes are entangled with intervening upstream refactors** (commits that landed between our `5.12` baseline and the patched releases `5.18`/`5.20`/`5.22`/`5.26`). Cherry-picking them onto `5.12` cleanly would require either taking whole upstream files or first backporting their prerequisite commits — i.e. exactly the 4×–71× bloat-ratio explosion the May-9-2026 scar taught us to avoid.

Three of the deferred fixes (`qjpc`, `hw9r`, `q99w`, plus the already-RE-IMPLEMENT `chr9`) land in the gateway **auth/connect-policy surface** — `handshake-auth-helpers.ts`, `connect-policy.ts`, `message-handler.ts` — which is precisely where our fork carries hand-rolled security backports (`#75781` scoped no-auth local backend bypass, `requireGatewayClientScopeForInternalChannel`). Re-implementing those by hand against `5.12` means hand-writing security-critical auth code in the exact zone where a mistake re-opens a vulnerability. **High effort, high risk, low confidence.**

**Conclusion:** the deferred fixes should NOT be hand-ported one-by-one. They come along for free when we rebase onto a clean upstream LTS tag that already contains them, and our SybilClaw customizations re-apply as a curated stack on top. We trade "8 risky hand re-implementations" for "one well-planned rebase."

This document is the standing plan for that rebase, ready to execute when LTS lands.

---

## Trigger condition

Execute this plan when **upstream OpenClaw publishes an LTS-designated release** — a tag or release explicitly marked LTS (not a normal `vX.Y.Z` or beta/alpha). Monitor via:

- `git fetch upstream --tags` then `git tag -l "*lts*"` (case-insensitive)
- upstream release notes / announcements for LTS designation

As of 2026-05-30 there is no LTS tag. Latest stable is `v2026.5.27`; betas through `v2026.5.28-beta.4`; `v2026.5.29-alpha.1` exists. None marked LTS. The external monitor's claim that "upstream is preparing LTS" is unconfirmed — treat as a watch item, not a commitment.

**Interim posture (until LTS):** SybilClaw stays at the `2026.5.12` baseline + the curated security stack. Our threat model (single trusted operator, LAN-only gateway behind MatterNet, no untrusted gateway access) makes the deferred advisories low practical risk. We landed the one CLEAN fix (browser `act` SSRF guard, GHSA-2hfg) and we hold the rest for LTS.

---

## What our fork carries (the curated stack that must re-apply)

These are the SybilClaw-specific commits that must survive any rebase. As of `225d15fc59` there are ~97 commits of divergence across 153 files. The load-bearing categories:

1. **Rebrand** — `.openclaw`→`.sybilclaw` paths, owl logo, README/docs positioning, `openclaw`→`sybilclaw` CLI alias + shim. Touches: `src/config/paths.ts`, `src/daemon/paths.ts`, `src/infra/home-dir.ts`, `src/infra/openclaw-root.ts`, `src/cli/*`, packaging.
2. **Multi-user / per-agent identity** — per-user agent identity, `memory/personal/<name>/` isolation, per-user `memoryFile`. Touches: `src/agents/agent-scope.ts`, workspace/bootstrap paths, config schema.
3. **Hand-rolled security backports** — the riskiest to re-apply because LTS will already contain the upstream versions:
   - `#75781` scoped no-auth local backend bypass (`handshake-auth-helpers.ts` — `shouldSkipLocalBackendSelfPairing`). **This is the one that collides with chr9/qjpc.** On rebase, verify the LTS upstream auth model and re-express our no-auth-local-backend intent against it, rather than reapplying our hunk blindly.
   - `#47487`/`#75055` implicit tool grants (`pi-tools.policy.ts`)
   - `#75230` payment-credential redaction (`redact.ts`)
   - root guards (`root-guard.ts`, legacy entrypoints)
   - dependency overrides (ip-address, uuid)
   - dotenv injection blocks (`dotenv.ts`)
   - trusted-proxy fail-closed (`server-request-context` area)
4. **Tier-2 stability backports** — Telegram polling liveness/outbound cap, Slack reconnect policy, Ollama streaming-usage compat.
5. **Pane-bus / agent-attachments / context-graph integration shape** — the SybilClaw-specific runtime surfaces.
6. **The 2hfg browser-act SSRF fix** (Batch A, on branch `chore/upstream-tier1-security-2026-05`) — if not yet merged to main when LTS rebase happens, it's redundant (LTS contains it) and can be dropped.
7. **Local debug stub** — `stash@{0}` rich-attach-parse-debug (NOT a commit; drop or re-apply as needed).

**Many of the category-3 hand-backports become REDUNDANT after the rebase** (LTS already has the upstream fix). The rebase is the moment to shed them — re-apply only the SybilClaw-unique intent (no-auth-local-backend feature), not our copies of upstream security fixes.

---

## Rebase procedure (per stability-policy.md §LTS, expanded)

### Phase 0 — Pre-rebase prep (can start before LTS, refine when tag lands)

1. **Merge or drop the Batch A branch.** Decide whether `chore/upstream-tier1-security-2026-05` (the 2hfg fix) lands on main first (clean win now) or is dropped as redundant-at-rebase. Recommendation: **merge it now** — it's a verified standalone fix and gives us the SSRF protection in the interim.
2. **Inventory the curated stack.** Produce a definitive list of which of our 97 commits are (a) SybilClaw-unique (must re-apply), (b) copies of upstream security fixes (drop — LTS has them), (c) tier-2 stability (check if LTS has them; drop if so). This is the single most important pre-work item — it determines what we re-apply by hand.
3. **Snapshot known-good config + state** so we can validate behavior parity post-rebase: current `openclaw.json` shape, the multi-user setup, the contextgraph wiring.

### Phase 1 — Branch and rebase

1. `git fetch upstream --tags`.
2. `git branch legacy/2026.5.12 main` — preserve the current line so existing deployments keep getting security backports without forced upgrade (per policy).
3. `git tag archive/main-pre-lts-rebase-<date>` on current main (mirrors the `archive/main-pre-reset-2026-05-09` precedent).
4. Create `rebase/lts-<version>` from the LTS tag.
5. Re-apply the SybilClaw-unique commits (category 1, 2, 5, the no-auth-local-backend _intent_ from 3, and 4 if LTS lacks them) as a curated stack — cherry-pick where clean, re-implement where the LTS structure differs. **Use the bloat-ratio discipline per pick.**
6. For the category-3 security hand-backports: **do NOT reapply our copies.** Verify LTS contains the equivalent fix (it should — that's the whole point), and only carry forward the SybilClaw-unique deviation if any.

### Phase 2 — Validate

1. `pnpm build` clean.
2. Targeted test suites for every surface we re-applied to, especially the auth cluster (`gateway` auth/connect-policy/device-pairing tests) — this is where the chr9/qjpc/q99w/hw9r/no-auth-backend reconciliation lives. Confirm: spoofed locality rejected, our no-auth-local-backend still works, revoked-token race closed, admin-scope gate enforced.
3. Behavior parity check against the Phase-0 snapshot: multi-user identity, contextgraph, pane-bus, the Telegram/Slack stability fixes.
4. Run the full pre-commit hook clean (and fold in the RED-FLAGS option-3 hook-scoping fix so pre-existing upstream lint quirks don't block — see `RED-FLAGS-INVESTIGATION-2026-05-30.md`).

### Phase 3 — Cut over

1. Bump the SybilClaw **major** version on the rebase (per policy — makes the discontinuity obvious in `npm` / `--version`).
2. Consolidated CHANGELOG entry: what the rebase brought (all the deferred GHSAs now resolved via LTS), what we re-applied, breaking changes if any.
3. Open tracking issue ≥30 days before cutover if operators (the DML team) need lead time. For our single-deployment case this is lighter, but document the discontinuity.
4. Keep `legacy/2026.5.12` alive for security backports until all deployments move.

---

## The deferred security items — disposition

All resolved by the LTS rebase (LTS contains the upstream fixes). Listed here so we can confirm each is actually present post-rebase:

| GHSA                      | CVSS  | Patched upstream in | Disposition                                                                 |
| ------------------------- | ----- | ------------------- | --------------------------------------------------------------------------- |
| GHSA-hw9r-h9mr-4jff       | 8.8   | 2026.5.18           | via LTS rebase; verify admin-scope gate                                     |
| GHSA-qjpc-qf9m-xwmr       | 8.8   | 2026.5.18           | via LTS rebase; verify Control-UI pairing                                   |
| GHSA-q99w-vh6v-q3v7       | 8.8   | 2026.5.26           | via LTS rebase; verify revoked-token race closed                            |
| GHSA-chr9-m4q2-76hw       | 8.0   | 2026.5.22           | via LTS rebase; verify locality-spoof rejected + our no-auth backend intact |
| GHSA-6fvr-66p3-3qj4       | 8.4   | 2026.5.20           | via LTS rebase                                                              |
| GHSA-xww8-gqvh-92x9       | 8.0   | 2026.5.18           | via LTS rebase                                                              |
| GHSA-mgq6-vr84-7m2j       | 8.0   | 2026.5.18           | via LTS rebase                                                              |
| GHSA-3c6j-hq33-3jv4       | 7.2   | 2026.5.18           | via LTS rebase                                                              |
| GHSA-mhq8-78pj-5j79       | 7.1   | 2026.5.18           | via LTS rebase                                                              |
| **GHSA-2hfg-4fh4-qp7f**   | 7.7   | 2026.5.18           | **ALREADY DONE** (Batch A branch, ready to merge to main now)               |
| + 9 medium-sev advisories | 4–6.x | various             | via LTS rebase                                                              |

**memory-wiki (GHSA-p2fh-f5fc-44hr):** does NOT affect our baseline (vulnerable range `<= 5.6`, we're at `5.12`). No action ever needed. (External monitor was wrong about this.)

---

## Interim monitoring (until LTS)

- Keep GLaDOS's upstream monitor running, but **treat its CVSS/version/urgency claims as leads to verify**, not facts — the 2026-05-29 report had ≥4 material errors (wrong patch versions for hw9r/6fvr, a non-applicable advisory flagged as critical, a fabricated LTS-imminent urgency). Verify against the repo advisory API (`GET /repos/openclaw/openclaw/security-advisories`).
- If a NEW advisory lands that (a) affects our `5.12` baseline AND (b) is CLEAN to cherry-pick (touches no diverged file, no prereq refactor) AND (c) is high-severity — backport it individually per Tier-1 process, same as 2hfg. Don't wait for LTS for genuinely-clean high-sev picks.
- If an advisory affecting us is exploitable WITHOUT prior gateway access (changes our threat model) — escalate immediately regardless of merge difficulty.

---

## TL;DR for Rich

- The per-commit backport path is a dead end for 8 of 9 fixes — they're refactor-entangled and the auth ones collide with our own backports. Confirmed empirically today.
- Land the one clean fix (2hfg) now; hold the rest for the LTS rebase.
- Our threat model makes the interim exposure low.
- This doc is the standing rebase plan; it triggers when upstream tags LTS (not yet). Phase 0 inventory work can start anytime.
- Red flags from the batch run were both false alarms (wrong test config; upstream lint quirk). No fixes needed. See `RED-FLAGS-INVESTIGATION-2026-05-30.md`.
