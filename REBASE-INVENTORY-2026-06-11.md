# SybilClaw Rebase Inventory — 2026-06-11

**Rebase target:** `v2026.5.27`
**Current HEAD:** `0c92b2f6da` (main)
**Total SybilClaw-unique commits:** 97

---

## Must-Re-Apply

Commits that carry SybilClaw-unique functionality not present in upstream `v2026.5.27`.

| Commit | Date | Author | Subject | Rationale |
|--------|------|--------|---------|-----------|
| `5bdb001ea4` | 2026-03-23 | Richard DeVaul | feat: add per-agent memoryFile config option | Core multi-user feature — per-agent memory isolation |
| `fc062b70ab` | 2026-03-25 | Richard DeVaul | Rename OpenClaw to SybilClaw and update details | Rebrand — foundational |
| `d1415921da` | 2026-03-25 | Richard DeVaul | docs: SybilClaw multi-user setup guide, generic service identifiers, context graph architecture | Multi-user docs + contextgraph architecture |
| `2648897fae` | 2026-03-30 | Richard DeVaul | feat(agents): add per-agent memoryFile config option (uncommitted changes) | Core multi-user feature |
| `d1a7b28200` | 2026-03-31 | Richard DeVaul | fix: remove dropped createSyntheticSourceInfo and sourceInfo from Skill type | Build fix for rebase — may need re-evaluation |
| `1b2f337537` | 2026-04-01 | Richard DeVaul | fix: add sourceInfo to local skill loader and test helpers (build fix for 2026.4.1 rebase) | Build fix — may need re-evaluation |
| `732e71792d` | 2026-04-03 | Richard DeVaul | feat: Phase 2 memory consolidation + iterative-dev skill | Multi-user memory feature |
| `3dad470021` | 2026-04-03 | Richard DeVaul | feat(agents): add memoryAllowedPaths config for per-agent memory isolation | Core multi-user security feature |
| `5eac49925d` | 2026-04-03 | Richard DeVaul | feat(sybilclaw): rename CLI to sybilclaw, migrate state dir, add session-summary.sh, document graduated compaction | CLI rebrand + state dir migration |
| `4e6f71384e` | 2026-04-03 | Richard DeVaul | feat(sybilclaw): add migrate-to-sybilclaw.sh migration script and sybilclaw migrate CLI command | Migration tooling |
| `0dc3ca3631` | 2026-04-03 | Richard DeVaul | fix(migrate): fix ANSI color escape sequences in migration script | Migration fix |
| `552ea79e26` | 2026-04-03 | Richard DeVaul | fixed bad/missing wrapperEntryPairs for sybilclaw executable | CLI rebrand fix |
| `1a269f0b64` | 2026-04-04 | Richard DeVaul | feat(migrate): add openclaw→sybilclaw CLI symlink creation and supporting docs/skills | Migration tooling |
| `ccc40af23e` | 2026-04-04 | Richard DeVaul | docs: expand SybilClaw value proposition — multi-user support and advanced memory management | SybilClaw docs |
| `c7b46ed036` | 2026-04-04 | Richard DeVaul | chore: bump version to 0.1.0-rc1 for SybilClaw release candidate | Version bump — will need update |
| `2e8179a74f` | 2026-04-05 | Richard DeVaul | chore: restore version to 2026.4.1 to match upstream plugin minHostVersion requirements | Version compat |
| `e36f2e1914` | 2026-04-05 | Richard DeVaul | fix(docker): update Dockerfile for sybilclaw.mjs rename | Docker rebrand |
| `05dcd7dcc4` | 2026-04-05 | Richard DeVaul | docs: add SybilClaw migration guide | Migration docs |
| `42649c6a64` | 2026-04-05 | Richard DeVaul | docs: add prominent migration guide link near top of README | Docs |
| `0841188801` | 2026-04-05 | Richard DeVaul | docs: fix migration guide - sybilclaw.json, ~/.sybilclaw/, sybilclaw CLI throughout | Docs fix |
| `512acc620e` | 2026-04-05 | Richard DeVaul | docs: add npm install option to migration guide Step 1 | Docs |
| `b4168ecdd7` | 2026-04-05 | Richard DeVaul | docs: add release checklist and SybilClaw-specific changelog | Release process docs |
| `7d57b256af` | 2026-04-05 | Richard DeVaul | fix: create .sybilclaw directories with correct permissions for non-root user | Path migration fix |
| `1ac89bf6a5` | 2026-04-05 | Richard DeVaul | chore: ignore test env and npm artifacts | Gitignore |
| `957e10de27` | 2026-04-05 | Richard DeVaul | feat: add SybilClaw npm release workflow and update package name | CI/CD rebrand |
| `eea3f15726` | 2026-04-05 | Richard DeVaul | fix: update SybilClaw workflow validation to use correct package checks | CI fix |
| `1de0c7621c` | 2026-04-06 | Richard DeVaul | Add NODE_AUTH_TOKEN to npm release workflow | CI fix |
| `cfca6c69ad` | 2026-04-06 | Richard DeVaul | fix: recognize sybilclaw package name in root resolution and trust checks | Trust checks for rebrand |
| `2ad3920f19` | 2026-04-07 | Richard DeVaul | fix: exclude dist/extensions from npm pack, add dist-runtime, prefer dist-runtime for bundled plugins | Packaging |
| `b59ee2f3b7` | 2026-04-07 | Richard DeVaul | fix: redirect prepack stdout to stderr to avoid polluting npm pack --json output; add explicit !dist/extensions/ negation in files | Packaging fix |
| `b398884606` | 2026-04-08 | Richard DeVaul | fix: npm publish auth + OpenRouter configured model opt-in | CI + config |
| `5d00b0b0e4` | 2026-04-08 | Richard DeVaul | fix: set NODE_AUTH_TOKEN at job level for npm publish | CI fix |
| `1c4c6053ed` | 2026-04-08 | Richard DeVaul | fix: complete SybilClaw path migration — logs, config, state to ~/.sybilclaw/ | Core path migration |
| `5930310cce` | 2026-04-08 | Richard DeVaul | fix: pass registry-token to setup-node for npm publish auth | CI |
| `fc57bc3b72` | 2026-04-08 | Richard DeVaul | fix: map registry-token input to setup-node's 'token' parameter | CI |
| `40be1a7c2b` | 2026-04-08 | Richard DeVaul | fix: update package.json repo URLs to rdevaul/sybilclaw, bump to sybilclaw-4 | Package identity |
| `c8527bc993` | 2026-04-09 | Jarvis (DML) | fix: DML migration prep — target-registry, query compat, profile-suffix docs | DML-specific config |
| `b86442866c` | 2026-04-21 | Jarvis (DML) | fix: resolve stale .openclaw path references to .sybilclaw | Path migration cleanup |
| `405ba8ee49` | 2026-04-21 | Jarvis (DML) | feat(skills): Phase 1 — per-agent skill filtering with system defaults | Per-agent skill filtering |
| `607ef36175` | 2026-04-21 | Jarvis (DML) | feat: add /skills command to show active skills for current agent | Skills command |
| `925be39625` | 2026-04-22 | Jarvis (DML) | feat: /skills enable\|disable\|reset commands + dispatcher docs | Skills management |
| `673a044137` | 2026-04-22 | Jarvis (DML) | fix: register /skills enable\|disable\|reset in Discord slash command autocomplete | Skills autocomplete |
| `a6c4431d17` | 2026-04-30 | Richard DeVaul | fix(README): update install commands from openclaw to sybilclaw | Docs rebrand |
| `dc242b3326` | 2026-04-30 | Richard DeVaul | chore: rebrand README and package.json for sybilclaw npm publish | Package rebrand |
| `4babd563d5` | 2026-05-07 | Jarvis (DML) | feat(context-engine): per-session compaction ownership | ContextGraph feature |
| `17aeb521e2` | 2026-05-09 | Jarvis (DML) | chore(rebrand): complete sybilclaw rebrand for downstream npm consumers | Rebrand completion |
| `75636d419a` | 2026-05-08 | Richard DeVaul | chore: update README with security/stability positioning, add SybilClaw owl logo | Branding |
| `76412d075e` | 2026-05-09 | Jarvis (DML) | docs: add SybilClaw stability policy + tier-2 CHANGELOG entry | SybilClaw docs |
| `a929769885` | 2026-05-09 | Richard DeVaul | Correct maintainer attribution in stability policy | Docs fix |
| `225d15fc59` | 2026-05-13 | Jarvis (DML) | fix(ci): finish .openclaw -> .sybilclaw rename + add missing allowTailscale stub | CI + path rebrand |
| `5916642dd3` | 2026-05-13 | Richard DeVaul | fix(ci): update openclaw.mjs → sybilclaw.mjs in CI workflow smoke tests | CI rebrand |
| `c00b7bdc85` | 2026-05-13 | Richard DeVaul | fix(ci): update .openclaw path refs to .sybilclaw in tests and exec-approvals | CI rebrand |

---

## Drop

Commits that are superseded by upstream `v2026.5.27` (security/stability backports already present, or merge commits that don't carry unique content).

| Commit | Date | Author | Subject | Rationale |
|--------|------|--------|---------|-----------|
| `c35e9c4e27` | 2026-04-22 | Richard DeVaul | Merge upstream/main security and feature updates (Phase 1) | Merge commit — content now in v5.27 baseline |
| `a69f666b7c` | 2026-04-22 | Richard DeVaul | fix: resolve remaining merge conflicts from upstream main merge | Merge conflict resolution — superseded by rebase |
| `2cfbd31588` | 2026-04-16 | 忻役 | fix: add root guard to prevent CLI execution as root (#67478) | Already in v5.27 (ca8121d22bc) |
| `6cb0df2a52` | 2026-04-16 | Jerry-Xin | fix: skip root guard for container-forwarded CLI | Already in v5.27 (a5f6668a5c5) |
| `bd3e332fba` | 2026-04-19 | Jerry-Xin | fix: apply root guard to legacy CLI entrypoint in src/index.ts | Already in v5.27 (690c7aa2634) |
| `4cac161c02` | 2026-04-21 | Jerry-Xin | fix: enforce root guard unconditionally on legacy entrypoint | Already in v5.27 (5986c2d0134) |
| `ef9f21e001` | 2026-04-24 | Jerry-Xin | fix: check effective UID (geteuid) in root guard | Already in v5.27 (6ec4e5cf4ab) |
| `10bef6e59a` | 2026-04-23 | Peter Steinberger | fix: override vulnerable uuid dependency | Already in v5.27 |
| `fd760834b2` | 2026-04-27 | Peter Steinberger | fix: redact URL query credentials in diagnostics | Already in v5.27 |
| `a420656714` | 2026-05-09 | Pavan Kumar Gondhi | fix(security): block npm_execpath injection from workspace .env (#73262) | Already in v5.27 |
| `3e377a770e` | 2026-05-05 | Vincent Koc | fix(deps): override vulnerable ip-address | Already in v5.27 |
| `c74f23cd44` | 2026-05-01 | stain lu | security(logging): redact payment credential fields (#75230) | Already in v5.27 |
| `0473b61dfe` | 2026-04-30 | Alex Knight | fix(security): stop implicit tool grants from config sections (#47487) (#75055) | Already in v5.27 |
| `2819dbcba1` | 2026-05-08 | Peter Steinberger | fix(gateway): fail closed for trusted-proxy auth | Already in v5.27 |
| `f1702d3fcb` | 2026-04-27 | Peter Steinberger | fix(ollama): preserve streaming usage compat | Already in v5.27 |
| `441d7aceb8` | 2026-05-04 | Peter Steinberger | fix: clarify slack socket retry errors | Already in v5.27 |
| `ffcd6e80c0` | 2026-05-07 | Peter Steinberger | fix(agents): retry overloaded subagent announces | Already in v5.27 |
| `9af7f053c6` | 2026-05-07 | Ayaan Zaidi | fix(telegram): restore outbound poll cap | Already in v5.27 |
| `f77d0bf52a` | 2026-05-06 | NVIDIAN | fix(telegram): keep polling watchdog on getUpdates liveness (#78646) | Already in v5.27 |
| `1a8b4bdea2` | 2026-05-13 | Pavan Kumar Gondhi | browser: enforce navigation checks for act interactions [AI] (#81070) | Already in v5.27 (3d93174c439) |
| `bea337f9a4` | 2026-05-09 | Richard DeVaul | Merge pull request #11 from rdevaul/chore/upstream-tier1-security | Merge commit — PR wrapper only |
| `c2fe33a3a2` | 2026-05-09 | Jarvis (DML) | docs: add consolidated CHANGELOG entry for tier-1 security backports | SybilClaw changelog — superseded by new release |
| `188f9de025` | 2026-05-09 | Richard DeVaul | Merge pull request #13 from rdevaul/chore/upstream-tier1-security-followup | Merge commit |
| `f099022605` | 2026-05-09 | Jarvis (DML) | docs: add CHANGELOG entry for tier-1 security follow-up batch | Changelog — superseded |
| `3a0f7b5837` | 2026-05-09 | Richard DeVaul | Merge pull request #12 from rdevaul/chore/upstream-tier2-stability | Merge commit |
| `59910e9cd8` | 2026-05-09 | Richard DeVaul | Merge pull request #14 from rdevaul/chore/upstream-tier2-stability-followup | Merge commit |
| `d256603d33` | 2026-05-09 | Jarvis (DML) | docs: add CHANGELOG entry for tier-2 stability follow-up batch | Changelog — superseded |
| `35a782b8e4` | 2026-05-09 | Richard DeVaul | Merge pull request #10 from rdevaul/chore/rebrand-completion | Merge commit — content in Must-Re-Apply |
| `5e7c989d88` | 2026-05-07 | Richard DeVaul | Merge pull request #7 from rdevaul/feat/context-engine-per-session-compaction | Merge commit |
| `ad1856102f` | 2026-04-22 | Richard DeVaul | Merge pull request #6 from rdevaul/fix/stale-openclaw-paths | Merge commit |
| `c9a607f5c5` | 2026-04-22 | Richard DeVaul | Merge pull request #5 from rdevaul/feature/skills-enable-disable | Merge commit |
| `3c325fb4ff` | 2026-04-21 | Richard DeVaul | Merge pull request #4 from rdevaul/feat/skills-command | Merge commit |
| `b0d96fd500` | 2026-04-21 | Richard DeVaul | Merge pull request #3 from rdevaul/feat/per-agent-skill-filtering | Merge commit |
| `ca7fbceb22` | 2026-04-09 | dml-jarvis | Merge pull request #2 from rdevaul/fix/dml-migration-prep | Merge commit |
| `cbd183c51b` | 2026-05-31 | Richard DeVaul | Merge pull request #21 from rdevaul/chore/upstream-tier1-security-2026-05 | Merge commit |
| `bcc79f66a9` | 2026-05-12 | Richard DeVaul | Merge pull request #20 from rdevaul/chore/release-2026.5.12 | Merge commit |
| `b867011797` | 2026-05-12 | Richard DeVaul | Merge pull request #19 from rdevaul/chore/release-2026.5.11 | Merge commit |
| `60c7fa585c` | 2026-05-12 | Richard DeVaul | Merge pull request #18 from rdevaul/hotfix/openclaw-shim-restore | Merge commit |
| `4e068461ee` | 2026-05-09 | Richard DeVaul | Merge pull request #17 from rdevaul/chore/release-2026.5.10 | Merge commit |
| `869316d8c8` | 2026-05-09 | Richard DeVaul | Merge pull request #16 from rdevaul/hotfix/redact-tool-payload-text-export | Merge commit |
| `b3da2aaa07` | 2026-05-09 | Richard DeVaul | Merge pull request #15 from rdevaul/chore/release-2026.5.9 | Merge commit |
| `0c92b2f6da` | 2026-05-31 | Richard DeVaul | Merge pull request #23 from rdevaul/docs/security-backport-lts-plan-2026-05-30 | Merge commit |
| `f22a0d50cd` | 2026-05-31 | Richard DeVaul | Merge pull request #22 from rdevaul/chore/ci-rename-sybilclaw-mjs | Merge commit |

---

## Check

Commits that need Rich's review to determine if they should be re-applied, modified, or dropped.

| Commit | Date | Author | Subject | Rationale |
|--------|------|--------|---------|-----------|
| `7a0269af1d` | 2026-05-03 | Ava Daigo | fix(gateway): scoped no-auth local backend bypass (#75781) | Upstream `v5.27` has a different auth model — check `dc5954b0f8c` (reject no-auth tailscale exposure) and `7d99f8b021e` (trusted-proxy local-direct password fallback). Our version may conflict or be superseded. |
| `beceab2512` | 2026-05-09 | Jarvis (DML) | fix(logging): add missing redactToolPayloadText export | May be superseded by upstream logging changes in v5.27; check if the export now exists |
| `a010a36b87` | 2026-05-11 | Jarvis (DML) | fix(packaging): include openclaw alias shim in dist inventory | Packaging — check if upstream dist structure has changed enough to make this moot |
| `1964a046d9` | 2026-05-12 | Jarvis (DML) | release: SybilClaw 2026.5.12 (packaging — exclude per-ext node_modules) | Release commit — content may need adjustment for new baseline |
| `485eea6991` | 2026-05-12 | Jarvis (DML) | release: SybilClaw 2026.5.11 | Release commit |
| `385ef2c9a2` | 2026-05-09 | Jarvis (DML) | release: SybilClaw 2026.5.10 | Release commit |
| `7aa16ec76a` | 2026-05-09 | Jarvis (DML) | release: SybilClaw 2026.5.9 | Release commit |
| `c9a01cb2e0` | 2026-05-30 | Jarvis (DML) | docs(changelog): SybilClaw Tier 1 security backports (May 2026) | Docs — keep or supersede with new rebase changelog |
| `57e58cd703` | 2026-05-31 | Jarvis (DML) | docs(security): May 2026 backport analysis + LTS rebase plan | Historical docs — may want to keep as reference |

---

## Summary

| Category | Count | Action |
|----------|-------|--------|
| Must-Re-Apply | 51 | Cherry-pick or manually re-apply onto v2026.5.27 |
| Drop | 42 | Already in upstream or merge commits; skip |
| Check | 9 | Need Rich's review before decision |

**Approach:** Rather than rebasing the full commit history (which includes merge commits and interleaved upstream cherry-picks), the strategy is:
1. Start from `v2026.5.27` clean
2. Cherry-pick Must-Re-Apply commits in chronological order, squashing related sequences where possible
3. Skip Drop commits entirely
4. Flag Check commits for Rich's decision

**Note:** The `d1a7b28200` and `1b2f337537` commits (build fixes for sourceInfo) need verification against `v5.27` — the upstream API may have changed enough that these fixes are either unnecessary or need different implementation.
