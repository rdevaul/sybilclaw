# SybilClaw: Tiered Memory

SybilClaw supports two-tier memory per agent:

- **System memory** (`MEMORY.md` at workspace root) — shared context, always loaded
- **Personal memory** (agent `memoryFile` config) — user-specific context, loaded when configured

## Configuration

In `openclaw.json`:

```json
"agents": {
  "glados-rich":  { "memoryFile": "memory/personal/rich/MEMORY.md" },
  "glados-dana":  { "memoryFile": "memory/personal/dana/MEMORY.md" },
  "glados-terry": { "memoryFile": "memory/personal/terry/MEMORY.md" },
  "glados-lily":  { "memoryFile": "memory/personal/lily/MEMORY.md" }
}
```

## File Layout

```
workspace/
  MEMORY.md                          # System-level shared memory (all agents)
  memory/personal/
    rich/MEMORY.md                   # Rich's private context
    dana/MEMORY.md                   # Dana's private context
    terry/MEMORY.md                  # Terry's private context
    lily/MEMORY.md                   # Lily's private context
```

## Behavior

- Agents without `memoryFile` load only `MEMORY.md` (unchanged from OpenClaw)
- Agents with `memoryFile` load `MEMORY.md` first, then their personal file
- Missing personal file is silently skipped (no error)
