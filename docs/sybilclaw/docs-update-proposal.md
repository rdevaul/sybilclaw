# SybilClaw Documentation Update Proposal

**Date:** 2026-04-03
**Status:** Draft for Review
**Scope:** Documentation audit and update plan for SybilClaw fork

---

## Executive Summary

This proposal outlines a comprehensive update plan for the SybilClaw documentation to:

1. **Rebrand** OpenClaw → SybilClaw where appropriate (661 of 706 markdown files affected)
2. **Document** the new memory system architecture and workflows
3. **Update** skill repository configuration defaults (signed repository)

**Total effort estimate:** 4-6 days (medium complexity, high volume)

---

## 1. OpenClaw → SybilClaw Branding

### Current State

- **Total markdown files:** 706
- **Files with OpenClaw references:** 661 (94%)
- **Top affected directories:**
  - `zh-CN/` (287 files) — Chinese translations
  - `cli/` (49 files) — CLI documentation
  - `tools/` (38 files) — Tool documentation
  - `providers/` (38 files) — Provider documentation
  - `gateway/` (34 files) — Gateway configuration
  - `concepts/` (32 files) — Core concepts
  - `channels/` (30 files) — Channel setup
  - `platforms/` (25 files) — Platform-specific docs
  - `install/` (25 files) — Installation guides

### Branding Strategy

#### Files to UPDATE (SybilClaw branding)

**Core user-facing documentation:**

- `docs/index.md` — Main landing page
- `docs/start/**` — Getting started guides
- `docs/install/**` — Installation instructions
- Navigation headers and UI copy
- Feature descriptions and marketing content

**Rationale:** Users see these first; they should clearly identify as SybilClaw.

#### Files to KEEP (OpenClaw references)

**Preserve upstream attribution in:**

- `docs/reference/credits.md` — Project history and attribution
- Any changelog/release notes referencing historical OpenClaw versions
- Technical architecture docs that describe inherited OpenClaw design
- Comments like "SybilClaw is a fork of OpenClaw" (preserve attribution)

**Rationale:** Maintain transparency about fork origins and credit upstream maintainers.

#### Hybrid approach for technical docs

Many technical docs should use a hybrid pattern:

```markdown
# Feature Name

> **Note:** SybilClaw extends OpenClaw's [feature]. This guide covers both the
> inherited OpenClaw behavior and SybilClaw-specific enhancements.

## Configuration

[Standard OpenClaw config options...]

## SybilClaw Extensions

[New per-user memory isolation, etc...]
```

### Sample Files Reviewed

| File                                 | Current State                                    | Recommendation                                                              |
| ------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------- |
| `docs/index.md`                      | "OpenClaw is a multi-channel gateway..."         | **UPDATE** all product references to SybilClaw, add note "Fork of OpenClaw" |
| `docs/start/getting-started.md`      | "Install OpenClaw and run your first chat..."    | **UPDATE** to SybilClaw branding, mention OpenClaw compatibility            |
| `docs/reference/credits.md`          | "OpenClaw = CLAW + TARDIS..."                    | **KEEP** — this is historical/attribution                                   |
| `docs/sybilclaw/multi-user-setup.md` | "SybilClaw extends OpenClaw with..."             | **GOOD** — already uses proper fork attribution                             |
| `docs/tools/clawhub.md`              | "ClawHub is the public registry for OpenClaw..." | **EVALUATE** — does SybilClaw use upstream ClawHub or a fork?               |
| `docs/zh-CN/**`                      | All references to OpenClaw                       | **UPDATE** via i18n pipeline after English docs updated                     |

### Internationalization (i18n) Impact

- **Chinese (`zh-CN/`):** 312 markdown files (generated)
- **Japanese (`ja-JP/`):** 2 files (minimal)

**Recommendation:**

1. Update English docs first
2. Add glossary entries to `docs/.i18n/glossary.zh-CN.json`:
   - "SybilClaw" → "SybilClaw" (keep English)
   - "OpenClaw" → context-dependent (preserve when attribution)
3. Run `scripts/docs-i18n` to regenerate Chinese docs
4. Manual review of critical pages only (index, getting started)

### Automation Approach

**Phase 1: Automated bulk replacement (LOW RISK)**

```bash
# Dry run first
find docs/ -name "*.md" \
  -not -path "*/zh-CN/*" \
  -not -path "*/ja-JP/*" \
  -not -path "*/reference/*" \
  -exec grep -l "Install OpenClaw\|OpenClaw is\|OpenClaw gateway" {} \; \
  > /tmp/rebrand-candidates.txt

# Targeted replacement patterns
sed -i '' 's/Install OpenClaw/Install SybilClaw/g' $(cat /tmp/rebrand-candidates.txt)
sed -i '' 's/OpenClaw is a/SybilClaw is a/g' $(cat /tmp/rebrand-candidates.txt)
sed -i '' 's/the OpenClaw gateway/the SybilClaw gateway/g' $(cat /tmp/rebrand-candidates.txt)
```

**Phase 2: Manual review (HIGH VALUE)**

- Landing pages (`index.md`, `docs/start/*`)
- Navigation structure (`docs.json` or Mintlify config)
- Attribution sections (keep OpenClaw references)
- Code examples and CLI commands (evaluate case-by-case)

**Phase 3: CLI command impact**

**Decision needed:** Does SybilClaw replace the `openclaw` CLI command with `sybilclaw`?

- **Option A:** Keep `openclaw` command (easier migration, clear it's a fork)
  - Docs continue to use `openclaw onboard`, etc.
  - Only narrative text changes to "SybilClaw"

- **Option B:** Rebrand to `sybilclaw` command (stronger identity)
  - All CLI examples change: `openclaw` → `sybilclaw`
  - Higher migration friction for existing users
  - Need to decide on config paths: `~/.openclaw/` → `~/.sybilclaw/`?

**Recommendation:** **Option A** unless there's a strategic reason to fully rebrand the CLI. Mention in docs: "SybilClaw uses the `openclaw` CLI (inherited from upstream)."

### Effort Estimate

| Task                                      | Effort            | Risk           |
| ----------------------------------------- | ----------------- | -------------- |
| Automated bulk replacement (English docs) | **S** (2-3 hours) | Low            |
| Manual review of top 20 user-facing pages | **M** (1 day)     | Medium         |
| Navigation/config updates                 | **S** (2-4 hours) | Low            |
| i18n glossary updates                     | **S** (1 hour)    | Low            |
| Regenerate Chinese translations           | **S** (30 min)    | Low            |
| Manual spot-check of Chinese key pages    | **S** (2 hours)   | Low            |
| **Total for branding updates**            | **2-3 days**      | **Low-Medium** |

---

## 2. Memory System Documentation

### Current State

**Existing SybilClaw-specific docs:**

- ✅ `docs/sybilclaw/multi-user-setup.md` — Per-user memory config
- ✅ `docs/sybilclaw/context-graph-architecture.md` — Tag-based context system

**Memory scripts present:**

- ✅ `scripts/consolidate.py` — Memory consolidation script (Phase 2)
- ✅ `scripts/memory-consolidate.sh` — Shell wrapper
- (No `scripts/session-summary.sh` found — may need creation)

**Existing OpenClaw memory docs (may need updates):**

- `docs/concepts/memory.md` — General memory concepts
- `docs/concepts/memory-builtin.md` — Built-in memory system
- `docs/concepts/memory-honcho.md` — Honcho integration
- `docs/concepts/memory-qmd.md` — QMD format
- `docs/concepts/memory-search.md` — Memory search

### New Memory System Architecture

Based on code review and README, SybilClaw implements:

#### Tiered Memory Structure

**System-Level (Shared across all users):**

- `SOUL.md` — AI personality, tone, interaction style
- `AGENTS.md` — Agent instructions and behavior
- `TOOLS.md` — Tool usage notes and patterns
- `IDENTITY.md` — Shared identity information

**Personal (Per-User):**

- `memory/personal/<user>/INDEX.md` — Personal memory index (200-line cap)
- `memory/personal/<user>/topics/` — Topic-specific markdown files
- `memory/personal/<user>/daily/` — Daily logs (transient)

**Shared Household/Team:**

- `memory/shared/household/INDEX.md` — Shared household context
- `memory/shared/household/topics/` — Shared topics

**Session Transcripts (Archive):**

- `memory/transcripts/<user>/YYYY-MM-DD.jsonl` — JSONL session archives

#### Consolidation Pipeline

**Graduated Compaction Strategy (4 Levels):**

_Note: AGENTS.md mentions this, but details not found in current docs. Needs clarification:_

- Level 1: Daily logs → Topic files
- Level 2: Topic files → INDEX.md (200-line cap)
- Level 3: INDEX.md overflow → Archive
- Level 4: ??? (Long-term compression/embedding?)

**Weekly Consolidation Cron:**

```bash
# Example cron entry (needs verification)
0 2 * * 0 cd /path/to/workspace && python3 scripts/consolidate.py --user rich
```

**Manual Consolidation:**

```bash
python3 scripts/consolidate.py --workspace ~/workspace --user rich
python3 scripts/consolidate.py --workspace ~/workspace --user rich --dry-run
python3 scripts/consolidate.py --workspace ~/workspace --user rich --since 2026-03-01
```

**Session Summary (JSONL Archive):**

_Script not found — needs creation or documentation:_

- `scripts/session-summary.sh` — Mentioned in task description
- Purpose: Write session transcripts to `memory/transcripts/YYYY-MM-DD.jsonl`
- Integration point: When does this run? (End of session? Nightly?)

#### Configuration

**Per-Agent Memory Isolation:**

```json5
{
  agents: {
    "agent-alice": {
      memoryFile: "memory/personal/alice/INDEX.md",
      memoryAllowedPaths: ["memory/personal/alice/", "memory/shared/"],
      channels: {
        telegram: { allowFrom: ["+1234567890"] },
      },
    },
  },
}
```

### Documentation Gaps

#### NEW docs needed:

1. **`docs/sybilclaw/memory-system-overview.md`** (M effort)
   - High-level architecture diagram
   - Tiered memory model explained
   - Graduated compaction strategy (4 levels) — **NEEDS CLARIFICATION FROM AGENTS.md**
   - When to use personal vs. shared memory
   - Performance characteristics and scaling

2. **`docs/sybilclaw/memory-consolidation-guide.md`** (M effort)
   - How consolidation works (daily → topics → INDEX → archive)
   - Setting up weekly cron jobs
   - Manual consolidation workflows
   - `consolidate.py` CLI reference
   - Troubleshooting consolidation failures
   - INDEX.md 200-line cap management

3. **`docs/sybilclaw/session-transcripts.md`** (S-M effort)
   - JSONL archive format
   - `session-summary.sh` usage (**SCRIPT MISSING — CREATE OR DOCUMENT**)
   - Retention policies
   - Querying historical sessions
   - Privacy considerations for multi-user setups

4. **`docs/sybilclaw/memory-security.md`** (S effort)
   - `memoryAllowedPaths` enforcement
   - Preventing cross-user memory leakage
   - File system permissions for multi-tenant deployments
   - Audit logging for memory access

#### UPDATES needed to existing docs:

5. **`docs/concepts/memory.md`** (S effort)
   - Add section: "SybilClaw Multi-User Extensions"
   - Link to `docs/sybilclaw/memory-system-overview.md`

6. **`docs/sybilclaw/multi-user-setup.md`** (S effort, already good)
   - ✅ Already documents `memoryFile` and `memoryAllowedPaths`
   - Add: Link to consolidation guide
   - Add: Link to session transcripts doc

7. **`docs/start/getting-started.md`** or new `docs/sybilclaw/quickstart.md`\*\* (M effort)
   - SybilClaw-specific quickstart focusing on multi-user setup
   - Differs from OpenClaw single-user setup
   - Could be a separate guide or a section in getting-started

### Draft Outlines

#### NEW: `docs/sybilclaw/memory-system-overview.md`

```markdown
# SybilClaw Memory System Overview

## What Makes SybilClaw Different

SybilClaw extends OpenClaw's memory system with per-user isolation...

## Memory Tiers

### System-Level (Shared)

- SOUL.md
- AGENTS.md
- TOOLS.md
- IDENTITY.md

### Personal (Per-User)

- memory/personal/<user>/INDEX.md
- memory/personal/<user>/topics/
- memory/personal/<user>/daily/

### Shared Team Context

- memory/shared/household/INDEX.md
- memory/shared/household/topics/

### Session Transcripts (Archive)

- memory/transcripts/<user>/YYYY-MM-DD.jsonl

## Graduated Compaction Strategy

### Four Levels of Memory Consolidation

**Level 1: Daily Logs → Topic Files**
[Details on how daily logs merge into topic files...]

**Level 2: Topic Files → INDEX.md**
[How topics summarize into the 200-line INDEX.md cap...]

**Level 3: INDEX.md → Archive**
[How old INDEX entries move to long-term storage...]

**Level 4: Long-Term Compression**
[Vector embeddings? Semantic search? — NEEDS CLARIFICATION]

## Memory Access Control

### memoryAllowedPaths

[Document path-based access control...]

## Performance Considerations

[Scaling, query performance, storage footprint...]

## See Also

- [Multi-User Setup Guide](multi-user-setup.md)
- [Memory Consolidation Guide](memory-consolidation-guide.md)
- [Session Transcripts](session-transcripts.md)
```

#### NEW: `docs/sybilclaw/memory-consolidation-guide.md`

````markdown
# Memory Consolidation Guide

## What is Consolidation?

Daily logs are transient working memory. Consolidation merges them into
structured topic files and keeps INDEX.md under 200 lines.

## Consolidation Workflow

1. Daily logs accumulate in `memory/personal/<user>/daily/`
2. Consolidation script:
   - Parses daily logs by topic tags
   - Merges new info into `topics/<topic>.md`
   - Resolves contradictions (latest wins)
   - Updates INDEX.md with topic summaries
   - Prunes INDEX.md if > 200 lines
   - Writes pruned entries to JSONL archive

## Setting Up Weekly Consolidation

### Cron Example (Linux/macOS)

```bash
# Edit crontab
crontab -e

# Add weekly consolidation (Sundays at 2 AM)
0 2 * * 0 cd /home/user/workspace && python3 scripts/consolidate.py --user rich
```
````

### Systemd Timer Example

[Provide systemd timer + service unit...]

## Manual Consolidation

### Basic Usage

```bash
python3 scripts/consolidate.py --workspace ~/workspace --user rich
```

### Dry Run (Preview Changes)

```bash
python3 scripts/consolidate.py --workspace ~/workspace --user rich --dry-run
```

### Consolidate Since Date

```bash
python3 scripts/consolidate.py --workspace ~/workspace --user rich --since 2026-03-01
```

## INDEX.md 200-Line Cap Management

[Explain how the cap works, what gets pruned, where pruned content goes...]

## Troubleshooting

### Consolidation Fails with Parse Error

[Common errors and fixes...]

### Topics Not Updating

[Debug checklist...]

### INDEX.md Still Growing

[How to tune pruning thresholds...]

## See Also

- [Memory System Overview](memory-system-overview.md)
- [Session Transcripts](session-transcripts.md)

````

#### NEW: `docs/sybilclaw/session-transcripts.md`

```markdown
# Session Transcripts and JSONL Archives

## Overview

SybilClaw archives session transcripts to `memory/transcripts/<user>/YYYY-MM-DD.jsonl`
for historical reference and long-term memory queries.

## JSONL Format

Each line is a JSON object representing a session event:

```json
{"timestamp": "2026-04-03T14:32:00Z", "user": "rich", "role": "user", "content": "..."}
{"timestamp": "2026-04-03T14:32:05Z", "user": "rich", "role": "assistant", "content": "..."}
````

## Generating Session Transcripts

### Automatic Archiving

[Document when/how session-summary.sh runs — NEEDS CLARIFICATION]

### Manual Archiving

```bash
scripts/session-summary.sh --user rich --date 2026-04-03
```

## Querying Historical Sessions

### Using jq

```bash
# Find all sessions on a date
jq -s '.' memory/transcripts/rich/2026-04-03.jsonl

# Search for keyword
grep -i "project X" memory/transcripts/rich/*.jsonl
```

### Integration with Consolidation

[How consolidation can reference transcript archives for context...]

## Retention Policies

[Default: keep all? Optional: auto-delete after N days?]

## Privacy Considerations

- Transcripts contain full conversation history
- File system permissions critical for multi-user setups
- Consider encryption for sensitive deployments

## See Also

- [Memory System Overview](memory-system-overview.md)
- [Memory Consolidation Guide](memory-consolidation-guide.md)

````

### Effort Estimate

| Task | Effort | Risk |
|------|--------|------|
| Clarify graduated compaction strategy (4 levels) from AGENTS.md | **S** (1 hour) | Low |
| Identify/create `session-summary.sh` script or document alternative | **S-M** (2-4 hours) | Medium |
| Write `memory-system-overview.md` | **M** (4-6 hours) | Low |
| Write `memory-consolidation-guide.md` | **M** (4-6 hours) | Low |
| Write `session-transcripts.md` | **S-M** (2-4 hours) | Medium |
| Write `memory-security.md` | **S** (2-3 hours) | Low |
| Update `docs/concepts/memory.md` | **S** (1 hour) | Low |
| Update `docs/sybilclaw/multi-user-setup.md` | **S** (30 min) | Low |
| **Total for memory system docs** | **2-3 days** | **Low-Medium** |

---

## 3. Signed Skill Repository Default

### Current State

**Skill repository references found:**
- `docs/tools/clawhub.md` — Extensive ClawHub documentation (337 lines)
- `docs/tools/skills.md` — Skills overview with ClawHub integration
- `docs/tools/creating-skills.md` — Skill creation guide

**Config schema:**
- `src/config/types.installs.ts` — Defines `source: "clawhub"` install type
- `src/config/zod-schema.installs.ts` — Zod schema for ClawHub installs
- Schema includes: `clawhubUrl`, `clawhubPackage`, `clawhubFamily`, `clawhubChannel`

**Current default skill repository:** ClawHub (https://clawhub.ai)

### Question: SybilClaw Signed Skill Repository

**Decision needed:** Does SybilClaw use:

1. **Upstream ClawHub** (https://clawhub.ai)
   - Minimal doc changes needed
   - Just add security notes about verifying skill sources

2. **SybilClaw-specific skill repository** with signing
   - New default URL (what is it?)
   - Signature verification workflow
   - How does it differ from ClawHub?

**If Option 2:**

### Documentation Updates Needed

1. **`docs/sybilclaw/signed-skills.md`** (NEW, M effort)
   - What makes SybilClaw's skill repo different
   - Signature verification process
   - Trust model and security guarantees
   - How to publish signed skills
   - Fallback to unsigned/community skills

2. **`docs/tools/skills.md`** (UPDATE, S effort)
   - Add section: "SybilClaw Signed Repository"
   - Default repo URL override
   - Link to signed-skills.md

3. **`docs/tools/clawhub.md`** (UPDATE or DEPRECATE, S effort)
   - If SybilClaw doesn't use ClawHub:
     - Add deprecation notice
     - Redirect to sybilclaw/signed-skills.md
   - If SybilClaw uses ClawHub + signing:
     - Add section on signature verification

4. **`docs/install/getting-started.md`** (UPDATE, S effort)
   - Note about skill repository during onboarding
   - Trust/security implications

### Config Changes Needed

**If SybilClaw uses a different skill repo:**

```typescript
// src/config/defaults.ts or similar
const DEFAULT_SKILL_REPO_URL = "https://skills.sybilclaw.ai"; // Or whatever
const REQUIRE_SIGNED_SKILLS = true; // New config option?
````

**New config schema fields:**

```json5
{
  skills: {
    repository: {
      url: "https://skills.sybilclaw.ai",
      requireSigned: true,
      trustedKeys: ["key-fingerprint-1", "key-fingerprint-2"],
    },
  },
}
```

### Effort Estimate

| Task                                          | Effort          | Risk           |
| --------------------------------------------- | --------------- | -------------- |
| **If using upstream ClawHub (Option 1)**      | **XS** (30 min) | Low            |
| Add security note to skills.md                | XS              | Low            |
| **If using SybilClaw signed repo (Option 2)** | **1 day**       | Medium         |
| Write signed-skills.md                        | M (3-4 hours)   | Low            |
| Update skills.md                              | S (1 hour)      | Low            |
| Update/deprecate clawhub.md                   | S (1-2 hours)   | Low            |
| Update getting-started.md                     | S (30 min)      | Low            |
| Config schema changes (if needed)             | S (1-2 hours)   | Medium         |
| **Total for signed skills**                   | **XS - 1 day**  | **Low-Medium** |

**Recommendation:** Determine Option 1 vs. Option 2 before proceeding.

---

## Summary and Prioritized Action Plan

### Priority 1: Critical (Do First)

**1.1 Determine SybilClaw-Specific Decisions**

- **Effort:** XS (1-2 hours discussion)
- Does SybilClaw rebrand the CLI command? (`openclaw` → `sybilclaw`)
- Does SybilClaw use upstream ClawHub or a signed fork?
- Clarify "graduated compaction strategy (4 levels)" from AGENTS.md

**1.2 Rebrand Core User-Facing Docs**

- **Effort:** M (1 day)
- `docs/index.md`
- `docs/start/getting-started.md`
- `docs/start/*` (all getting started guides)
- Navigation structure and landing pages

**1.3 Memory System Core Docs**

- **Effort:** M (1 day)
- Write `docs/sybilclaw/memory-system-overview.md`
- Write `docs/sybilclaw/memory-consolidation-guide.md`
- Update `docs/sybilclaw/multi-user-setup.md` with links

### Priority 2: Important (Do Soon)

**2.1 Complete Memory Documentation**

- **Effort:** M (1 day)
- Write `docs/sybilclaw/session-transcripts.md`
- Write `docs/sybilclaw/memory-security.md`
- Update `docs/concepts/memory.md`

**2.2 Rebrand Technical Docs**

- **Effort:** M (1 day)
- `docs/concepts/*`
- `docs/gateway/*`
- `docs/cli/*`
- Automated bulk replacement + manual review

**2.3 Signed Skills Documentation (if applicable)**

- **Effort:** S-M (0.5-1 day depending on Option 1 vs 2)
- Write `docs/sybilclaw/signed-skills.md` (if needed)
- Update `docs/tools/skills.md`

### Priority 3: Nice to Have (Later)

**3.1 Rebrand Internationalized Docs**

- **Effort:** S (0.5 day)
- Update i18n glossary
- Regenerate `docs/zh-CN/*`
- Spot-check key Chinese pages

**3.2 Rebrand Remaining Docs**

- **Effort:** S-M (0.5-1 day)
- `docs/tools/*`
- `docs/providers/*`
- `docs/channels/*`
- `docs/platforms/*`

**3.3 Polish and Cross-Links**

- **Effort:** S (0.5 day)
- Add cross-links between new SybilClaw docs
- Update navigation structure to highlight SybilClaw features
- Add "SybilClaw Extensions" callouts to OpenClaw-inherited docs

---

## Total Effort Estimate

| Priority       | Tasks                                        | Effort       | Notes                |
| -------------- | -------------------------------------------- | ------------ | -------------------- |
| **Priority 1** | CLI decision, core rebrand, memory system    | **2-3 days** | Critical path        |
| **Priority 2** | Memory completion, technical rebrand, skills | **2-3 days** | High value           |
| **Priority 3** | i18n, remaining rebrand, polish              | **1-2 days** | Lower priority       |
| **TOTAL**      | All documentation updates                    | **5-8 days** | Includes review time |

**Realistic timeline with interruptions:** 1-2 weeks

---

## Recommendations

### Approach

1. **Start with decisions:** CLI branding and skill repo strategy (1 hour)
2. **Automated pass:** Bulk rebrand low-risk files (2-3 hours)
3. **Manual curation:** Core landing pages and getting-started (1 day)
4. **New content:** Memory system docs (2-3 days)
5. **Polish pass:** Cross-links, navigation, signed skills (1 day)
6. **i18n update:** After English docs stabilize (0.5 day)

### Risk Mitigation

- **Test all CLI examples** after any command rebranding
- **Preview memory docs with actual consolidation runs** to verify accuracy
- **Get user feedback** on new SybilClaw-specific docs before finalizing
- **Keep git history clean:** Separate commits for bulk rebrand vs. new content

### Files That Should NOT Be Renamed/Rebranded

**Preserve OpenClaw attribution in:**

- `docs/reference/credits.md` — Project history
- `docs/reference/RELEASING.md` — If it references upstream OpenClaw release process
- Any historical changelogs (`CHANGELOG.md`, release notes)
- Code comments/docstrings that reference OpenClaw architecture
- `README.md` — Keep "fork of OpenClaw" at the top

---

## Open Questions for Review

1. **CLI branding:** Keep `openclaw` command or rebrand to `sybilclaw`?
2. **Skill repository:** Use upstream ClawHub or SybilClaw signed repo?
3. **Graduated compaction (4 levels):** What are the exact 4 levels? (Referenced in task description, not fully documented)
4. **Session summary script:** `scripts/session-summary.sh` mentioned but not found — create or document alternative?
5. **i18n priority:** Update Chinese docs now or wait for English docs to stabilize?
6. **Memory system diagrams:** Should we create visual diagrams for memory tiers and consolidation flow?

---

## Next Steps

1. **Review this proposal** with SybilClaw maintainer/team
2. **Answer open questions** (CLI branding, skill repo, consolidation details)
3. **Approve Priority 1 tasks** to unblock work
4. **Assign documentation tasks** (can parallelize branding vs. memory docs)
5. **Set review milestones** (e.g., review after Priority 1, before Priority 2)

---

**Prepared by:** Claude (Documentation Auditor)
**Contact:** (Awaiting user feedback via openclaw system event)
