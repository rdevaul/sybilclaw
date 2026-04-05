---
summary: "Migrate an existing OpenClaw installation to SybilClaw"
read_when:
  - You have a working OpenClaw install and want to switch to SybilClaw
  - You want per-user memory isolation without starting from scratch
  - You are upgrading a single-user setup to support multiple household members
title: "Migrating to SybilClaw"
---

# Migrating to SybilClaw

SybilClaw is a fork of OpenClaw that adds per-user memory isolation, tiered shared context, and multi-agent household support. This guide walks you through converting an existing OpenClaw installation.

<Note>
SybilClaw is a drop-in replacement. Your existing config, credentials, sessions, and channel logins carry over unchanged. The migration is additive — you are adding structure, not replacing what works.
</Note>

## What Changes

| Feature         | OpenClaw           | SybilClaw                                 |
| --------------- | ------------------ | ----------------------------------------- |
| Binary name     | `openclaw`         | `sybilclaw` (also aliased as `openclaw`)  |
| Config file     | `openclaw.json`    | `sybilclaw.json`                          |
| Agent memory    | Single `MEMORY.md` | Per-agent `memoryFile` config             |
| Memory paths    | Unrestricted       | Optional `memoryAllowedPaths` enforcement |
| Multi-user      | Manual workaround  | First-class per-agent isolation           |
| State directory | `~/.openclaw/`     | `~/.sybilclaw/`                           |

## Before You Start

Back up your current installation:

```bash
openclaw gateway stop
cd ~
tar -czf openclaw-backup-$(date +%Y%m%d).tgz .openclaw
```

Store the backup somewhere safe — it contains API keys, OAuth tokens, and channel credentials.

<Note>
SybilClaw uses `~/.sybilclaw/` as its state directory and `sybilclaw.json` as its config file. During first run, SybilClaw will automatically migrate your existing `~/.openclaw/` state (credentials, sessions, channel logins) into `~/.sybilclaw/`. Your original `~/.openclaw/` is left untouched.
</Note>

---

## Migration Steps

<Steps>

<Step title="Install SybilClaw">

Clone the SybilClaw repo and install:

```bash
git clone https://github.com/rdevaul/sybilclaw.git
cd sybilclaw
pnpm install
pnpm build
npm install -g .
```

Verify the install:

```bash
sybilclaw --version
openclaw --version   # should show same version — openclaw is a symlink
```

<Note>
SybilClaw ships as `sybilclaw` but installs an `openclaw` symlink so existing scripts, launchd plists, and systemd units keep working without changes.
</Note>
</Step>

<Step title="Restructure your workspace (single-user)">

If you are staying single-user, no workspace changes are required. SybilClaw is fully backward compatible — skip ahead to **Step 4**.

For multi-user setups, create the tiered directory structure:

```bash
cd ~/workspace   # or wherever your workspace is
mkdir -p memory/personal/{yourname}/daily
mkdir -p memory/shared/household
```

Move your existing `MEMORY.md` into your personal directory:

```bash
mv MEMORY.md memory/personal/yourname/MEMORY.md
```

<Tip>
Keep `SOUL.md`, `AGENTS.md`, `TOOLS.md`, and `IDENTITY.md` at the workspace root — these are shared by all agents.
</Tip>

For each additional user, create their memory file:

```bash
cat > memory/personal/alice/MEMORY.md << 'EOF'
# Alice's Memory

## Personal Context
- Name: Alice
- Timezone: US/Pacific

EOF
```

</Step>

<Step title="Update openclaw.json">

Open `~/.sybilclaw/sybilclaw.json` in your editor (created automatically on first run).

**Single-user setup** — add `memoryFile` to your main agent:

```json
{
  "agents": {
    "default": {
      "memoryFile": "memory/personal/yourname/MEMORY.md"
    }
  }
}
```

**Multi-user setup** — add an agent entry per user:

```json
{
  "agents": {
    "agent-alice": {
      "enabled": true,
      "memoryFile": "memory/personal/alice/MEMORY.md",
      "memoryAllowedPaths": ["memory/personal/alice/", "memory/shared/"],
      "channels": {
        "telegram": {
          "allowFrom": ["+1234567890"]
        }
      }
    },
    "agent-bob": {
      "enabled": true,
      "memoryFile": "memory/personal/bob/MEMORY.md",
      "memoryAllowedPaths": ["memory/personal/bob/", "memory/shared/"],
      "channels": {
        "telegram": {
          "allowFrom": ["+9876543210"]
        }
      }
    }
  }
}
```

See the [Multi-User Setup Guide](multi-user-setup.md) for full configuration options including `memoryAllowedPaths` and channel isolation.

</Step>

<Step title="Run doctor and restart">

SybilClaw's doctor command applies any config migrations and validates your setup:

```bash
sybilclaw doctor
sybilclaw gateway restart
sybilclaw status
```

Check that all channels show as connected and no errors appear in the doctor output.

</Step>

<Step title="Update service definitions (if applicable)">

If you run the gateway as a launchd (macOS) or systemd (Linux) service, update the binary path to point at `sybilclaw` — or leave it as `openclaw` if you are using the symlink.

**macOS launchd** — verify your plist still points at a valid binary:

```bash
which sybilclaw   # confirm install path
which openclaw    # should be the same path (symlink)
launchctl list | grep sybilclaw
```

If you need to update the plist:

```xml
<key>ProgramArguments</key>
<array>
    <string>/usr/local/bin/sybilclaw</string>
    <string>gateway</string>
    <string>run</string>
</array>
```

Reload after changes:

```bash
launchctl unload ~/Library/LaunchAgents/com.yourorg.sybilclaw.plist
launchctl load ~/Library/LaunchAgents/com.yourorg.sybilclaw.plist
```

</Step>

</Steps>

---

## Verification Checklist

After migration, confirm:

- [ ] `sybilclaw status` shows the gateway running
- [ ] All channels are still connected (no re-pairing needed)
- [ ] `sybilclaw doctor` reports no errors
- [ ] The dashboard shows existing sessions
- [ ] Each agent can access its own `MEMORY.md` (test with "what do you remember about me?")
- [ ] Agents cannot read each other's personal memory (if `memoryAllowedPaths` is configured)
- [ ] Shared workspace files (`SOUL.md`, `AGENTS.md`) are visible to all agents

---

## Common Issues

<AccordionGroup>

<Accordion title="openclaw command not found after install">
The `openclaw` symlink is created at install time. If it is missing:

```bash
ls -la $(which sybilclaw)                            # confirm sybilclaw is installed
ln -sf $(which sybilclaw) /usr/local/bin/openclaw    # recreate symlink
```

</Accordion>

<Accordion title="Agent loads wrong MEMORY.md">
SybilClaw falls back to the workspace root `MEMORY.md` if `memoryFile` is not set or the path does not exist. Check:

1. `memoryFile` is set correctly in `~/.sybilclaw/sybilclaw.json` for each agent
2. The file exists at the configured path (relative to workspace or absolute)
3. Run `sybilclaw doctor` — it will flag missing memory files
   </Accordion>

<Accordion title="memoryAllowedPaths silently blocks reads">
When `memoryAllowedPaths` is set, any memory file outside those prefixes is silently skipped (not an error). If an agent seems to be missing context:

1. Check `memoryAllowedPaths` includes the path to the shared files you expect
2. Verify `memory/shared/` is in the allowed paths if you use shared household context
3. Temporarily remove `memoryAllowedPaths` to confirm the file is readable, then re-add the correct prefix
   </Accordion>

<Accordion title="Sessions and history missing after migration">
Session history lives in `~/.sybilclaw/` — if you moved or renamed that directory during migration, point the gateway back at it:

```bash
SYBILCLAW_STATE_DIR=~/.sybilclaw sybilclaw gateway restart
```

Or set it permanently in your shell profile or launchd plist environment.
</Accordion>

<Accordion title="Channel logins lost (WhatsApp, Telegram, etc.)">
Channel credentials are stored in `~/.sybilclaw/credentials/`. If they were preserved during migration, channels should reconnect automatically. If not:

1. Run `sybilclaw doctor` — it will detect broken channel state
2. Re-authenticate only the affected channel (you do not need to redo all channels)
   </Accordion>

<Accordion title="Multi-user: agents can still read each other's memory">
`memoryAllowedPaths` must be explicitly configured per agent — it is not enforced by default (backward compatibility). Verify each agent entry in `~/.sybilclaw/sybilclaw.json` has its own `memoryAllowedPaths` array that excludes other users' directories.
</Accordion>

</AccordionGroup>

---

## Docker Deployments

If you are running OpenClaw via Docker, the SybilClaw image is available at:

```
ghcr.io/rdevaul/sybilclaw:latest
```

Replace the image tag in your `docker-compose.yml` or Kubernetes manifest. The container entrypoint is `openclaw` (symlinked from `sybilclaw`) so existing configs work unchanged.

Mount your state directory and workspace as before:

```yaml
volumes:
  - ~/.openclaw:/root/.openclaw
  - ~/workspace:/root/workspace
```

---

## Related Documentation

- [Multi-User Setup Guide](multi-user-setup.md) — Full per-user agent configuration
- [Context Graph Architecture](context-graph-architecture.md) — Tag-based context system
- [OpenClaw Migration Guide](/install/migrating) — Moving between machines (still applies)
- [OpenClaw Configuration Reference](https://docs.openclaw.ai/configuration) — Full config options
