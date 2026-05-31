# SybilClaw Security Backport Plan — 2026-05-30

**Status:** RESEARCH / PLANNING ONLY. No code changed, no git state mutated.
**Author:** Jarvis (research sub-agent), for review by Rich DeVaul before any Phase A execution.
**Repo:** `~/Projects/sybilclaw` — fork HEAD `225d15fc59`, version `2026.5.12`.
**Baseline:** upstream tag `v2026.5.12` + 2 SybilClaw CI commits.
**Upstream:** `upstream/main` HEAD `d649548a7a`; latest stable tag `v2026.5.27`; betas through `v2026.5.28-beta.4`; also `v2026.5.29-alpha.1` now present.
**Governing policy:** `docs/sybilclaw/stability-policy.md` (Tier 1 per-commit cherry-pick, hunk-level only, bloat ratio ≈ 1.0).

---

## TL;DR

- **Authoritative source used:** the GitHub _repo_ security-advisory API (`GET /repos/openclaw/openclaw/security-advisories`) returns all **100 published advisories** with CVSS, severity, vulnerable-version-range, and patched-version. The global `github.com/advisories/<id>` pages 404 (these are repo-scoped advisories), and the human advisory pages are JS-rendered + carry no machine-readable CVSS — so the API is the ground truth and I used it.
- **19 advisories actually affect our `2026.5.12` baseline** (their fix landed _after_ 5.12). Of these: **10 high-severity (CVSS 7.1–8.8)** and **9 medium**.
- **The external monitoring report was partly wrong** (details in §0). Most notably **GHSA-p2fh-f5fc-44hr (memory-wiki) does NOT affect us** and is already patched (the report claimed it was unpatched and outstanding).
- **8 of the 10 high-sev fixes are CLEAN** (touch only files we have _not_ diverged on; the sole conflict is `CHANGELOG.md`, which we resolve by writing our own consolidated section per policy).
- **The RE-IMPLEMENT risks are concentrated in 4 hand-diverged security files**: `redact.ts`, `pi-tools.policy.ts`, `handshake-auth-helpers.ts`, and the exec-approval cluster. These are flagged loudly in §2.
- **Recommendation (§4):** do the Tier-1 CLEAN/CONFLICT batch _now_ against our current baseline. **Do not chase .27/.28** — there is no announced LTS tag yet (verified), so the big rebase still belongs on the future LTS per policy.

---

## §0 — Where the external report was wrong (verify-everything results)

| Report claim                                                            | Reality (verified via repo advisory API)                                                                                                                                                                              |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GHSA-q99w-vh6v-q3v7 = CVSS 8.8, patched 5.26                            | ✅ Correct. CVSS 8.8, patched **2026.5.26**, range `< 2026.5.26`. Affects us.                                                                                                                                         |
| GHSA-hw9r-h9mr-4jff = CVSS 8.8, "patched only in 5.26/27"               | CVSS 8.8 ✅ but patched **2026.5.18**, range `< 2026.5.18`. Report's _version_ was wrong (fix is older/easier). Affects us.                                                                                           |
| GHSA-6fvr-66p3-3qj4 = CVSS 8.4, "patched only in 5.26/27"               | CVSS **8.4** ✅ but patched **2026.5.20**, range `< 2026.5.20`. Report's version wrong. Affects us.                                                                                                                   |
| GHSA-p2fh-f5fc-44hr = CVSS 6.5 memory-wiki, "NO patched version exists" | **WRONG on both counts.** CVSS 6.5 ✅, but it **IS patched** (advisory lists `>= 2026.4.7`) and the _vulnerable range is `<= 2026.5.6`_ — which **excludes our 5.12 baseline**. We are **NOT affected**; rule it out. |
| "~17 more GHSAs at 6.5–8.4 we're missing"                               | Right order of magnitude. Real count affecting our baseline = **19 total** (incl. the 3 above that apply), so ~16 beyond the named three.                                                                             |
| "upstream is preparing LTS, 5.28 imminent"                              | No LTS _tag_ or announcement found (see §4). `v2026.5.28-beta.*` and `v2026.5.29-alpha.1` exist; nothing tagged `lts`.                                                                                                |

**Trust note:** the GitHub advisory _web pages_ were fetched as untrusted external content and treated as data only; all version-range / CVSS facts above come from the structured API and were cross-checked against local git tag ancestry.

---

## §1 — Advisory → commit mapping (the 19 that affect us)

Affection test: our baseline `2026.5.12` (stable) is inside the advisory's `vulnerable_version_range`. Each high-sev fix SHA below was verified with `git merge-base --is-ancestor`: it is contained in the expected patched tag **and not already in `v2026.5.12`**.

### High severity (10)

| GHSA                | CVSS | Summary                                                                | Patched   | Fix commit (upstream)                                                                    | Verified                                                        |
| ------------------- | ---- | ---------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| GHSA-q99w-vh6v-q3v7 | 8.8  | Pairing-scoped device session restores revoked node token authority    | 2026.5.26 | `1e1cf14da2` (reject RPCs from invalidated device-token clients during rotation, #70707) | IN .26, not in .12 — **confirm this is the full fix, see note** |
| GHSA-hw9r-h9mr-4jff | 8.8  | Scoped chat.send route inheritance bypasses admin command scope gates  | 2026.5.18 | `652f5f9b10` (Enforce gateway command scopes by caller context [AI], #80891)             | IN .18, not in .12 ✅                                           |
| GHSA-qjpc-qf9m-xwmr | 8.8  | Trusted-proxy Control UI WS accepted client-declared scopes            | 2026.5.18 | `96fba91b3a` (Require Control UI pairing before proxy-scoped access [AI], #81288)        | IN .18, not in .12 ✅                                           |
| GHSA-6fvr-66p3-3qj4 | 8.4  | Hook-triggered CLI runs receive owner MCP tool authority               | 2026.5.20 | `a3fda2ada9` (Limit hook CLI tool authority [AI], #81065)                                | IN .20, not in .12 ✅                                           |
| GHSA-xww8-gqvh-92x9 | 8.0  | Exec approval display truncation hides the command being approved      | 2026.5.18 | `731af9c96b` (Reject truncated exec approval commands [AI], #81001)                      | IN .18, not in .12 ✅                                           |
| GHSA-chr9-m4q2-76hw | 8.0  | Control UI locality spoofing mints a durable admin device token        | 2026.5.22 | **NOT confidently pinned** — see note                                                    | range `< 2026.5.22`, affects us                                 |
| GHSA-mgq6-vr84-7m2j | 8.0  | QQBot native approval buttons don't enforce configured approver        | 2026.5.18 | `6e498a1f62` (fix(qqbot): authorize approval button callbacks [AI], #80892)              | IN .18, not in .12 ✅                                           |
| GHSA-2hfg-4fh4-qp7f | 7.7  | Browser act interactions bypass private-network navigation checks      | 2026.5.18 | `3d93174c43` (browser: enforce navigation checks for act interactions [AI], #81070)      | IN .18, not in .12 ✅                                           |
| GHSA-3c6j-hq33-3jv4 | 7.2  | Paired nodes forge exec lifecycle events without system.run provenance | 2026.5.18 | `17fa101c16` (Validate node exec event provenance [AI], #81071)                          | IN .18, not in .12 ✅                                           |
| GHSA-mhq8-78pj-5j79 | 7.1  | POSIX node system.run safe-bin allowlist widened by shell expansion    | 2026.5.18 | `9ac4272b35` (fix: harden safe-bin argument validation [AI], #80999)                     | IN .18, not in .12 ✅                                           |

**Notes on the two soft mappings:**

- **q99w (`1e1cf14da2`)** — commit message is "reject RPCs from invalidated device-token clients during rotation" and it is referenced in the upstream 5.26 CHANGELOG content-boundaries bullet. It is the strongest candidate and is in the right tag, but the advisory specifically describes a _surviving pairing-scoped session re-establishing authority_. Before picking, confirm against the advisory's linked PR (advisory `references` came back empty via API; the human advisory page should list the PR). There may be a sibling commit.
- **chr9** — I could not pin a single fix commit in the `.18..22` window via path/keyword search (the security commits use AI-generated messages that don't keyword-match "locality spoofing / durable admin device token"). **Flagged for manual PR-link lookup before execution.** It is a real CVSS 8.0 that affects us; do not drop it, just don't guess the SHA.

### Medium severity (9)

These affect the baseline but the exact fix SHAs are **not confidently pinned** — upstream's medium-sev security commits carry AI-generated messages that don't keyword-match the advisory summaries, and several cluster behind the same exec-allowlist PRs. The _domain_ (which determines merge difficulty) is what matters for planning; SHAs to be resolved from each advisory's PR link during execution.

| GHSA                | CVSS  | Summary                                                               | Patched   | Domain / file zone                                                                   |
| ------------------- | ----- | --------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| GHSA-ccwh-wwpp-6wg5 | (med) | Host env sanitizer missed two Node.js control vars                    | 2026.5.26 | dotenv / host-env sanitizer                                                          |
| GHSA-cwpp-5962-q4f6 | (med) | Exec allowlist misses side effects from transparent command wrapper   | 2026.5.26 | exec allowlist / command analysis                                                    |
| GHSA-gxg4-2rrr-jhc7 | (med) | Hostname checks treat trailing-dot hosts inconsistently               | 2026.5.26 | SSRF / hostname policy                                                               |
| GHSA-q7q8-3mgw-q67r | (med) | Message read actions skip channel allowlist checks                    | 2026.5.19 | channel read allowlist (`#84982` is a candidate)                                     |
| GHSA-2j8v-hwgc-x698 | (med) | Shell wrapper argv changes between approval and execution             | 2026.5.18 | exec approval revalidation (`Recheck rebuilt system.run argv [AI] #84090` candidate) |
| GHSA-v6r2-jh58-xx6w | (med) | Marketplace runtime extension metadata points at unscanned payload    | 2026.5.18 | clawhub/marketplace plugin scan                                                      |
| GHSA-rggc-m335-3wvj | (med) | Same-host trusted-proxy accepts local forged identity                 | 2026.5.18 | gateway trusted-proxy auth                                                           |
| GHSA-83w9-h5wv-j9xm | (med) | Node pairing reconnection confuses approval scope state               | 2026.5.27 | pairing / approval scope                                                             |
| GHSA-8wg3-5mcm-fjq8 | (med) | Workspace .env overrides Homebrew executable selection for skill exec | 2026.5.27 | dotenv / brew resolution                                                             |

---

## §2 — Per-fix merge-difficulty classification

**Method:** for each fix commit I listed the touched files (`git show --stat`) and intersected with our 153-file divergence set (84 of which are `src/`). I did **NOT** test-apply any cherry-pick (READ-ONLY guarantee honored — `git status` clean, stash untouched). Classification is static: file-overlap + per-file divergence-line-count + upstream-refactor exposure.

**Bloat-ratio context:** our hand divergence on the _security-critical_ files is small except for the four hot files below. exec-approvals.ts = **6 changed lines** (just the `.openclaw`→`.sybilclaw` path rename); handshake-auth-helpers.ts = **18**; redact.ts = **48** (our backported #75230 lives here); pi-tools.policy.ts = **49** (our #47487/#75055 backports live here).

### CLEAN (source untouched by our divergence; only CHANGELOG conflicts → expected, ratio ≈ 1.0)

| GHSA | Fix          | Touched files (excl. CHANGELOG)                                                                | Overlap                                                                                                                        |
| ---- | ------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| hw9r | `652f5f9b10` | `auto-reply/reply/command-gates, commands-{acp,allowlist,approve,config,mcp,plugins}` (+tests) | none (our diverged auto-reply files are `commands-{handlers.runtime,skills}` + `commands-registry.shared` — _different files_) |
| qjpc | `96fba91b3a` | 4 gateway/pairing source files                                                                 | none                                                                                                                           |
| 6fvr | `a3fda2ada9` | 4 CLI/hook-runner source files                                                                 | none (tiny ~45-line patch)                                                                                                     |
| xww8 | `731af9c96b` | `gateway/server-methods/exec-approval.ts`, `infra/exec-approval-command-display.ts` (+test)    | none — note these are _exec-approval display_ files, NOT our diverged `infra/exec-approvals.ts`                                |
| mgq6 | `6e498a1f62` | `extensions/qqbot/*` only                                                                      | none                                                                                                                           |
| 2hfg | `3d93174c43` | `extensions/*/browser/pw-tools-core*` only                                                     | none                                                                                                                           |
| 3c6j | `17fa101c16` | node exec provenance (12 files, none ours)                                                     | none                                                                                                                           |
| mhq8 | `9ac4272b35` | safe-bin arg validation (8 files, none ours)                                                   | none                                                                                                                           |

→ **8 of 10 high-sev fixes are CLEAN.** Expect a CHANGELOG.md conflict on every pick; that is normal and resolved by adding to our consolidated "Tier 1 — Security Backports (May 2026)" section, NOT by taking upstream's CHANGELOG.

### CONFLICT (hunk-level) — touches a file we diverged on, but security hunk likely doesn't overlap our change

| GHSA        | Fix                    | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Risk    |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| q99w        | `1e1cf14da2`           | Touches `gateway/server/ws-connection/message-handler.ts` and `server-request-context.ts`. We diverged on the sibling `handshake-auth-helpers.ts` (18 lines) but **not** `message-handler.ts` per the divergence set. Likely CLEAN on the source files, CHANGELOG-only conflict. Promoted to CONFLICT only because the **q99w SHA mapping itself is unconfirmed** (see §1 note) and the pairing/device-token area is where our handshake divergence lives. **Verify SHA + re-classify before picking.** | Low-med |
| 2j8v / cwpp | exec-allowlist cluster | Touches exec command-analysis path. Our `exec-approvals.ts` divergence is a 6-line path-string rename — extremely unlikely to overlap allowlist _logic_ hunks. Resolve at hunk level.                                                                                                                                                                                                                                                                                                                   | Low     |
| ccwh / 8wg3 | dotenv host-env        | Touches `infra/dotenv.ts` (we diverged). Upstream added one fix commit (`85277c2db1`) post-baseline; our divergence is the `.sybilclaw` rebrand + prior dotenv backports. Hunk-level conflict expected, resolvable.                                                                                                                                                                                                                                                                                     | Med     |

### RE-IMPLEMENT (loudly flagged — needs real engineering, NOT a cherry-pick)

These are the ones Rich expected. Each either lands in a file we've hand-rolled a security backport into, or sits behind an intervening upstream refactor.

1. **Any further `redact.ts` fix** (e.g. upstream `39bcd1e088 scan installed dependency runtime code [AI]`, `17ceca86d6 Redact persisted secret-shaped payloads [AI]`). Our `redact.ts` is **48 lines diverged** because we hand-backported the payment-credential redaction (#75230, our commit `c74f23cd44`). A naive cherry-pick of a newer redact fix will collide with our hand-rolled hunks. **Re-implement the _intent_ on top of our version**, verify our payment-cred regression test still passes. _(None of the 19 in-scope advisories is specifically a redact.ts advisory, but if execution surfaces one in the medium tail, it lands here.)_

2. **Any `pi-tools.policy.ts` fix** (e.g. `6c918ca85f Inherit tool restrictions for delegated sessions [AI] #80979`). Our file is **49 lines diverged** — we backported #47487/#75055 (stop implicit tool grants) here via `0473b61dfe`. Plus there's an intervening upstream refactor `bb46b79d3c internalize OpenClaw agent runtime (#85341)` that moved structure. A delegated-session tool-restriction fix would need **manual re-implementation** against our policy shape. Flag if any medium advisory maps here.

3. **qjpc / chr9 / q99w in the `handshake-auth-helpers.ts` zone.** We diverged 18 lines there, and upstream has **9 commits** churning this file since 5.12 (`386d321634`, `10cb0a5ec0`, `af42260440`, `96fba91b3a`, …). The _named_ fixes (qjpc=`96fba91b3a`, q99w=`1e1cf14da2`) happen to touch _adjacent_ files and look CLEAN — **but if the confirmed PR for chr9 (durable admin token mint) lands in `handshake-auth-helpers.ts` itself, treat it as RE-IMPLEMENT**, because cherry-picking onto our 18-line-diverged handshake auth risks a subtle auth regression. This is exactly the "auth-failure-closed" surface where the May-2026 scar happened.

4. **The SQLite-runtime-state refactor exposure on the exec cluster.** Upstream did `f91de52f0d move runtime state to SQLite` then `694ca50e97 Revert` it. The net is back to file-state, so _today's_ `exec-approvals.ts` is structurally close to ours — **but any exec fix that landed _between_ the move and the revert** carries the SQLite plumbing and must be hunk-stripped, or it will balloon the bloat ratio (this is the 4×–71× failure mode). Check each exec-allowlist pick for SQLite imports before committing; if present → RE-IMPLEMENT the logic, don't take the refactor.

---

## §3 — Recommended execution batches

### Batch A — `chore/upstream-tier1-security-2026-05` (CLEAN high-sev, one PR, per-commit)

Per-commit cherry-pick, in upstream chronological order, hunk-level CHANGELOG resolution only, bloat-ratio check after each:

1. `652f5f9b10` — hw9r (chat.send scope gate)
2. `96fba91b3a` — qjpc (Control UI pairing before proxy-scoped access)
3. `731af9c96b` — xww8 (reject truncated exec approval commands)
4. `6e498a1f62` — mgq6 (qqbot approval button auth)
5. `3d93174c43` — 2hfg (browser act navigation checks)
6. `17fa101c16` — 3c6j (node exec event provenance)
7. `9ac4272b35` — mhq8 (safe-bin arg validation)
8. `a3fda2ada9` — 6fvr (limit hook CLI tool authority)

After each pick: `ratio = our-inserted-lines / upstream-inserted-lines`; abort+redo any pick > 2.0. Consolidate all 8 into one CHANGELOG "SybilClaw Tier 1 — Security Backports (May 2026, batch 2)" section with upstream attribution + GHSA IDs. One human-reviewed PR.

**Note:** dropped `dc2c3a4920` (a tempting "harden WS pairing locality" hit) — it's already in our 5.12 baseline. Do not re-pick.

### Batch B — verify-then-pick (do NOT include in Batch A until SHAs confirmed)

- **q99w (`1e1cf14da2`)** — confirm SHA against the advisory PR; if confirmed and source-CLEAN, fold into Batch A as item 9, else own follow-up PR.
- **chr9** — find the fix PR from the advisory page; classify (likely CONFLICT or RE-IMPLEMENT if it touches handshake-auth-helpers). Own follow-up PR.

### Batch C — medium-severity follow-up PR(s)

Resolve the 9 medium SHAs from their advisory PR links, then sort:

- exec-allowlist cluster (cwpp, 2j8v, ccwh, gxg4) → one PR, watch for SQLite-refactor bloat.
- dotenv cluster (ccwh, 8wg3) → hunk-level onto our diverged `dotenv.ts`.
- channel/pairing (q7q8, rggc, 83w9, v6r2) → likely CLEAN, own PR.

### RE-IMPLEMENT work-items (separate, each its own PR, real engineering)

- **WI-1:** Re-implement any redact.ts security fix on top of our payment-cred backport; keep our regression test green.
- **WI-2:** Re-implement any pi-tools.policy.ts delegated-session restriction against our #47487/#75055 shape, accounting for the `internalize agent runtime` refactor.
- **WI-3:** If chr9's confirmed fix touches `handshake-auth-helpers.ts`, re-implement the locality/device-token-mint hardening by hand (fail-closed), not via cherry-pick.

---

## §4 — Strategic recommendation: LTS timing

**Verified:** no upstream LTS _tag_ or announcement exists. Local tags top out at `v2026.5.27` (stable), `v2026.5.28-beta.4`, `v2026.5.29-alpha.1`. A `web_search` for "openclaw LTS release" surfaced no LTS designation; the policy doc's own "LTS rebase plan" is written in the future tense ("When the first LTS tag ships"). The external report's "preparing LTS / 5.28 imminent" is, at most, a beta cadence — **not** an LTS.

**Recommendation:**

1. **Do Batch A now**, against our current `2026.5.12` baseline. The 8 CLEAN high-sev fixes (CVSS 7.1–8.8) are exactly the Tier-1 "land within a week" obligation; they're low-risk (CHANGELOG-only conflicts) and shouldn't wait for any rebase.
2. **Do NOT chase `.27`/`.28`.** Per policy §"LTS rebase plan", the real re-baseline happens on the _LTS tag_, not on incremental stable releases. Chasing .27/.28 means absorbing 15 releases of feature churn + the SQLite-move/revert + the agent-runtime-internalize refactor — i.e. re-creating the exact 4×–71× bloat scar. The fork exists to _escape_ that coupling.
3. **Hold the RE-IMPLEMENT work-items and Batch C mediums for after Batch A.** None of the mediums is high-CVSS; they fit the Tier-1/Tier-2 "batch monthly" cadence. The RE-IMPLEMENT items are precisely the ones that should _not_ be rushed.
4. **Open the LTS tracking issue trigger now:** add a watch for an upstream tag matching `*lts*` or an LTS announcement. When it lands, that's when the `legacy/2026.5.x` branch + hard rebase happens (policy steps 1–5), and most of these RE-IMPLEMENT items dissolve because we re-apply our curated stack on top of a current tree.

**Bottom line:** Tier-1 security batch now (Batch A), confirm-then-pick q99w/chr9 (Batch B), medium + RE-IMPLEMENT as deliberate follow-ups, and wait for an actual LTS tag for the big rebase. Do not let the monitoring report's urgency push a .27/.28 chase that reintroduces the May-2026 bloat failure.

---

## Appendix — verification commands used (all read-only)

- Divergence set: `git diff --name-only $(git merge-base HEAD upstream/main) HEAD` (153 files, 84 src).
- Advisory data: `GET /repos/openclaw/openclaw/security-advisories?per_page=100&page={1..3}&state=published` (100 advisories; range/CVSS/patched parsed in `/tmp/filter2.py`).
- Affection test: baseline `2026.5.12` ∈ `vulnerable_version_range`.
- Commit containment: `git merge-base --is-ancestor <sha> <tag>` for each high-sev fix (all 8 CLEAN confirmed IN expected tag, NOT in v2026.5.12).
- File overlap: `git show --stat <sha>` ∩ divergence set.
- Per-file divergence size: `git diff <merge-base> HEAD -- <file> | grep -cE '^[+-]'`.
- `git status` clean and `git stash list` unchanged (`stash@{0}` rich-attach-parse-debug intact) before and after.

---

## §5 — Phase B follow-up: the two unconfirmed SHAs resolved (2026-05-30, jarvis-rich)

Chased both soft mappings to ground truth.

### q99w (GHSA-q99w-vh6v-q3v7, CVSS 8.8) — CONFIRMED **CLEAN**

- **Fix commit:** `1e1cf14da2` (#70707, "reject RPCs from invalidated device-token clients during rotation/revoke race"). Confirmed in v2026.5.26, not in v2026.5.24, not in our v2026.5.12.
- Commit body explicitly describes the rotate/revoke microtask race that lets an attacker land pipelined RPCs with a revoked token — this _is_ the advisory ("pairing-scoped device session could restore revoked node token authority"; device-token == the node/pairing credential).
- **Files touched:** `src/gateway/server-methods/devices.ts`, `server-request-context.ts`, `server/ws-connection/message-handler.ts`, `ws-types.ts`, `shared-types.ts` + tests. **NONE are in our 153-file divergence set.** Classification: **CLEAN** → add to Batch A.

### chr9 (GHSA-chr9-m4q2-76hw, CVSS 8.0) — reclassified **RE-IMPLEMENT** ⚠️

- This is NOT a single clean pick. The fix is a **cluster**:
  - `af42260440` (#81289, 2026-05-13, "Require explicit browser device pairing [AI]") — the hardening that defeats locality-spoofing auto-pair.
  - `10cb0a5ec0` (#85459, 2026-05-22, "Restore Control UI gateway token pairing [AI]") — re-enables loopback auto-pair _only with a valid gateway token_ (the balance fix).
  - Related: `96fba91b3a` (qjpc, in Batch A) shares the connect-policy surface.
- **Both cluster commits modify `src/gateway/server/ws-connection/handshake-auth-helpers.ts` — a file we have HAND-DIVERGED on.** Our divergence is the `#75781` "scoped no-auth local backend bypass" backport, which _adds_ a `params.authMethod === "none"` → `return true` path inside `shouldSkipLocalBackendSelfPairing()` and loosens the locality check to include `shared_secret_loopback_local`.
- **Direct intent collision:** upstream's chr9 fix _tightens_ locality-gated auto-pairing in the same function our backport _loosens_ for the no-auth-local-backend feature. A cherry-pick will conflict, and a careless resolution risks either (a) clobbering our intentional no-auth bypass, or (b) re-introducing the locality-spoofing vuln.
- **Re-implementation sketch:** reconcile the two intents by hand —
  1. Preserve our `authMethod === "none"` local-backend bypass (the feature, #75781).
  2. Apply upstream's locality hardening so a _spoofed_ locality cannot reach either the auto-pair path or the no-auth bypass.
  3. Add a regression test asserting: spoofed-locality client with browser-origin header is rejected; genuine direct_local no-auth backend still bypasses; loopback with valid gateway token auto-pairs.
- **Action:** chr9 goes to the RE-IMPLEMENT follow-up list, NOT Batch A. It needs Rich-in-the-loop security review because it touches our own auth backport.

### Revised Batch A (CLEAN high-sev, ready to cherry-pick)

9 commits now (8 original CLEAN + q99w):

| GHSA                | SHA          | PR     |
| ------------------- | ------------ | ------ |
| GHSA-hw9r-h9mr-4jff | `652f5f9b10` | #80891 |
| GHSA-qjpc-qf9m-xwmr | `96fba91b3a` | #81288 |
| GHSA-6fvr-66p3-3qj4 | `a3fda2ada9` | #81065 |
| GHSA-xww8-gqvh-92x9 | `731af9c96b` | #81001 |
| GHSA-mgq6-vr84-7m2j | `6e498a1f62` | #80892 |
| GHSA-2hfg-4fh4-qp7f | `3d93174c43` | #81070 |
| GHSA-3c6j-hq33-3jv4 | `17fa101c16` | #81071 |
| GHSA-mhq8-78pj-5j79 | `9ac4272b35` | #80999 |
| GHSA-q99w-vh6v-q3v7 | `1e1cf14da2` | #70707 |

**RE-IMPLEMENT follow-up list:** chr9 (auth-helpers cluster, collides with #75781), plus the earlier-flagged redact.ts / pi-tools.policy.ts overlaps if any medium-sev fix lands there.

**Caveat to verify during execution:** `96fba91b3a` (qjpc) shares the connect-policy / handshake surface with the chr9 cluster. Confirm during the Batch A cherry-pick that it applies cleanly on its own and doesn't presuppose `af42260440`. If it conflicts on `handshake-auth-helpers.ts`, it moves to the RE-IMPLEMENT list too.
