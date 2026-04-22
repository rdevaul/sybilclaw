# Skill Dispatch Framework

SybilClaw's per-user skill system controls which capabilities each agent has access to. This isn't a security boundary — it's a dispatch accuracy optimization. Fewer skills in context means the agent makes better routing decisions and wastes fewer tokens scanning irrelevant skill descriptions.

## Overview

Every SybilClaw agent receives a set of **skills** — markdown instruction files that teach it how to handle specific domains (CAD design, 3D printing, project management, etc.). The system supports dozens of skills, but loading all of them into every agent's context degrades performance:

- The `<available_skills>` block in the system prompt grows large, consuming tokens
- The agent wastes time pattern-matching against irrelevant skills
- Ambiguous routing becomes more common with more candidates

The solution: **per-agent skill allowlists** that reduce each agent to the skills they actually need.

## How Skills Are Resolved

Skill resolution follows a three-layer precedence model:

```
System Defaults → Agent Allow/Deny → Final Skill Set
```

### Layer 1: System Defaults

Configured in `openclaw.json` under `skills.defaults`:

```json
{
  "skills": {
    "defaults": ["weather", "github", "discord", "coding-agent", "session-logs", "dispatcher"]
  }
}
```

These skills are available to **all agents** unless explicitly denied or overridden via `noDefaults`.

### Layer 2: Agent Configuration

Each agent in `agents.list[]` can have a `skills` field:

```json
{
  "id": "jarvis-rich",
  "skills": {
    "allow": ["rocket-design", "yapcad", "print-farm", "voron"],
    "deny": ["food-order"],
    "noDefaults": false
  }
}
```

- **`allow`** — Skills added ON TOP of system defaults
- **`deny`** — Skills removed, even if they're in defaults. Deny always wins.
- **`noDefaults`** — If `true`, system defaults are skipped entirely; only `allow` skills are loaded

### Layer 3: Resolution

The final skill set is computed as:

```
if noDefaults:
  final = allow - deny
else:
  final = (defaults + allow) - deny
```

### The `AgentSkillsConfig` Schema

```typescript
type AgentSkillsConfig = {
  allow?: string[]; // Skills to ADD beyond system defaults
  deny?: string[]; // Skills to REMOVE (deny wins over allow)
  noDefaults?: boolean; // Skip system defaults entirely
};
```

#### Legacy Format

Older configs may use a plain `string[]` for the `skills` field:

```json
{ "id": "agent-1", "skills": ["weather", "github"] }
```

This is treated as `{ allow: ["weather", "github"] }`. The `/skills enable` and `/skills disable` commands automatically convert legacy format to `AgentSkillsConfig` when mutating.

## The `/skills` Command

Users can inspect and modify their agent's skill set in real-time via chat commands.

### `/skills` or `/skills list`

Shows the agent's active skills, categorized by source:

```
📋 Active Skills for jarvis-rich

System defaults (6):
  coding-agent, discord, dispatcher, github, session-logs, weather

Agent additions (4):
  print-farm, rocket-design, voron, yapcad

Denied: (none)

Total: 10 active skills
```

### `/skills all`

Shows all installed skills with enabled/disabled status:

```
📋 All Installed Skills (35 total, 10 active for jarvis-rich)

✅ coding-agent (default)
❌ conforming-shell (not in allow list)
✅ discord (default)
✅ dispatcher (default)
❌ generative-design (not in allow list)
✅ github (default)
✅ print-farm (agent allow)
✅ rocket-design (agent allow)
...
```

### `/skills enable <name>`

Adds a skill to the agent's `allow` list. If the skill was previously denied, removes it from deny too.

```
/skills enable generative-design
→ ✅ Enabled skill generative-design for jarvis-rich
```

The config file is mutated atomically and the gateway hot-reloads within ~300ms.

### `/skills disable <name>`

Adds a skill to the agent's `deny` list. If the skill was previously in allow, removes it.

```
/skills disable weather
→ ✅ Disabled skill weather for jarvis-rich
```

### `/skills reset`

Removes all per-agent skill overrides, reverting to system defaults only.

```
/skills reset
→ ✅ Reset skills for jarvis-rich to system defaults
```

### Validation

- Skill names are validated against installed workspace skills
- Unknown names return: `❌ Unknown skill: **foo** — run /skills all to see available skills`
- Only authorized senders (channel owner / bound user) can modify skills

## The Dispatcher Skill

The **dispatcher** is a workspace skill that acts as an intelligent routing table. When the agent isn't sure which skill to load for a request, the dispatcher provides a lookup table mapping natural language triggers to specific skills.

### User-Aware Routing

The dispatcher is aware that each agent has a different skill set. Before routing to a skill from its table, it checks whether that skill appears in the agent's `<available_skills>` block. If it doesn't:

> "The **rocket-design** skill would handle this, but it's not enabled for you. Run `/skills enable rocket-design` to add it."

This prevents routing failures and teaches users how to self-serve.

### How It Works

1. The agent receives a user request
2. If unsure which skill to use, the agent consults the dispatcher's routing table
3. The dispatcher matches the request against trigger phrases
4. **Before loading:** the agent checks its own `<available_skills>`
5. If the matched skill is available → load it and proceed
6. If not available → inform the user and suggest `/skills enable`

### Routing Table Structure

The dispatcher organizes skills into categories with trigger phrases:

| Category           | Example Skills                                   |
| ------------------ | ------------------------------------------------ |
| CAD / Geometry     | rocket-design, generative-design, yapcad-splines |
| Analysis           | yapcad-fea, yapcad-swarm                         |
| Manufacturing      | print-farm, voron, yapcad-mcmaster               |
| Rendering          | dml-render                                       |
| Project Management | openproject, wbs-control                         |
| Infrastructure     | local-llm, agent-bridge                          |

## Skill Chaining

Complex tasks often require multiple skills in sequence. The dispatcher documents common chains:

| Pattern                     | Skill Sequence                             |
| --------------------------- | ------------------------------------------ |
| Design → Preview → Print    | rocket-design → dml-render → print-farm    |
| Design → FEA → Iterate      | rocket-design → yapcad-fea → rocket-design |
| Source hardware → Integrate | yapcad-mcmaster → rocket-design            |
| Print → Troubleshoot        | print-farm → voron                         |

When chaining, each skill is loaded one at a time. For heavy multi-step work, spawn sub-agents for each skill in the chain — don't try to hold all skills in context simultaneously.

## Configuration Reference

### System-Level Skills Config

Located in `openclaw.json` under the top-level `skills` key:

```json
{
  "skills": {
    "defaults": ["weather", "github", "discord", "coding-agent", "session-logs", "dispatcher"],
    "allowBundled": ["healthcheck", "mcporter", "skill-creator", "..."],
    "install": { "nodeManager": "npm" }
  }
}
```

- **`defaults`** — Skills available to all agents by default
- **`allowBundled`** — Bundled (built-in) skills that are allowed to be loaded. Workspace skills don't need to be listed here.

### Per-Agent Skills Config

Located in `openclaw.json` under `agents.list[].skills`:

```json
{
  "agents": {
    "list": [
      {
        "id": "jarvis-rich",
        "skills": {
          "allow": ["rocket-design", "yapcad", "print-farm"],
          "deny": [],
          "noDefaults": false
        }
      },
      {
        "id": "jarvis-jeremy",
        "skills": {
          "allow": ["local-llm", "healthcheck"],
          "noDefaults": false
        }
      },
      {
        "id": "jarvis-yang",
        "skills": {
          "allow": ["rocket-design", "openproject"],
          "noDefaults": false
        }
      }
    ]
  }
}
```

### Full Example: Restricted Agent

An agent that gets ONLY specific skills, no defaults:

```json
{
  "id": "jarvis-intern",
  "skills": {
    "allow": ["weather", "github"],
    "noDefaults": true
  }
}
```

### Full Example: Agent with Denied Skills

An agent that gets all defaults except one:

```json
{
  "id": "jarvis-focused",
  "skills": {
    "deny": ["weather"]
  }
}
```

## Best Practices

### Recommended Defaults

Keep the defaults list small — skills that genuinely every agent needs:

- `weather` — Universal utility
- `github` — Code-aware agents
- `discord` — Channel operations
- `coding-agent` — Sub-agent delegation
- `session-logs` — Session analysis
- `dispatcher` — Intelligent routing

### Onboarding New Users

1. Create an agent entry in `agents.list[]` with a binding
2. Start with system defaults only (no `skills` field)
3. Let the user discover and enable skills via `/skills all` + `/skills enable`
4. Or pre-configure a skill set based on their role

### Auditing Skill Coverage

Use `/skills all` to audit what each agent sees. Compare across agents:

```
# In each user's DM:
/skills all
```

Look for:

- **Missing skills** — User can't access a tool they need
- **Excess skills** — Agent has skills it never uses (wasted context tokens)
- **Denied skills** — Intentional? Or leftover from debugging?

### Role-Based Templates

Consider defining skill profiles by role:

| Role            | Skills (beyond defaults)                                             |
| --------------- | -------------------------------------------------------------------- |
| CAD Engineer    | rocket-design, yapcad, yapcad-splines, generative-design, dml-render |
| Manufacturing   | print-farm, voron, yapcad-mcmaster                                   |
| Project Manager | openproject, wbs-control                                             |
| Infrastructure  | local-llm, healthcheck, mcporter                                     |
| Full Stack      | All of the above                                                     |

## Related Documentation

- [Multi-User Setup](multi-user-setup.md) — Per-user memory and agent binding
- [Dispatcher SKILL.md](../../.sybilclaw/workspace-jarvis/skills/dispatcher/SKILL.md) — The routing table itself
