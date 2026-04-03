# Phase 2 Requirements — JSONL Archive + Consolidation Cron

## R1: JSONL Transcript Archive

- Create `memory/transcripts/` directory if not present
- Write one JSONL line per session at session-end or heartbeat trigger
- Format: `{"ts": "ISO8601", "user": "rich", "summary": "...", "tags": [...], "session_id": "..."}`
- File naming: `memory/transcripts/YYYY-MM-DD.jsonl` (one per day, append-only)
- **Test:** Write a test entry, read it back, assert all fields present and valid JSON

## R2: Consolidation Cron Job

- Create launchd plist at `~/Library/LaunchAgents/com.glados.memory-consolidation.plist`
- Schedule: daily at 02:00 local time
- Runs an isolated subagent with consolidation prompt (not main session)
- Logs stdout/stderr to `/tmp/memory-consolidation.log`
- **Test:** `launchctl load --dry-run ~/Library/LaunchAgents/com.glados.memory-consolidation.plist` exits 0
