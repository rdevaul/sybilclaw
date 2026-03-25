# Multi-User Setup Guide

SybilClaw extends OpenClaw with per-user memory isolation while maintaining a shared AI personality. This guide shows you how to configure multiple users with isolated memory files.

## What SybilClaw Adds

SybilClaw adds a single configuration option to OpenClaw: **`memoryFile`** per agent.

This enables:

- **One shared personality** (SOUL.md) across all users
- **Per-user memory** (separate MEMORY.md files) for each user
- **Isolated conversations** via per-user channel allowlists

## Tiered Memory Model

SybilClaw uses a tiered approach to context:

### System-Level (Shared)

These files are shared across all user agents:

- **SOUL.md** — AI personality, tone, interaction style
- **AGENTS.md** — Agent instructions and behavior
- **TOOLS.md** — Tool usage notes and patterns
- **IDENTITY.md** — Shared identity information

### Personal (Per-User)

Each user gets their own:

- **MEMORY.md** — Personal memory file with user-specific context
- **daily/** — Optional per-user daily logs or context

## Recommended Workspace Structure

```
workspace/
  SOUL.md          # shared AI personality
  AGENTS.md        # shared agent instructions
  TOOLS.md         # shared tool notes
  IDENTITY.md      # shared identity information
  memory/
    shared/        # team/household shared context (optional)
      projects.md
      contacts.md
    personal/
      alice/
        MEMORY.md  # Alice's personal memory
        daily/     # Alice's daily logs
      bob/
        MEMORY.md  # Bob's personal memory
        daily/     # Bob's daily logs
```

## Configuration Example

Here's an `openclaw.json` showing multiple agents with isolated memory:

```json
{
  "workspace": "~/workspace",
  "agents": {
    "agent-alice": {
      "enabled": true,
      "memoryFile": "memory/personal/alice/MEMORY.md",
      "channels": {
        "telegram": {
          "allowFrom": ["+1234567890"]
        }
      }
    },
    "agent-bob": {
      "enabled": true,
      "memoryFile": "memory/personal/bob/MEMORY.md",
      "channels": {
        "telegram": {
          "allowFrom": ["+9876543210"]
        }
      }
    }
  },
  "channels": {
    "telegram": {
      "enabled": true
    }
  }
}
```

### Configuration Notes

- **`memoryFile`** — Path to the user's MEMORY.md file (relative to workspace or absolute)
- **`allowFrom`** — Channel-specific allowlist ensures only the designated user can access their agent
- All agents still share SOUL.md, AGENTS.md, TOOLS.md, and IDENTITY.md from the workspace root

## Security Considerations

### Channel Isolation

Use `allowFrom` lists to prevent cross-user access:

```json
{
  "agents": {
    "agent-alice": {
      "channels": {
        "telegram": {
          "allowFrom": ["+1234567890"]
        },
        "discord": {
          "allowFrom": ["alice#1234"]
        }
      }
    }
  }
}
```

### File System Permissions

- Ensure each user's MEMORY.md directory has appropriate file permissions
- Consider using separate OS users for multi-tenant deployments
- Keep workspace root readable by all agents (for shared files)

## Service Naming Convention

When running multiple agents as system services (launchd, systemd, etc.), use descriptive service identifiers:

**Pattern:** `com.<yourorg>.<agentname>`

Examples:

- `com.example.agent-alice`
- `com.example.agent-bob`
- `com.household.agent-family`

### macOS launchd Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.example.agent-alice</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/openclaw</string>
        <string>gateway</string>
        <string>run</string>
        <string>--agent</string>
        <string>agent-alice</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

## Getting Started

### 1. Create Directory Structure

```bash
cd ~/workspace
mkdir -p memory/personal/{alice,bob}/daily
mkdir -p memory/shared
```

### 2. Create Personal Memory Files

```bash
# Alice's memory
cat > memory/personal/alice/MEMORY.md << 'EOF'
# Alice's Memory

## Personal Context
- Role: Developer
- Timezone: US/Pacific
- Preferences: Concise responses, code examples

## Current Projects
- Working on SybilClaw documentation

EOF

# Bob's memory
cat > memory/personal/bob/MEMORY.md << 'EOF'
# Bob's Memory

## Personal Context
- Role: Designer
- Timezone: US/Eastern
- Preferences: Visual examples, step-by-step guides

## Current Projects
- Redesigning homepage

EOF
```

### 3. Configure Agents

Update your `openclaw.json` with the multi-user configuration shown above.

### 4. Verify Setup

```bash
# Start gateway
openclaw gateway run

# Test Alice's agent
openclaw message send --agent agent-alice "Hello!"

# Test Bob's agent
openclaw message send --agent agent-bob "Hello!"
```

Each agent should have access to:

- Shared personality (SOUL.md)
- Their own personal memory (MEMORY.md)
- Their own conversation history

## Tips

- **Start simple** — Begin with one shared SOUL.md and minimal per-user MEMORY.md files
- **Iterate** — Add more shared context files (TOOLS.md, AGENTS.md) as needed
- **Monitor memory growth** — Personal MEMORY.md files can grow; consider archiving or summarizing periodically
- **Use shared context wisely** — Put household/team-wide information in `memory/shared/` and reference it from AGENTS.md

## Related Documentation

- [Context Graph Architecture](context-graph-architecture.md) — Tag-based context management system
- [OpenClaw Configuration Reference](https://docs.openclaw.ai/configuration) — Full config options
- [Agent Configuration](https://docs.openclaw.ai/agents) — Agent-specific settings
