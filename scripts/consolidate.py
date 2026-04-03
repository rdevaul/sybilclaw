#!/usr/bin/env python3
"""
Memory Consolidation Script — Phase 2
Merges daily logs into topic files, generates JSONL archives,
maintains INDEX.md under 200-line cap, and tracks state.

Usage:
    python3 consolidate.py --workspace /path/to/workspace --user rich
    python3 consolidate.py --workspace /path/to/workspace --user rich --dry-run
    python3 consolidate.py --workspace /path/to/workspace --user rich --since 2026-03-01
"""

import argparse
import hashlib
import json
import logging
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

logger = logging.getLogger("consolidate")

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ConsolidationConfig:
    workspace: Path
    user: str
    dry_run: bool = False
    max_index_lines: int = 200
    archive_after_days: int = 90
    last_run_file: Optional[Path] = None
    since: Optional[datetime] = None  # override for first-run or manual


@dataclass
class DailyLogEntry:
    date: str       # YYYY-MM-DD
    path: Path
    content: str
    line_count: int


@dataclass
class TopicFile:
    name: str       # e.g., "projects.md"
    path: Path
    content: str
    category: str   # identity|feedback|context|references|projects|tools|etc.


@dataclass
class ConsolidationResult:
    user: str
    daily_logs_processed: int = 0
    topic_files_updated: list = field(default_factory=list)
    contradictions_resolved: list = field(default_factory=list)
    entries_pruned: int = 0
    index_lines_before: int = 0
    index_lines_after: int = 0
    jsonl_entries_created: int = 0
    errors: list = field(default_factory=list)


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

def get_daily_log_dir(config: ConsolidationConfig) -> Path:
    """Return the directory holding daily logs for the given user."""
    if config.user == "household":
        return config.workspace / "memory" / "shared"
    return config.workspace / "memory" / "personal" / config.user / "daily"


def get_topic_dir(config: ConsolidationConfig) -> Path:
    if config.user == "household":
        return config.workspace / "memory" / "shared" / "household" / "topics"
    return config.workspace / "memory" / "personal" / config.user / "topics"


def get_index_path(config: ConsolidationConfig) -> Path:
    if config.user == "rich":
        # Rich's index is rooted at MEMORY.md
        return config.workspace / "MEMORY.md"
    if config.user == "household":
        return config.workspace / "memory" / "shared" / "household" / "INDEX.md"
    return config.workspace / "memory" / "personal" / config.user / "INDEX.md"


def get_jsonl_dir(config: ConsolidationConfig) -> Path:
    return config.workspace / "memory" / "transcripts" / config.user


def get_archive_dir(config: ConsolidationConfig) -> Path:
    return get_daily_log_dir(config) / ".archive"


def get_lock_file(config: ConsolidationConfig) -> Path:
    return config.workspace / "memory" / f".consolidation-{config.user}.lock"


# ---------------------------------------------------------------------------
# State management
# ---------------------------------------------------------------------------

DEFAULT_STATE_FILE = ".consolidation-state.json"


def load_state(state_file: Path) -> dict:
    """Load consolidation state; return defaults if file doesn't exist."""
    if state_file and state_file.exists():
        try:
            return json.loads(state_file.read_text())
        except (json.JSONDecodeError, IOError) as e:
            logger.warning("Could not load state file %s: %s", state_file, e)
    return {"version": 1, "last_run": None, "per_user": {}}


def save_state(state: dict, state_file: Path, dry_run: bool = False) -> None:
    if dry_run:
        logger.info("[dry-run] Would save state to %s", state_file)
        return
    state_file.parent.mkdir(parents=True, exist_ok=True)
    tmp = state_file.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, indent=2, default=str))
    tmp.rename(state_file)


def get_last_run_for_user(state: dict, user: str) -> Optional[datetime]:
    per_user = state.get("per_user", {}).get(user, {})
    ts = per_user.get("last_consolidated")
    if ts:
        try:
            return datetime.fromisoformat(ts)
        except ValueError:
            pass
    return None


def sha256_of_file(path: Path) -> str:
    if not path.exists():
        return ""
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


# ---------------------------------------------------------------------------
# Phase A — Collect daily logs
# ---------------------------------------------------------------------------

DAILY_LOG_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\.md$")


def get_daily_logs_since(config: ConsolidationConfig, since: datetime) -> list:
    """Find all daily log files newer than *since* (not in .archive/)."""
    daily_dir = get_daily_log_dir(config)
    if not daily_dir.exists():
        logger.info("Daily log directory does not exist: %s", daily_dir)
        return []

    logs = []
    for path in sorted(daily_dir.glob("*.md")):
        m = DAILY_LOG_RE.match(path.name)
        if not m:
            continue
        date_str = m.group(1)
        try:
            file_date = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if file_date > since:
            content = path.read_text(encoding="utf-8")
            logs.append(DailyLogEntry(
                date=date_str,
                path=path,
                content=content,
                line_count=len(content.splitlines()),
            ))
    return logs


# ---------------------------------------------------------------------------
# Phase B — Read topic files
# ---------------------------------------------------------------------------

AUTO_MANAGED_HEADER = "<!-- AUTO-MANAGED: do not edit manually -->"

TOPIC_CATEGORIES = {
    "projects": "projects",
    "tools": "tools",
    "identity": "identity",
    "feedback": "feedback",
    "context": "context",
    "references": "references",
    "config": "config",
    "relationships": "relationships",
    "health": "health",
    "travel": "travel",
}


def infer_category(name: str) -> str:
    stem = Path(name).stem.lower()
    for key, cat in TOPIC_CATEGORIES.items():
        if key in stem:
            return cat
    return "general"


def read_topic_files(config: ConsolidationConfig) -> list:
    """Read all topic files for the user."""
    topic_dir = get_topic_dir(config)
    if not topic_dir.exists():
        logger.info("Topic directory does not exist: %s", topic_dir)
        return []

    topics = []
    for path in sorted(topic_dir.glob("*.md")):
        content = path.read_text(encoding="utf-8")
        topics.append(TopicFile(
            name=path.name,
            path=path,
            content=content,
            category=infer_category(path.name),
        ))
    return topics


def read_index(config: ConsolidationConfig) -> str:
    index_path = get_index_path(config)
    if index_path.exists():
        return index_path.read_text(encoding="utf-8")
    return ""


# ---------------------------------------------------------------------------
# Phase C — LLM merge
# ---------------------------------------------------------------------------

MERGE_SYSTEM_PROMPT = """\
You are a memory consolidation agent. Your job is to merge new daily log entries
into existing topic files.

RULES:
- Add new facts to the appropriate topic file
- If new info contradicts existing info, the newer info wins (log the conflict)
- Convert relative dates ("yesterday", "last week") to absolute (YYYY-MM-DD)
- Each topic file line should be a self-contained fact
- Keep the AUTO-MANAGED header on each file if it exists
- Maintain existing section headers within topic files
- Do NOT add speculative or inferred information
- If a fact doesn't fit any existing topic file, note it for a new topic
- Remove duplicate entries
- Prune entries that are clearly superseded by newer info

OUTPUT FORMAT:
Return a JSON object with this exact schema:
{
  "updated_topics": {
    "projects.md": "full updated content..."
  },
  "updated_index_entries": [
    "- [tag:value] Description → path/to/topic.md"
  ],
  "removed_index_entries": [],
  "conflicts": [
    {"topic": "config.md", "old": "old value", "new": "new value", "resolution": "Updated to newer"}
  ],
  "no_fit_facts": []
}

Only include topic files that actually need to be changed in updated_topics.
If nothing needs updating, return empty dicts/lists.
"""


def build_merge_prompt(
    daily_logs: list,
    topic_files: list,
    index: str,
    today: str,
) -> str:
    parts = [
        f"Today's date: {today}\n",
        "=== DAILY LOGS TO PROCESS ===\n",
    ]
    for log in daily_logs:
        parts.append(f"\n--- {log.date}.md ---\n{log.content}\n")

    parts.append("\n=== EXISTING TOPIC FILES ===\n")
    if topic_files:
        for tf in topic_files:
            parts.append(f"\n--- {tf.name} ---\n{tf.content}\n")
    else:
        parts.append("(no topic files yet — create as needed)\n")

    parts.append("\n=== CURRENT INDEX (excerpt) ===\n")
    parts.append(index[:3000] if index else "(no index yet)\n")

    parts.append("\n\nNow produce the JSON merge result following the OUTPUT FORMAT above.")
    return "".join(parts)


def call_llm_merge(
    daily_logs: list,
    topic_files: list,
    index: str,
    today: str,
) -> dict:
    """Call Anthropic API to perform the merge. Returns parsed JSON dict."""
    try:
        import anthropic  # type: ignore
    except ImportError:
        raise RuntimeError(
            "anthropic package not installed. Run: pip install anthropic"
        )

    prompt = build_merge_prompt(daily_logs, topic_files, index, today)
    client = anthropic.Anthropic()

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        system=MERGE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()

    # Strip markdown fences if present
    raw = re.sub(r"^```(?:json)?\s*\n", "", raw)
    raw = re.sub(r"\n```\s*$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("LLM returned malformed JSON: %s\nRaw response:\n%s", e, raw[:500])
        raise


def merge_daily_into_topics(
    daily_logs: list,
    topic_files: list,
    index: str,
    config: ConsolidationConfig,
) -> tuple:
    """
    Core merge logic. Calls LLM and returns
    (updated_topics, updated_index, conflicts).
    """
    today = datetime.now().strftime("%Y-%m-%d")
    merge_result = call_llm_merge(daily_logs, topic_files, index, today)

    # Apply LLM updates to TopicFile objects
    updated_map = merge_result.get("updated_topics", {})
    topic_dir = get_topic_dir(config)
    topic_dir.mkdir(parents=True, exist_ok=True)

    updated_topics = []
    existing_by_name = {tf.name: tf for tf in topic_files}

    for name, new_content in updated_map.items():
        if name in existing_by_name:
            tf = existing_by_name[name]
            updated = TopicFile(
                name=tf.name,
                path=tf.path,
                content=new_content,
                category=tf.category,
            )
        else:
            # New topic file
            new_path = topic_dir / name
            updated = TopicFile(
                name=name,
                path=new_path,
                content=new_content,
                category=infer_category(name),
            )
        updated_topics.append(updated)

    # Build updated index
    new_entries = merge_result.get("updated_index_entries", [])
    removed_entries = set(merge_result.get("removed_index_entries", []))
    updated_index = _update_index(index, new_entries, removed_entries, config.max_index_lines)

    conflicts = merge_result.get("conflicts", [])
    return updated_topics, updated_index, conflicts


def _update_index(
    current_index: str,
    new_entries: list,
    removed_entries: set,
    max_lines: int,
) -> str:
    """Apply entry changes to index, enforce line cap."""
    lines = current_index.splitlines(keepends=True) if current_index else []

    # Remove stale entries
    if removed_entries:
        lines = [l for l in lines if l.strip() not in removed_entries]

    # Append new entries
    for entry in new_entries:
        line = entry if entry.endswith("\n") else entry + "\n"
        if line not in lines:
            lines.append(line)

    # Enforce max_lines cap: prune oldest bullet entries from the bottom
    # Preserve headers (lines starting with #) and keep most recent entries
    if len(lines) > max_lines:
        # Simple strategy: keep first (header) lines + most recent entries
        non_header = [l for l in lines if not l.startswith("#")]
        headers = [l for l in lines if l.startswith("#")]
        excess = len(lines) - max_lines
        # Prune from non-header entries (oldest first = earliest in list)
        pruned = non_header[excess:]
        lines = headers + pruned

    return "".join(lines)


# ---------------------------------------------------------------------------
# Phase D — Atomic writes
# ---------------------------------------------------------------------------

def atomic_write_topics(
    updated_topics: list,
    updated_index: str,
    config: ConsolidationConfig,
) -> bool:
    """
    Write all changes atomically.
    Returns True on success, False if rolled back.
    """
    index_path = get_index_path(config)

    # 1. Save originals for rollback
    backups: dict = {}
    for topic in updated_topics:
        if topic.path.exists():
            backups[topic.path] = topic.path.read_text(encoding="utf-8")
        else:
            backups[topic.path] = None  # didn't exist

    if index_path.exists():
        backups[index_path] = index_path.read_text(encoding="utf-8")
    else:
        backups[index_path] = None

    tmp_files = []
    try:
        # 2. Write .tmp files
        for topic in updated_topics:
            topic.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = topic.path.with_suffix(".md.tmp")
            tmp.write_text(topic.content, encoding="utf-8")
            tmp_files.append((tmp, topic.path))

        if updated_index is not None:
            index_path.parent.mkdir(parents=True, exist_ok=True)
            index_tmp = index_path.with_suffix(".md.tmp")
            index_tmp.write_text(updated_index, encoding="utf-8")
            tmp_files.append((index_tmp, index_path))

        # 3. Atomic renames
        for tmp, dest in tmp_files:
            tmp.rename(dest)

        return True

    except Exception as e:
        logger.error("Write failed, rolling back: %s", e)
        # Clean up any .tmp files that remain
        for tmp, _ in tmp_files:
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass
        # Restore originals
        for path, original_content in backups.items():
            if original_content is not None:
                try:
                    path.write_text(original_content, encoding="utf-8")
                except OSError as re_err:
                    logger.error("Rollback failed for %s: %s", path, re_err)
            elif path.exists():
                # It was created by us and didn't exist before — remove it
                try:
                    path.unlink()
                except OSError:
                    pass
        return False


# ---------------------------------------------------------------------------
# Phase E/F — Archive daily logs
# ---------------------------------------------------------------------------

def archive_daily_logs(logs: list, config: ConsolidationConfig) -> None:
    """Move processed daily logs to daily/.archive/ (never deletes)."""
    archive_dir = get_archive_dir(config)
    if config.dry_run:
        logger.info("[dry-run] Would archive %d daily logs to %s", len(logs), archive_dir)
        return
    archive_dir.mkdir(parents=True, exist_ok=True)
    for log in logs:
        dest = archive_dir / log.path.name
        if dest.exists():
            # Don't overwrite; rename with timestamp suffix
            ts = datetime.now().strftime("%Y%m%dT%H%M%S")
            dest = archive_dir / f"{log.path.stem}-{ts}.md"
        log.path.rename(dest)
        logger.info("Archived %s → %s", log.path.name, dest)


# ---------------------------------------------------------------------------
# Phase G — JSONL generation
# ---------------------------------------------------------------------------

def _extract_facts_from_log(log: DailyLogEntry) -> list:
    """
    Extract bullet-point or notable facts from a daily log.
    Returns list of (summary, tags) tuples.
    """
    facts = []
    lines = log.content.splitlines()
    for line in lines:
        stripped = line.strip()
        # Pick up bullet points
        if stripped.startswith(("- ", "* ", "• ")):
            text = stripped[2:].strip()
            if len(text) > 10:  # skip trivial entries
                tags = _extract_tags(text)
                facts.append((text, tags))
    return facts


def _extract_tags(text: str) -> list:
    """Extract simple keywords as tags (hashtags or bracketed terms)."""
    tags = re.findall(r"#(\w+)", text)
    tags += re.findall(r"\[([^\]]+)\]", text)
    # Also add generic topic tags from keywords
    kw_map = {
        "memory": "memory-system",
        "sybilclaw": "sybilclaw",
        "openclaw": "openclaw",
        "project": "projects",
        "deploy": "deployment",
        "bug": "bugs",
        "fix": "fixes",
        "design": "design",
    }
    lower = text.lower()
    for kw, tag in kw_map.items():
        if kw in lower and tag not in tags:
            tags.append(tag)
    return tags


def generate_jsonl_entries(logs: list, config: ConsolidationConfig) -> list:
    """Convert daily log entries to JSONL-ready dicts."""
    entries = []
    for log in logs:
        facts = _extract_facts_from_log(log)
        # Use noon of the log date as a reasonable timestamp
        base_ts = datetime.fromisoformat(log.date).replace(
            hour=21, minute=0, second=0, tzinfo=timezone(timedelta(hours=-7))
        )
        for i, (summary, tags) in enumerate(facts):
            ts = base_ts + timedelta(minutes=i * 5)
            entries.append({
                "ts": ts.isoformat(),
                "user": config.user,
                "summary": summary,
                "tags": tags,
                "source": f"daily/{log.date}.md",
            })
    return entries


def write_jsonl_archive(entries: list, config: ConsolidationConfig) -> int:
    """Append JSONL entries to today's archive file. Returns count written."""
    if not entries:
        return 0
    if config.dry_run:
        logger.info("[dry-run] Would write %d JSONL entries", len(entries))
        return len(entries)

    jsonl_dir = get_jsonl_dir(config)
    jsonl_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    jsonl_path = jsonl_dir / f"{today}.jsonl"

    with open(jsonl_path, "a", encoding="utf-8") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    logger.info("Wrote %d JSONL entries to %s", len(entries), jsonl_path)
    return len(entries)


# ---------------------------------------------------------------------------
# Phase H — Consolidation report
# ---------------------------------------------------------------------------

def write_consolidation_report(result: ConsolidationResult, config: ConsolidationConfig) -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    report_name = f"consolidation-{today}.md"
    daily_dir = get_daily_log_dir(config)

    lines = [
        f"# Memory Consolidation Report — {today}\n\n",
        f"**User:** {result.user}\n",
        f"**Daily logs processed:** {result.daily_logs_processed}\n",
        f"**Topic files updated:** {', '.join(result.topic_files_updated) or 'none'}\n",
        f"**JSONL entries created:** {result.jsonl_entries_created}\n",
        f"**Index lines before/after:** {result.index_lines_before} → {result.index_lines_after}\n",
        f"**Entries pruned:** {result.entries_pruned}\n",
    ]

    if result.contradictions_resolved:
        lines.append("\n## Conflicts Resolved\n\n")
        for conflict in result.contradictions_resolved:
            lines.append(
                f"- **{conflict.get('topic', '?')}**: `{conflict.get('old', '')}` "
                f"→ `{conflict.get('new', '')}` ({conflict.get('resolution', '')})\n"
            )

    if result.errors:
        lines.append("\n## Errors\n\n")
        for err in result.errors:
            lines.append(f"- {err}\n")

    report_path = daily_dir / report_name
    if config.dry_run:
        logger.info("[dry-run] Would write consolidation report: %s", report_path)
        print("".join(lines))
        return

    daily_dir.mkdir(parents=True, exist_ok=True)
    report_path.write_text("".join(lines), encoding="utf-8")
    logger.info("Wrote consolidation report: %s", report_path)


# ---------------------------------------------------------------------------
# Lock file
# ---------------------------------------------------------------------------

def acquire_lock(config: ConsolidationConfig) -> bool:
    lock = get_lock_file(config)
    lock.parent.mkdir(parents=True, exist_ok=True)
    if lock.exists():
        # Check if stale (older than 2 hours)
        age = time.time() - lock.stat().st_mtime
        if age < 7200:
            logger.error("Lock file exists (age %.0fs): %s", age, lock)
            return False
        logger.warning("Removing stale lock file (age %.0fs)", age)
        lock.unlink()
    lock.write_text(str(os.getpid()))
    return True


def release_lock(config: ConsolidationConfig) -> None:
    lock = get_lock_file(config)
    if lock.exists():
        lock.unlink()


# ---------------------------------------------------------------------------
# Main consolidation orchestration
# ---------------------------------------------------------------------------

def consolidate_user(config: ConsolidationConfig, state: dict) -> ConsolidationResult:
    result = ConsolidationResult(user=config.user)

    # Determine cutoff date
    if config.since:
        since = config.since
    else:
        since = get_last_run_for_user(state, config.user)
        if since is None:
            # First run: process last 30 days
            since = datetime.now(tz=timezone.utc) - timedelta(days=30)
            logger.info("First run for %s — processing last 30 days", config.user)

    logger.info("Consolidating %s since %s", config.user, since.isoformat())

    # Phase A: Collect logs
    daily_logs = get_daily_logs_since(config, since)
    if not daily_logs:
        logger.info("No new daily logs for %s — skipping", config.user)
        return result

    result.daily_logs_processed = len(daily_logs)
    logger.info("Found %d daily logs to process", len(daily_logs))

    # Phase B: Read topic files + index
    topic_files = read_topic_files(config)
    index = read_index(config)
    result.index_lines_before = len(index.splitlines())

    # Phase C: LLM merge
    try:
        updated_topics, updated_index, conflicts = merge_daily_into_topics(
            daily_logs, topic_files, index, config
        )
    except Exception as e:
        logger.error("LLM merge failed: %s", e)
        result.errors.append(f"LLM merge failed: {e}")
        return result

    result.contradictions_resolved = conflicts
    result.topic_files_updated = [t.name for t in updated_topics]
    result.index_lines_after = len(updated_index.splitlines()) if updated_index else 0

    # Phase D: Atomic write
    if not config.dry_run:
        if not atomic_write_topics(updated_topics, updated_index, config):
            result.errors.append("Atomic write failed — rolled back")
            return result
    else:
        logger.info("[dry-run] Would update %d topic files", len(updated_topics))

    # Phase F: Archive daily logs
    archive_daily_logs(daily_logs, config)

    # Phase G: JSONL
    jsonl_entries = generate_jsonl_entries(daily_logs, config)
    result.jsonl_entries_created = write_jsonl_archive(jsonl_entries, config)

    # Phase H: Report
    write_consolidation_report(result, config)

    return result


def run_consolidation(config: ConsolidationConfig, state_file: Path) -> ConsolidationResult:
    """Top-level entry point: acquire lock, run, release, save state."""
    if not acquire_lock(config):
        raise RuntimeError(f"Another consolidation is running for {config.user}")

    state = load_state(state_file)

    try:
        result = consolidate_user(config, state)
    finally:
        release_lock(config)

    # Update state
    now_str = datetime.now(tz=timezone.utc).isoformat()
    if "per_user" not in state:
        state["per_user"] = {}
    state["per_user"][config.user] = {
        "last_consolidated": now_str,
        "daily_logs_processed": [
            # We can't easily get the original log list here after archiving,
            # but we can note the count
        ],
        "topic_files_hash": sha256_of_file(get_index_path(config)),
    }
    state["last_run"] = now_str

    save_state(state, state_file, dry_run=config.dry_run)

    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Memory consolidation — merge daily logs into topic files"
    )
    parser.add_argument("--workspace", required=True, help="Path to OpenClaw workspace")
    parser.add_argument("--user", required=True, help="User to consolidate (rich|dana|terry|household|...)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing")
    parser.add_argument("--since", help="Override start date (YYYY-MM-DD)")
    parser.add_argument(
        "--last-run-file",
        help="Path to .consolidation-state.json",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    workspace = Path(args.workspace).expanduser().resolve()
    state_file = (
        Path(args.last_run_file).expanduser()
        if args.last_run_file
        else workspace / "memory" / DEFAULT_STATE_FILE
    )

    since = None
    if args.since:
        since = datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc)

    config = ConsolidationConfig(
        workspace=workspace,
        user=args.user,
        dry_run=args.dry_run,
        last_run_file=state_file,
        since=since,
    )

    result = run_consolidation(config, state_file)

    if result.errors:
        print(f"Consolidation for {args.user} completed with errors:")
        for err in result.errors:
            print(f"  ERROR: {err}")
        sys.exit(1)
    else:
        print(
            f"Consolidation for {args.user} complete: "
            f"{result.daily_logs_processed} logs → "
            f"{len(result.topic_files_updated)} topics updated, "
            f"{result.jsonl_entries_created} JSONL entries"
        )


if __name__ == "__main__":
    main()
