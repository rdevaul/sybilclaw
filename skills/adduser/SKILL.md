---
name: adduser
description: >
  Onboard a new user to the SybilClaw multi-user memory system. Creates the correctly
  structured memory directory, typed topic files, INDEX.md, and patches openclaw.json
  with the new agent config. Use when: user says "add a new user", "onboard <name>",
  "create memory for <name>", "set up <name>'s agent". NOT for: migrating an existing
  workspace (use sybilmigration skill), or routine memory updates.
metadata:
  openclaw:
    emoji: "👤"
    last_reviewed: "2026-04-03"
---

# ADDUSER Skill

Onboards a new user to the SybilClaw multi-user memory system.

## TRIGGER

**Fire this skill when user says any of:**

- "add a new user"
- "onboard \<name\>"
- "create memory for \<name\>"
- "set up \<name\>'s agent"
- "add \<name\> to the system"
- "create a \<household/personal\> agent for \<name\>"

**Do NOT fire for:** migrating the whole workspace (use `sybilmigration`), or updating an existing user's memory.

---

## Step 1: Gather Info

Ask the user for (or infer from context):

1. **User name** — slug form (e.g., `dana`, `terry`, `garrett`) — used for directory names and agent IDs
2. **Display name** — full name for headings (e.g., "Dana DeVaul")
3. **User type** — `personal` or `household`
   - `personal` → creates under `memory/personal/<name>/`
   - `household` → creates under `memory/shared/<name>/`
4. **Telegram ID** (optional) — for routing config
5. **Brief description** — 1-2 sentences about who this person is (seeded into identity.md)
6. **Agent ID** — typically `glados-<name>` (confirm with user or use default)

Output a summary and confirm before proceeding:

```
Adding user:
  Slug: dana
  Display name: Dana DeVaul
  Type: personal
  Directory: memory/personal/dana/
  Agent ID: glados-dana
  Telegram ID: 900606288

Proceed? (yes/no)
```

---

## Step 2: Create Directory Structure

```bash
# Set variables
USER_SLUG="<slug>"
USER_TYPE="<personal|household>"
DISPLAY_NAME="<Display Name>"

if [ "$USER_TYPE" = "personal" ]; then
  BASE=~/.openclaw/workspace/memory/personal/$USER_SLUG
else
  BASE=~/.openclaw/workspace/memory/shared/$USER_SLUG
fi

# Create directories
mkdir -p $BASE/topics
mkdir -p $BASE/daily
mkdir -p $BASE/daily/.archive

echo "Created: $BASE"
```

---

## Step 3: Create Topic Files

### For personal users:

```bash
# identity.md
cat > $BASE/topics/identity.md << EOF
<!-- AUTO-MANAGED: Updated by consolidation agent. Manual edits may be overwritten. -->

# Identity — $DISPLAY_NAME

## Background
- Role: [to be filled]
- Location: [to be filled]

## Working Style
- [to be filled]
EOF

# context.md
cat > $BASE/topics/context.md << EOF
<!-- AUTO-MANAGED: Updated by consolidation agent. Manual edits may be overwritten. -->

# Context — $DISPLAY_NAME

## Current Priorities
- [to be filled]

## Active Projects
- [to be filled]
EOF

# preferences.md (HUMAN-CURATED — no auto-update)
cat > $BASE/topics/preferences.md << EOF
<!-- HUMAN-CURATED: Do not auto-update. This file is read-only for automated processes. -->

# Preferences — $DISPLAY_NAME

## Communication
- [to be filled]

## Response Style
- [to be filled]
EOF

# relationships.md
cat > $BASE/topics/relationships.md << EOF
<!-- AUTO-MANAGED: Updated by consolidation agent. Manual edits may be overwritten. -->

# Relationships — $DISPLAY_NAME

## Household
- [to be filled]
EOF

# references.md
cat > $BASE/topics/references.md << EOF
<!-- AUTO-MANAGED: Updated by consolidation agent. Manual edits may be overwritten. -->

# References — $DISPLAY_NAME

## Accounts & Services
- [to be filled]
EOF
```

### For household users:

```bash
# logistics.md
cat > $BASE/topics/logistics.md << EOF
<!-- AUTO-MANAGED: Updated by consolidation agent. Manual edits may be overwritten. -->

# Logistics — $DISPLAY_NAME

## Schedule
- [to be filled]

## Routines
- [to be filled]
EOF

# services.md
cat > $BASE/topics/services.md << EOF
<!-- AUTO-MANAGED: Updated by consolidation agent. Manual edits may be overwritten. -->

# Services — $DISPLAY_NAME

## Subscriptions
- [to be filled]
EOF

# decisions.md
cat > $BASE/topics/decisions.md << EOF
<!-- AUTO-MANAGED: Updated by consolidation agent. Manual edits may be overwritten. -->

# Decisions — $DISPLAY_NAME

## Household Decisions
- [to be filled]
EOF
```

---

## Step 4: Create INDEX.md

```bash
TODAY=$(date +%Y-%m-%d)

if [ "$USER_TYPE" = "personal" ]; then
cat > $BASE/INDEX.md << EOF
<!-- AUTO-MANAGED: Updated by consolidation agent -->
<!-- MAX 200 LINES — overflow triggers pruning -->

# Memory Index — $DISPLAY_NAME

*Last updated: $TODAY*

## Identity & Background
- [identity] $DISPLAY_NAME — see topics/identity.md for full profile → topics/identity.md

## Current Context
- [context] Active priorities and projects → topics/context.md

## Preferences
- [preferences] Communication and style preferences → topics/preferences.md

## Relationships
- [relationships] Key people and connections → topics/relationships.md

## References
- [references] External resources and accounts → topics/references.md
EOF
else
cat > $BASE/INDEX.md << EOF
<!-- AUTO-MANAGED: Updated by consolidation agent -->
<!-- MAX 200 LINES — overflow triggers pruning -->

# Memory Index — $DISPLAY_NAME

*Last updated: $TODAY*

## Logistics
- [household] Schedules, routines, coordination → topics/logistics.md

## Services
- [household] Services and subscriptions → topics/services.md

## Decisions
- [household] Household decisions → topics/decisions.md
EOF
fi
```

---

## Step 5: Patch openclaw.json Agent Config

Read the existing `~/.openclaw/openclaw.json` and add the new agent:

```json
{
  "agents": {
    "glados-<slug>": {
      "id": "glados-<slug>",
      "label": "<Display Name>",
      "memoryFile": "memory/personal/<slug>/INDEX.md",
      "model": "anthropic/claude-sonnet-4-6"
    }
  }
}
```

If Telegram ID was provided, also add a binding:

```json
{
  "bindings": [
    {
      "peer": { "kind": "direct", "id": "<telegram_id>" },
      "agent": "glados-<slug>"
    }
  ]
}
```

Use `openclaw config set` where possible, or edit directly and run `openclaw doctor` to validate.

---

## Step 6: Validate

```bash
USER_SLUG="<slug>"
BASE=~/.openclaw/workspace/memory/personal/$USER_SLUG

echo "=== Validation ==="
[ -f $BASE/INDEX.md ] && echo "✅ INDEX.md" || echo "❌ INDEX.md missing"
[ -d $BASE/topics ] && echo "✅ topics/" || echo "❌ topics/ missing"

for f in identity context preferences relationships references; do
  [ -f $BASE/topics/$f.md ] && echo "✅ topics/$f.md" || echo "❌ topics/$f.md missing"
done

LINES=$(wc -l < $BASE/INDEX.md)
[ $LINES -le 200 ] && echo "✅ INDEX.md $LINES lines" || echo "❌ INDEX.md too long ($LINES lines)"

# Verify agent in config
openclaw doctor 2>&1 | grep -i "error\|warn" | grep -v "^$" || echo "✅ openclaw doctor clean"
```

---

## Step 7: Completion Report

```
## New User Added: <Display Name>

### Created Files
- memory/personal/<slug>/INDEX.md (6 lines)
- memory/personal/<slug>/topics/identity.md
- memory/personal/<slug>/topics/context.md
- memory/personal/<slug>/topics/preferences.md
- memory/personal/<slug>/topics/relationships.md
- memory/personal/<slug>/topics/references.md
- memory/personal/<slug>/daily/ (empty, ready for logs)

### Agent Config
- Agent ID: glados-<slug>
- Memory file: memory/personal/<slug>/INDEX.md
- Telegram binding: <id or 'not configured'>

### Next Steps
1. Edit topics/preferences.md with <Display Name>'s communication preferences
2. Edit topics/identity.md with their background
3. Restart gateway: `openclaw gateway restart`
4. Test: have <Display Name> send a message and verify routing works
5. If they have existing memory files to import, run `sybilmigration` for this user
```

---

## GOTCHAS

- ❌ **Don't use spaces or caps in the user slug** — directories and agent IDs must be lowercase slugs (`dana` not `Dana`)
- ❌ **Don't skip the Telegram binding** if the user will message the system — without it, their messages route to the wrong agent
- ❌ **preferences.md is HUMAN-CURATED** — remind the user to fill it in manually after creation; don't auto-generate it from guesses
- ❌ **Don't create memory/personal/<name>/ for a household entity** — household agents live under memory/shared/<name>/
- ⚠️ **Agent ID must match openclaw.json** exactly — `glados-dana` in bindings must match `glados-dana` in agents config
- ⚠️ **Run `openclaw doctor` after editing openclaw.json** — config validation catches field-name typos before they cause routing failures

---

## Maintenance

Re-evaluate this skill when:

- New topic types are added to the standard memory structure
- openclaw.json agent config schema changes
- Telegram binding format changes
- A new user type is introduced (e.g., "guest", "organization")

Update `last_reviewed` in frontmatter after each review.
