---
name: sybilmigration
description: >
  Migrate a legacy OpenClaw workspace to the SybilClaw multi-user memory structure
  (Claude Code-inspired: index layer, typed topic files, JSONL archive, per-user isolation).
  Use when: user says "migrate to SybilClaw", "run the memory migration", "set up the new
  memory structure", or "migrate my OpenClaw workspace". NOT for: adding a new user to an
  already-migrated workspace (use adduser skill instead), or routine memory maintenance.
metadata:
  openclaw:
    emoji: "🔀"
    last_reviewed: "2026-04-03"
---

# SYBILMIGRATION Skill

Migrates a legacy OpenClaw workspace to the SybilClaw Claude Code-inspired memory structure.

## TRIGGER

**Fire this skill when user says any of:**

- "migrate to SybilClaw"
- "run the memory migration"
- "set up the new memory structure"
- "migrate my OpenClaw workspace"
- "upgrade my memory files"

**Do NOT fire for:** adding a new user (use `adduser` skill), routine heartbeat/consolidation tasks.

---

## Pre-Flight Checks

Before doing anything, verify:

```bash
# 1. Confirm workspace root
ls ~/.openclaw/workspace/AGENTS.md || echo "ERROR: not in an OpenClaw workspace"

# 2. Check existing structure
ls ~/.openclaw/workspace/memory/ 2>/dev/null || echo "No memory/ dir yet"
ls ~/.openclaw/workspace/MEMORY.md 2>/dev/null || echo "No root MEMORY.md"

# 3. Check disk space (migration needs ~2x current memory/ size)
du -sh ~/.openclaw/workspace/memory/ 2>/dev/null

# 4. Confirm openclaw CLI available
openclaw --version
```

If any check fails, report the issue and stop — do not proceed.

---

## Step 1: Backup Everything

```bash
BACKUP_DIR=~/.openclaw/workspace/memory.backup-pre-sybilclaw-$(date +%Y%m%d-%H%M%S)
cp -r ~/.openclaw/workspace/memory/ $BACKUP_DIR
cp ~/.openclaw/workspace/MEMORY.md $BACKUP_DIR/ROOT-MEMORY.md.bak 2>/dev/null || true

# Write restore instructions
cat > $BACKUP_DIR/RESTORE.md << 'EOF'
# Restore Instructions

If migration went wrong, run:
  cp -r <THIS_DIR>/ ~/.openclaw/workspace/memory/
  cp <THIS_DIR>/ROOT-MEMORY.md.bak ~/.openclaw/workspace/MEMORY.md
EOF

echo "Backup created at: $BACKUP_DIR"
```

**Do not proceed if backup fails.**

---

## Step 2: Discover Existing Users

Scan for existing user directories and files:

```bash
# Find existing personal user directories
ls ~/.openclaw/workspace/memory/personal/ 2>/dev/null

# Find the primary user (whoever has the most content)
du -sh ~/.openclaw/workspace/memory/personal/*/ 2>/dev/null | sort -rh | head -5

# Check for root MEMORY.md (primary user's long-term memory)
wc -l ~/.openclaw/workspace/MEMORY.md 2>/dev/null

# Check for household/shared memory
ls ~/.openclaw/workspace/memory/shared/ 2>/dev/null
```

Build a list of users to migrate. Default: any directory under `memory/personal/` plus `shared/household` if present.

---

## Step 3: Migrate Each User

For each user (repeat this block):

### 3a. Create directory structure

```bash
USER=<username>
BASE=~/.openclaw/workspace/memory/personal/$USER

mkdir -p $BASE/topics
mkdir -p $BASE/daily
mkdir -p $BASE/daily/.archive
```

### 3b. Create INDEX.md (pointer-only)

Parse existing MEMORY.md (if present) and build an index:

- Each line: `- [tag] brief_summary → topics/<file>.md`
- Max 200 lines, max ~150 chars per line
- Do NOT copy content — pointers only

```
<!-- AUTO-MANAGED: Updated by consolidation agent -->
<!-- MAX 200 LINES — overflow triggers pruning -->

# Memory Index — <User>

*Last updated: YYYY-MM-DD*

## Identity & Background
- [identity] <brief> → topics/identity.md

## Active Projects
- [project:<name>] <brief> → topics/projects.md#<anchor>

## Tools & Services
- [tools:<name>] <brief> → topics/tools.md
```

### 3c. Create typed topic files

Migrate content from existing MEMORY.md and context.md into typed files:

| Source                                   | Destination               | Content type                         |
| ---------------------------------------- | ------------------------- | ------------------------------------ |
| MEMORY.md — identity/background sections | `topics/identity.md`      | Role, expertise, background          |
| MEMORY.md — project sections             | `topics/projects.md`      | Active projects, status              |
| MEMORY.md — tools/infra sections         | `topics/tools.md`         | Tool configs, credentials pointers   |
| MEMORY.md — operational lessons          | `topics/feedback.md`      | Lessons, "never do X" patterns       |
| context.md                               | `topics/context.md`       | Current priorities, recent decisions |
| (create fresh)                           | `topics/relationships.md` | Key people and context               |
| (create fresh)                           | `topics/references.md`    | External links, dashboards, accounts |

Each topic file header:

```markdown
<!-- AUTO-MANAGED: Updated by consolidation agent. Manual edits may be overwritten. -->

# <Type> — <User>
```

preferences.md header (if creating or preserving):

```markdown
<!-- HUMAN-CURATED: Do not auto-update. This file is read-only for automated processes. -->
```

### 3d. Archive original daily logs

```bash
# Move daily logs older than 30 days to .archive
find $BASE/daily -name "*.md" -mtime +30 -not -path "*/.archive/*" \
  -exec mv {} $BASE/daily/.archive/ \;
```

### 3e. Validate user migration

```bash
# Check structure
[ -f $BASE/INDEX.md ] && echo "✅ INDEX.md" || echo "❌ INDEX.md missing"
[ -d $BASE/topics ] && echo "✅ topics/" || echo "❌ topics/ missing"
[ -f $BASE/topics/identity.md ] && echo "✅ identity.md" || echo "❌ identity.md missing"
[ -f $BASE/topics/context.md ] && echo "✅ context.md" || echo "❌ context.md missing"

# Check INDEX.md size
LINES=$(wc -l < $BASE/INDEX.md)
[ $LINES -le 200 ] && echo "✅ INDEX.md $LINES lines (≤200)" || echo "❌ INDEX.md too long: $LINES lines"

# Check nothing was lost (rough content check)
OLD_WORDS=$(wc -w < ~/.openclaw/workspace/MEMORY.md 2>/dev/null || echo 0)
NEW_WORDS=$(cat $BASE/topics/*.md | wc -w)
echo "Content words: $OLD_WORDS (old) → $NEW_WORDS (new topics)"
```

---

## Step 4: Migrate Household/Shared

```bash
HH=~/.openclaw/workspace/memory/shared/household
mkdir -p $HH/topics

# Create topic files
for topic in logistics services decisions; do
  cat > $HH/topics/$topic.md << EOF
<!-- AUTO-MANAGED: Updated by consolidation agent -->

# Household $(echo $topic | sed 's/./\U&/')

EOF
done

# Seed from existing files
[ -f $HH/HOUSEHOLD.md ] && cat $HH/HOUSEHOLD.md >> $HH/topics/logistics.md
[ -f $HH/schedules.md ] && cat $HH/schedules.md >> $HH/topics/logistics.md
[ -f $HH/services.md ] && cat $HH/services.md >> $HH/topics/services.md

# Create INDEX.md
cat > $HH/INDEX.md << 'EOF'
<!-- AUTO-MANAGED: Updated by consolidation agent -->
<!-- MAX 200 LINES -->

# Household Memory Index

- [household] Shared logistics, schedules → topics/logistics.md
- [household] Services and subscriptions → topics/services.md
- [household] Household decisions → topics/decisions.md
EOF
```

---

## Step 5: Slim Root MEMORY.md

The root MEMORY.md becomes a navigation index to per-user indexes:

```markdown
<!-- AUTO-MANAGED: Root index — points to per-user memory -->

# Memory Index — Root

## Users

- Rich (primary) → memory/personal/rich/INDEX.md
- Dana → memory/personal/dana/INDEX.md
- Terry → memory/personal/terry/INDEX.md
- Household → memory/shared/household/INDEX.md

## System

- Context graph: localhost:8300
- Consolidation: scripts/consolidation-prompt.md (runs Sunday 02:00 PT)
```

---

## Step 6: Update openclaw.json Agent Configs

For each agent that has a `memoryFile` config (or should have one), update to point to the new per-user INDEX.md:

```json
{
  "agents": {
    "glados-dana": { "memoryFile": "memory/personal/dana/INDEX.md" },
    "glados-terry": { "memoryFile": "memory/personal/terry/INDEX.md" },
    "glados-household": { "memoryFile": "memory/shared/household/INDEX.md" }
  }
}
```

Use `openclaw config set` or edit directly — verify with `openclaw doctor` afterward.

---

## Step 7: Produce Migration Report

```
## Migration Report — <timestamp>

### Users Migrated
- rich: ✅ INDEX.md (47 lines), 8 topic files, 23 daily logs
- dana: ✅ INDEX.md (12 lines), 4 topic files, 0 daily logs
- terry: ✅ INDEX.md (8 lines), 4 topic files, 0 daily logs
- household: ✅ INDEX.md (6 lines), 3 topic files

### Content Preserved
- Root MEMORY.md: 200 lines → split across 8 topic files (2,400 words)
- Daily logs: 23 files preserved, 5 archived (>30 days)

### Backup Location
~/.openclaw/workspace/memory.backup-pre-sybilclaw-20260403-134200/

### Restore Command
cp -r ~/.openclaw/workspace/memory.backup-pre-sybilclaw-20260403-134200/ ~/.openclaw/workspace/memory/

### Next Steps
1. Run `openclaw doctor` to verify config
2. Restart gateway: `openclaw gateway restart`
3. Test: send a message and verify memory loads correctly
4. Run `adduser` skill to onboard additional users
```

---

## GOTCHAS

- ❌ **Never delete the original MEMORY.md before verifying topics/ content is complete** — backup first, always
- ❌ **Don't run migration while gateway is actively handling messages** — pick a quiet window
- ❌ **Don't merge household content into any personal user's files** — isolation is the whole point
- ❌ **INDEX.md must be pointers only** — if you find yourself copying paragraphs of content into INDEX.md, stop; it belongs in a topic file
- ❌ **Don't auto-update preferences.md** — that file is human-curated; migration should preserve it verbatim, not rewrite it
- ⚠️ **Large MEMORY.md files (>500 lines) should be split carefully** — run the migration, then manually review the split before deleting the original

---

## Maintenance

Re-evaluate this skill when:

- SybilClaw memory structure changes (new topic types, new user roles)
- OpenClaw config schema changes (memoryFile key names, agent config format)
- After any migration, collect feedback and update the GOTCHAS section

Update `last_reviewed` in frontmatter after each review.
