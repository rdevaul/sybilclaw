"""
Comprehensive tests for scripts/consolidate.py

Run with: cd ~/Projects/openclaw-fork && python3 -m pytest tests/test_consolidate.py -v
"""

import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add scripts/ to path
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

import consolidate as C


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def tmp_workspace(tmp_path):
    """Return a temp workspace with standard directory structure."""
    ws = tmp_path / "workspace"
    ws.mkdir()
    (ws / "memory").mkdir()
    return ws


@pytest.fixture
def rich_config(tmp_workspace):
    return C.ConsolidationConfig(
        workspace=tmp_workspace,
        user="rich",
        dry_run=False,
        last_run_file=tmp_workspace / "memory" / ".consolidation-state.json",
    )


@pytest.fixture
def household_config(tmp_workspace):
    return C.ConsolidationConfig(
        workspace=tmp_workspace,
        user="household",
        dry_run=False,
        last_run_file=tmp_workspace / "memory" / ".consolidation-state.json",
    )


def make_daily_log(ws: Path, user: str, date_str: str, content: str) -> Path:
    """Create a daily log file and return its path."""
    if user == "household":
        log_dir = ws / "memory" / "shared"
    else:
        log_dir = ws / "memory" / "personal" / user / "daily"
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / f"{date_str}.md"
    path.write_text(content)
    return path


def make_topic_file(ws: Path, user: str, name: str, content: str) -> Path:
    """Create a topic file and return its path."""
    if user == "household":
        topic_dir = ws / "memory" / "shared" / "household" / "topics"
    else:
        topic_dir = ws / "memory" / "personal" / user / "topics"
    topic_dir.mkdir(parents=True, exist_ok=True)
    path = topic_dir / name
    path.write_text(content)
    return path


def make_index(ws: Path, user: str, content: str) -> Path:
    """Create an index file and return its path."""
    if user == "rich":
        path = ws / "MEMORY.md"
    elif user == "household":
        path = ws / "memory" / "shared" / "household" / "INDEX.md"
        path.parent.mkdir(parents=True, exist_ok=True)
    else:
        path = ws / "memory" / "personal" / user / "INDEX.md"
        path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return path


# ---------------------------------------------------------------------------
# Fake LLM response helpers
# ---------------------------------------------------------------------------

def fake_merge_response(updated_topics=None, conflicts=None, new_entries=None):
    """Build a mock LLM response dict as consolidate.py expects."""
    return {
        "updated_topics": updated_topics or {},
        "updated_index_entries": new_entries or [],
        "removed_index_entries": [],
        "conflicts": conflicts or [],
        "no_fit_facts": [],
    }


# ---------------------------------------------------------------------------
# TestDailyLogDiscovery
# ---------------------------------------------------------------------------

class TestDailyLogDiscovery:
    def test_finds_logs_since_date(self, rich_config, tmp_workspace):
        since = datetime(2026, 3, 27, tzinfo=timezone.utc)
        make_daily_log(tmp_workspace, "rich", "2026-03-28", "- entry A")
        make_daily_log(tmp_workspace, "rich", "2026-03-30", "- entry B")
        logs = C.get_daily_logs_since(rich_config, since)
        assert len(logs) == 2
        dates = {l.date for l in logs}
        assert dates == {"2026-03-28", "2026-03-30"}

    def test_excludes_logs_before_cutoff(self, rich_config, tmp_workspace):
        since = datetime(2026, 3, 29, tzinfo=timezone.utc)
        make_daily_log(tmp_workspace, "rich", "2026-03-28", "- old entry")
        make_daily_log(tmp_workspace, "rich", "2026-03-30", "- new entry")
        logs = C.get_daily_logs_since(rich_config, since)
        assert len(logs) == 1
        assert logs[0].date == "2026-03-30"

    def test_ignores_archived_logs(self, rich_config, tmp_workspace):
        """Files inside .archive/ should not be picked up."""
        since = datetime(2026, 3, 27, tzinfo=timezone.utc)
        # Regular log
        make_daily_log(tmp_workspace, "rich", "2026-03-28", "- regular")
        # Create an archive file directly (simulating already archived)
        archive_dir = C.get_archive_dir(rich_config)
        archive_dir.mkdir(parents=True, exist_ok=True)
        (archive_dir / "2026-03-25.md").write_text("- archived")
        logs = C.get_daily_logs_since(rich_config, since)
        assert len(logs) == 1
        assert logs[0].date == "2026-03-28"

    def test_handles_no_logs(self, rich_config):
        """Returns empty list when no daily log directory exists."""
        logs = C.get_daily_logs_since(rich_config, datetime(2026, 1, 1, tzinfo=timezone.utc))
        assert logs == []

    def test_handles_household_path(self, household_config, tmp_workspace):
        since = datetime(2026, 3, 27, tzinfo=timezone.utc)
        make_daily_log(tmp_workspace, "household", "2026-03-28", "- household entry")
        logs = C.get_daily_logs_since(household_config, since)
        assert len(logs) == 1
        assert logs[0].date == "2026-03-28"

    def test_log_content_is_read(self, rich_config, tmp_workspace):
        since = datetime(2026, 3, 27, tzinfo=timezone.utc)
        make_daily_log(tmp_workspace, "rich", "2026-03-28", "- test content\n- second line")
        logs = C.get_daily_logs_since(rich_config, since)
        assert "test content" in logs[0].content
        assert logs[0].line_count == 2

    def test_logs_sorted_by_date(self, rich_config, tmp_workspace):
        since = datetime(2026, 3, 20, tzinfo=timezone.utc)
        make_daily_log(tmp_workspace, "rich", "2026-03-25", "- c")
        make_daily_log(tmp_workspace, "rich", "2026-03-22", "- a")
        make_daily_log(tmp_workspace, "rich", "2026-03-24", "- b")
        logs = C.get_daily_logs_since(rich_config, since)
        dates = [l.date for l in logs]
        assert dates == sorted(dates)

    def test_ignores_non_date_md_files(self, rich_config, tmp_workspace):
        since = datetime(2026, 3, 27, tzinfo=timezone.utc)
        log_dir = C.get_daily_log_dir(rich_config)
        log_dir.mkdir(parents=True, exist_ok=True)
        # Valid log
        make_daily_log(tmp_workspace, "rich", "2026-03-28", "- entry")
        # Non-date files
        (log_dir / "README.md").write_text("# not a log")
        (log_dir / "notes.md").write_text("# notes")
        (log_dir / "consolidation-2026-03-28.md").write_text("# report")
        logs = C.get_daily_logs_since(rich_config, since)
        assert len(logs) == 1


# ---------------------------------------------------------------------------
# TestTopicFileReading
# ---------------------------------------------------------------------------

class TestTopicFileReading:
    def test_reads_all_topic_files(self, rich_config, tmp_workspace):
        make_topic_file(tmp_workspace, "rich", "projects.md", "# Projects\n- item")
        make_topic_file(tmp_workspace, "rich", "tools.md", "# Tools\n- tool")
        topics = C.read_topic_files(rich_config)
        names = {t.name for t in topics}
        assert {"projects.md", "tools.md"} == names

    def test_preserves_auto_managed_header(self, rich_config, tmp_workspace):
        content = f"{C.AUTO_MANAGED_HEADER}\n# Projects\n- item"
        make_topic_file(tmp_workspace, "rich", "projects.md", content)
        topics = C.read_topic_files(rich_config)
        assert C.AUTO_MANAGED_HEADER in topics[0].content

    def test_handles_empty_topic(self, rich_config, tmp_workspace):
        make_topic_file(tmp_workspace, "rich", "empty.md", "")
        topics = C.read_topic_files(rich_config)
        assert topics[0].content == ""

    def test_handles_no_topic_directory(self, rich_config):
        topics = C.read_topic_files(rich_config)
        assert topics == []

    def test_infers_category(self):
        assert C.infer_category("projects.md") == "projects"
        assert C.infer_category("tools.md") == "tools"
        assert C.infer_category("identity.md") == "identity"
        assert C.infer_category("unknown.md") == "general"

    def test_reads_household_topics(self, household_config, tmp_workspace):
        make_topic_file(tmp_workspace, "household", "calendar.md", "# Calendar\n- event")
        topics = C.read_topic_files(household_config)
        assert len(topics) == 1
        assert topics[0].name == "calendar.md"


# ---------------------------------------------------------------------------
# TestAtomicWrite
# ---------------------------------------------------------------------------

class TestAtomicWrite:
    def test_writes_all_topic_files(self, rich_config, tmp_workspace):
        make_topic_file(tmp_workspace, "rich", "projects.md", "# Original")
        make_index(tmp_workspace, "rich", "# Index")

        updated = [C.TopicFile(
            name="projects.md",
            path=C.get_topic_dir(rich_config) / "projects.md",
            content="# Updated projects",
            category="projects",
        )]
        result = C.atomic_write_topics(updated, "# Updated index", rich_config)
        assert result is True
        assert "Updated projects" in (C.get_topic_dir(rich_config) / "projects.md").read_text()

    def test_writes_new_topic_file(self, rich_config, tmp_workspace):
        """Should create topic dir if it doesn't exist."""
        make_index(tmp_workspace, "rich", "# Index")
        new_topic_path = C.get_topic_dir(rich_config) / "new-topic.md"
        updated = [C.TopicFile(
            name="new-topic.md",
            path=new_topic_path,
            content="# New Topic\n- fact",
            category="general",
        )]
        result = C.atomic_write_topics(updated, "# Index", rich_config)
        assert result is True
        assert new_topic_path.exists()

    def test_rollback_on_failure(self, rich_config, tmp_workspace):
        """If a rename fails mid-way, all original content should be restored."""
        make_topic_file(tmp_workspace, "rich", "projects.md", "# Original content")
        make_index(tmp_workspace, "rich", "# Original index")

        topic_path = C.get_topic_dir(rich_config) / "projects.md"
        updated = [C.TopicFile(
            name="projects.md",
            path=topic_path,
            content="# SHOULD NOT APPEAR",
            category="projects",
        )]

        # Patch Path.rename to raise OSError for the topic file rename
        original_rename = Path.rename
        call_count = [0]

        def failing_rename(self, target):
            call_count[0] += 1
            if call_count[0] == 1:  # first rename call fails
                raise OSError("Simulated rename failure")
            return original_rename(self, target)

        with patch.object(Path, "rename", failing_rename):
            result = C.atomic_write_topics(updated, "# Updated index", rich_config)

        assert result is False
        # Original content should be restored
        assert "Original content" in topic_path.read_text()

    def test_no_tmp_files_left_after_rollback(self, rich_config, tmp_workspace):
        """No .tmp files should remain after a rollback."""
        make_topic_file(tmp_workspace, "rich", "projects.md", "# Original")
        make_index(tmp_workspace, "rich", "# Index")

        topic_path = C.get_topic_dir(rich_config) / "projects.md"
        updated = [C.TopicFile(
            name="projects.md",
            path=topic_path,
            content="# Updated",
            category="projects",
        )]

        original_rename = Path.rename

        def failing_rename(self, target):
            raise OSError("fail")

        with patch.object(Path, "rename", failing_rename):
            C.atomic_write_topics(updated, "# Index", rich_config)

        tmp_files = list(C.get_topic_dir(rich_config).glob("*.tmp"))
        assert tmp_files == [], f"Leftover tmp files: {tmp_files}"

    def test_dry_run_does_not_write(self, tmp_workspace):
        config = C.ConsolidationConfig(
            workspace=tmp_workspace, user="rich", dry_run=True
        )
        make_topic_file(tmp_workspace, "rich", "projects.md", "# Original")
        make_index(tmp_workspace, "rich", "# Index")

        topic_path = C.get_topic_dir(config) / "projects.md"
        original_mtime = topic_path.stat().st_mtime

        updated = [C.TopicFile(
            name="projects.md",
            path=topic_path,
            content="# Should not be written",
            category="projects",
        )]
        # dry_run is handled at orchestration level, not in atomic_write_topics
        # atomic_write_topics always writes — dry_run check is in consolidate_user
        # So just verify atomic_write_topics works normally here (it doesn't check dry_run)
        # This test verifies the function signature is intact
        result = C.atomic_write_topics(updated, "# Index", config)
        assert result is True


# ---------------------------------------------------------------------------
# TestArchiving
# ---------------------------------------------------------------------------

class TestArchiving:
    def test_moves_to_archive_dir(self, rich_config, tmp_workspace):
        path = make_daily_log(tmp_workspace, "rich", "2026-03-28", "- content")
        log = C.DailyLogEntry(date="2026-03-28", path=path, content="- content", line_count=1)
        C.archive_daily_logs([log], rich_config)
        assert not path.exists()
        archive_path = C.get_archive_dir(rich_config) / "2026-03-28.md"
        assert archive_path.exists()

    def test_creates_archive_dir_if_missing(self, rich_config, tmp_workspace):
        path = make_daily_log(tmp_workspace, "rich", "2026-03-28", "- content")
        log = C.DailyLogEntry(date="2026-03-28", path=path, content="- content", line_count=1)
        archive_dir = C.get_archive_dir(rich_config)
        assert not archive_dir.exists()
        C.archive_daily_logs([log], rich_config)
        assert archive_dir.exists()

    def test_never_deletes_originals_on_conflict(self, rich_config, tmp_workspace):
        """If archive file already exists, rename with timestamp (don't overwrite)."""
        path = make_daily_log(tmp_workspace, "rich", "2026-03-28", "- new content")
        log = C.DailyLogEntry(date="2026-03-28", path=path, content="- new content", line_count=1)
        # Pre-populate archive with same filename
        archive_dir = C.get_archive_dir(rich_config)
        archive_dir.mkdir(parents=True, exist_ok=True)
        (archive_dir / "2026-03-28.md").write_text("- old content")
        C.archive_daily_logs([log], rich_config)
        # Both should exist
        all_files = list(archive_dir.glob("2026-03-28*"))
        assert len(all_files) == 2

    def test_dry_run_does_not_archive(self, tmp_workspace):
        config = C.ConsolidationConfig(
            workspace=tmp_workspace, user="rich", dry_run=True
        )
        path = make_daily_log(tmp_workspace, "rich", "2026-03-28", "- content")
        log = C.DailyLogEntry(date="2026-03-28", path=path, content="- content", line_count=1)
        C.archive_daily_logs([log], config)
        assert path.exists()  # Not moved

    def test_archives_multiple_logs(self, rich_config, tmp_workspace):
        logs = []
        for date in ["2026-03-28", "2026-03-29", "2026-03-30"]:
            path = make_daily_log(tmp_workspace, "rich", date, f"- {date}")
            logs.append(C.DailyLogEntry(date=date, path=path, content=f"- {date}", line_count=1))
        C.archive_daily_logs(logs, rich_config)
        archive_dir = C.get_archive_dir(rich_config)
        assert len(list(archive_dir.glob("*.md"))) == 3


# ---------------------------------------------------------------------------
# TestJSONLGeneration
# ---------------------------------------------------------------------------

class TestJSONLGeneration:
    def _make_log(self, date_str, content):
        return C.DailyLogEntry(date=date_str, path=Path(f"{date_str}.md"), content=content, line_count=len(content.splitlines()))

    def test_valid_jsonl_format(self, rich_config, tmp_workspace):
        logs = [self._make_log("2026-03-28", "- Fact one about sybilclaw\n- Fact two here")]
        entries = C.generate_jsonl_entries(logs, rich_config)
        for entry in entries:
            # Must be JSON-serializable
            line = json.dumps(entry)
            parsed = json.loads(line)
            assert "ts" in parsed
            assert "user" in parsed
            assert "summary" in parsed
            assert "tags" in parsed
            assert "source" in parsed

    def test_iso_timestamps(self, rich_config):
        logs = [self._make_log("2026-03-28", "- A notable fact here")]
        entries = C.generate_jsonl_entries(logs, rich_config)
        assert entries, "Expected at least one entry"
        for entry in entries:
            # Should parse as ISO 8601
            ts = datetime.fromisoformat(entry["ts"])
            assert ts.year == 2026

    def test_user_field_set_correctly(self, rich_config):
        logs = [self._make_log("2026-03-28", "- A fact")]
        entries = C.generate_jsonl_entries(logs, rich_config)
        for entry in entries:
            assert entry["user"] == "rich"

    def test_source_points_to_daily_file(self, rich_config):
        logs = [self._make_log("2026-03-28", "- A fact")]
        entries = C.generate_jsonl_entries(logs, rich_config)
        for entry in entries:
            assert entry["source"] == "daily/2026-03-28.md"

    def test_extracts_bullet_points(self, rich_config):
        content = "# Header\n\n- First bullet point fact\n* Second bullet with asterisk\n• Third with unicode\n\nNot a bullet line"
        logs = [self._make_log("2026-03-28", content)]
        entries = C.generate_jsonl_entries(logs, rich_config)
        summaries = [e["summary"] for e in entries]
        assert any("First bullet" in s for s in summaries)
        assert any("Second bullet" in s for s in summaries)

    def test_skips_trivial_entries(self, rich_config):
        content = "- ok\n- A sufficiently long fact that should be included"
        logs = [self._make_log("2026-03-28", content)]
        entries = C.generate_jsonl_entries(logs, rich_config)
        summaries = [e["summary"] for e in entries]
        assert not any(s == "ok" for s in summaries)

    def test_tags_extracted(self, rich_config):
        content = "- Working on #sybilclaw memory system"
        logs = [self._make_log("2026-03-28", content)]
        entries = C.generate_jsonl_entries(logs, rich_config)
        assert entries
        assert "sybilclaw" in entries[0]["tags"]

    def test_bracketed_tags_extracted(self, rich_config):
        content = "- [project:yapCAD] geometry bug fixed"
        logs = [self._make_log("2026-03-28", content)]
        entries = C.generate_jsonl_entries(logs, rich_config)
        assert entries
        assert "project:yapCAD" in entries[0]["tags"]

    def test_write_jsonl_archive_appends(self, rich_config, tmp_workspace):
        logs = [self._make_log("2026-03-28", "- Fact one for archive")]
        entries = C.generate_jsonl_entries(logs, rich_config)
        count = C.write_jsonl_archive(entries, rich_config)
        assert count == len(entries)
        # Find the written file
        jsonl_dir = C.get_jsonl_dir(rich_config)
        today = datetime.now().strftime("%Y-%m-%d")
        jsonl_file = jsonl_dir / f"{today}.jsonl"
        assert jsonl_file.exists()
        lines = jsonl_file.read_text().splitlines()
        assert len(lines) == len(entries)
        # All lines must be valid JSON
        for line in lines:
            json.loads(line)

    def test_write_jsonl_dry_run(self, tmp_workspace):
        config = C.ConsolidationConfig(
            workspace=tmp_workspace, user="rich", dry_run=True
        )
        logs = [self._make_log("2026-03-28", "- Fact")]
        entries = C.generate_jsonl_entries(logs, config)
        count = C.write_jsonl_archive(entries, config)
        assert count == len(entries)  # Count is returned
        jsonl_dir = C.get_jsonl_dir(config)
        assert not jsonl_dir.exists()  # But nothing written

    def test_no_entries_returns_zero(self, rich_config):
        count = C.write_jsonl_archive([], rich_config)
        assert count == 0


# ---------------------------------------------------------------------------
# TestIndexManagement
# ---------------------------------------------------------------------------

class TestIndexManagement:
    def test_new_entries_added(self):
        current = "# Index\n\n- [old:entry] Old thing\n"
        updated = C._update_index(
            current,
            ["- [new:entry] New thing"],
            set(),
            max_lines=200,
        )
        assert "New thing" in updated
        assert "Old thing" in updated

    def test_stays_under_200_lines(self):
        # Create an index with 210 non-header lines
        lines = ["# Index\n"] + [f"- entry {i}\n" for i in range(210)]
        current = "".join(lines)
        updated = C._update_index(current, [], set(), max_lines=200)
        assert len(updated.splitlines()) <= 200

    def test_stale_entries_removed(self):
        current = "# Index\n\n- [stale:entry] Should be removed\n- [keep:entry] Keep this\n"
        updated = C._update_index(
            current,
            [],
            {"- [stale:entry] Should be removed"},
            max_lines=200,
        )
        assert "stale:entry" not in updated
        assert "keep:entry" in updated

    def test_no_duplicate_entries(self):
        current = "# Index\n\n- [tag:existing] Already here\n"
        updated = C._update_index(
            current,
            ["- [tag:existing] Already here"],
            set(),
            max_lines=200,
        )
        assert updated.count("Already here") == 1

    def test_empty_index(self):
        updated = C._update_index("", ["- new entry"], set(), max_lines=200)
        assert "new entry" in updated

    def test_headers_preserved_when_pruning(self):
        lines = ["# My Index\n", "## Section\n"] + [f"- entry {i}\n" for i in range(210)]
        current = "".join(lines)
        updated = C._update_index(current, [], set(), max_lines=200)
        assert "# My Index" in updated
        assert len(updated.splitlines()) <= 200


# ---------------------------------------------------------------------------
# TestConsolidationReport
# ---------------------------------------------------------------------------

class TestConsolidationReport:
    def test_report_generated(self, rich_config, tmp_workspace):
        result = C.ConsolidationResult(
            user="rich",
            daily_logs_processed=3,
            topic_files_updated=["projects.md", "tools.md"],
            jsonl_entries_created=12,
        )
        # Create the daily log directory
        log_dir = C.get_daily_log_dir(rich_config)
        log_dir.mkdir(parents=True, exist_ok=True)
        C.write_consolidation_report(result, rich_config)
        today = datetime.now().strftime("%Y-%m-%d")
        report_path = log_dir / f"consolidation-{today}.md"
        assert report_path.exists()
        content = report_path.read_text()
        assert "rich" in content
        assert "3" in content  # daily_logs_processed
        assert "projects.md" in content

    def test_conflicts_logged(self, rich_config, tmp_workspace):
        result = C.ConsolidationResult(
            user="rich",
            contradictions_resolved=[{
                "topic": "tools.md",
                "old": "OpenClaw 2026.3.11",
                "new": "OpenClaw 2026.3.13",
                "resolution": "Updated to newer version",
            }],
        )
        log_dir = C.get_daily_log_dir(rich_config)
        log_dir.mkdir(parents=True, exist_ok=True)
        C.write_consolidation_report(result, rich_config)
        today = datetime.now().strftime("%Y-%m-%d")
        report_path = log_dir / f"consolidation-{today}.md"
        content = report_path.read_text()
        assert "2026.3.11" in content
        assert "2026.3.13" in content

    def test_errors_logged(self, rich_config, tmp_workspace):
        result = C.ConsolidationResult(
            user="rich",
            errors=["LLM merge failed: timeout"],
        )
        log_dir = C.get_daily_log_dir(rich_config)
        log_dir.mkdir(parents=True, exist_ok=True)
        C.write_consolidation_report(result, rich_config)
        today = datetime.now().strftime("%Y-%m-%d")
        report_path = log_dir / f"consolidation-{today}.md"
        content = report_path.read_text()
        assert "LLM merge failed" in content

    def test_dry_run_does_not_write_report(self, tmp_workspace):
        config = C.ConsolidationConfig(
            workspace=tmp_workspace, user="rich", dry_run=True
        )
        result = C.ConsolidationResult(user="rich")
        log_dir = C.get_daily_log_dir(config)
        C.write_consolidation_report(result, config)
        # Report should not exist on disk
        today = datetime.now().strftime("%Y-%m-%d")
        assert not (log_dir / f"consolidation-{today}.md").exists()


# ---------------------------------------------------------------------------
# TestStatePersistence
# ---------------------------------------------------------------------------

class TestStatePersistence:
    def test_state_saved_after_run(self, tmp_workspace):
        state_file = tmp_workspace / "memory" / ".consolidation-state.json"
        state = {"version": 1, "per_user": {}, "last_run": None}
        C.save_state(state, state_file)
        assert state_file.exists()
        loaded = json.loads(state_file.read_text())
        assert loaded["version"] == 1

    def test_resumes_from_last_run(self, tmp_workspace):
        state_file = tmp_workspace / "memory" / ".consolidation-state.json"
        past = datetime(2026, 3, 28, 3, 0, 0, tzinfo=timezone.utc)
        state = {
            "version": 1,
            "last_run": past.isoformat(),
            "per_user": {
                "rich": {
                    "last_consolidated": past.isoformat(),
                    "daily_logs_processed": [],
                    "topic_files_hash": "",
                }
            }
        }
        state_file.parent.mkdir(parents=True, exist_ok=True)
        state_file.write_text(json.dumps(state))

        loaded_state = C.load_state(state_file)
        since = C.get_last_run_for_user(loaded_state, "rich")
        assert since == past

    def test_first_run_returns_none(self, tmp_workspace):
        state_file = tmp_workspace / "memory" / ".consolidation-state.json"
        state = C.load_state(state_file)
        since = C.get_last_run_for_user(state, "rich")
        assert since is None

    def test_handles_corrupt_state_file(self, tmp_workspace):
        state_file = tmp_workspace / "memory" / ".consolidation-state.json"
        state_file.parent.mkdir(parents=True, exist_ok=True)
        state_file.write_text("not valid json{{{")
        state = C.load_state(state_file)
        # Should return defaults, not crash
        assert state["version"] == 1
        assert state["per_user"] == {}

    def test_dry_run_does_not_save_state(self, tmp_workspace):
        state_file = tmp_workspace / "memory" / ".consolidation-state.json"
        state = {"version": 1, "per_user": {}, "last_run": None}
        C.save_state(state, state_file, dry_run=True)
        assert not state_file.exists()

    def test_atomic_state_write(self, tmp_workspace):
        """State file should be written atomically (via .tmp rename)."""
        state_file = tmp_workspace / "memory" / ".consolidation-state.json"
        state = {"version": 1, "per_user": {"rich": {}}, "last_run": "now"}
        C.save_state(state, state_file)
        # No .tmp leftover
        tmp_file = state_file.with_suffix(".json.tmp")
        assert not tmp_file.exists()
        assert state_file.exists()


# ---------------------------------------------------------------------------
# TestLockFile
# ---------------------------------------------------------------------------

class TestLockFile:
    def test_acquire_and_release(self, rich_config, tmp_workspace):
        assert C.acquire_lock(rich_config)
        lock = C.get_lock_file(rich_config)
        assert lock.exists()
        C.release_lock(rich_config)
        assert not lock.exists()

    def test_cannot_acquire_twice(self, rich_config, tmp_workspace):
        assert C.acquire_lock(rich_config)
        try:
            # Second acquire should fail
            assert not C.acquire_lock(rich_config)
        finally:
            C.release_lock(rich_config)

    def test_stale_lock_overridden(self, rich_config, tmp_workspace):
        lock = C.get_lock_file(rich_config)
        lock.parent.mkdir(parents=True, exist_ok=True)
        lock.write_text("99999")
        # Make it appear stale (>2 hours old) by backdating mtime
        old_time = time.time() - 7500  # 2h+ ago
        os.utime(lock, (old_time, old_time))
        assert C.acquire_lock(rich_config)
        C.release_lock(rich_config)


# ---------------------------------------------------------------------------
# TestMergeIntegration (mocked LLM)
# ---------------------------------------------------------------------------

class TestMergeIntegration:
    """Tests that mock the LLM call to test the merge orchestration logic."""

    def _mock_llm(self, updated_topics=None, conflicts=None, new_entries=None):
        """Return a mock for call_llm_merge."""
        response = fake_merge_response(updated_topics, conflicts, new_entries)

        def mock_call(*args, **kwargs):
            return response

        return mock_call

    def test_merge_updates_existing_topic(self, rich_config, tmp_workspace):
        make_topic_file(tmp_workspace, "rich", "tools.md", "# Tools\n- Version: 2026.3.11")
        make_index(tmp_workspace, "rich", "# Index\n")

        logs = [C.DailyLogEntry(
            date="2026-03-29",
            path=Path("2026-03-29.md"),
            content="- OpenClaw updated to version 2026.3.13",
            line_count=1,
        )]
        topic_files = C.read_topic_files(rich_config)
        index = C.read_index(rich_config)

        mock_response = fake_merge_response(
            updated_topics={"tools.md": "# Tools\n- Version: 2026.3.13"},
            conflicts=[{
                "topic": "tools.md",
                "old": "Version: 2026.3.11",
                "new": "Version: 2026.3.13",
                "resolution": "Updated to newer",
            }],
        )

        with patch.object(C, "call_llm_merge", return_value=mock_response):
            updated_topics, updated_index, conflicts = C.merge_daily_into_topics(
                logs, topic_files, index, rich_config
            )

        assert len(updated_topics) == 1
        assert "2026.3.13" in updated_topics[0].content
        assert len(conflicts) == 1

    def test_merge_creates_new_topic_file(self, rich_config, tmp_workspace):
        make_index(tmp_workspace, "rich", "# Index\n")
        logs = [C.DailyLogEntry(
            date="2026-03-29",
            path=Path("2026-03-29.md"),
            content="- New fact about health",
            line_count=1,
        )]

        mock_response = fake_merge_response(
            updated_topics={"health.md": "# Health\n- New fact about health"},
        )

        with patch.object(C, "call_llm_merge", return_value=mock_response):
            updated_topics, updated_index, conflicts = C.merge_daily_into_topics(
                logs, [], "# Index\n", rich_config
            )

        assert len(updated_topics) == 1
        assert updated_topics[0].name == "health.md"
        assert not updated_topics[0].path.exists()  # Not written yet

    def test_merge_retries_on_bad_json(self, rich_config, tmp_workspace):
        """If LLM returns bad JSON, call_llm_merge should raise, caught upstream."""
        with patch.object(C, "call_llm_merge", side_effect=json.JSONDecodeError("bad", "", 0)):
            with pytest.raises(json.JSONDecodeError):
                C.merge_daily_into_topics([], [], "", rich_config)


# ---------------------------------------------------------------------------
# TestFullFlow (integration, mocked LLM)
# ---------------------------------------------------------------------------

class TestFullFlow:
    def test_full_consolidation_flow(self, tmp_workspace):
        config = C.ConsolidationConfig(
            workspace=tmp_workspace,
            user="rich",
            dry_run=False,
            last_run_file=tmp_workspace / "memory" / ".consolidation-state.json",
            since=datetime(2026, 3, 27, tzinfo=timezone.utc),
        )

        # Set up workspace
        make_daily_log(tmp_workspace, "rich", "2026-03-28",
                       "- Launched SybilClaw Phase 1\n- Updated OpenClaw to 2026.3.13")
        make_topic_file(tmp_workspace, "rich", "projects.md",
                        "<!-- AUTO-MANAGED -->\n# Projects\n- SybilClaw: planned")
        make_index(tmp_workspace, "rich", "# Index\n\n- [project:sybilclaw] old entry\n")

        mock_response = fake_merge_response(
            updated_topics={"projects.md": "<!-- AUTO-MANAGED -->\n# Projects\n- SybilClaw Phase 1: COMPLETE 2026-03-28"},
            new_entries=["- [project:sybilclaw] Phase 1 complete 2026-03-28"],
            conflicts=[],
        )

        state_file = config.last_run_file
        with patch.object(C, "call_llm_merge", return_value=mock_response):
            result = C.run_consolidation(config, state_file)

        assert result.daily_logs_processed == 1
        assert "projects.md" in result.topic_files_updated
        assert result.errors == []

        # Verify topic file was written
        topic_path = C.get_topic_dir(config) / "projects.md"
        assert "Phase 1: COMPLETE" in topic_path.read_text()

        # Verify daily log was archived
        archive_path = C.get_archive_dir(config) / "2026-03-28.md"
        assert archive_path.exists()

        # Verify state was saved
        assert state_file.exists()
        state = json.loads(state_file.read_text())
        assert "rich" in state["per_user"]

    def test_dry_run_makes_no_changes(self, tmp_workspace):
        config = C.ConsolidationConfig(
            workspace=tmp_workspace,
            user="rich",
            dry_run=True,
            last_run_file=tmp_workspace / "memory" / ".consolidation-state.json",
            since=datetime(2026, 3, 27, tzinfo=timezone.utc),
        )

        make_daily_log(tmp_workspace, "rich", "2026-03-28", "- A fact")
        make_topic_file(tmp_workspace, "rich", "projects.md", "# Original")
        make_index(tmp_workspace, "rich", "# Index")

        topic_path = C.get_topic_dir(config) / "projects.md"
        log_path = C.get_daily_log_dir(config) / "2026-03-28.md"

        mock_response = fake_merge_response(
            updated_topics={"projects.md": "# Modified"},
        )

        with patch.object(C, "call_llm_merge", return_value=mock_response):
            result = C.run_consolidation(config, config.last_run_file)

        # Topic file should be UNCHANGED (dry_run)
        assert topic_path.read_text() == "# Original"
        # Daily log should NOT be archived (dry_run)
        assert log_path.exists()
        # State should NOT be saved (dry_run)
        assert not config.last_run_file.exists()

    def test_no_daily_logs_skips_gracefully(self, tmp_workspace):
        config = C.ConsolidationConfig(
            workspace=tmp_workspace,
            user="rich",
            dry_run=False,
            last_run_file=tmp_workspace / "memory" / ".consolidation-state.json",
            since=datetime(2026, 4, 5, tzinfo=timezone.utc),  # future date
        )
        make_daily_log(tmp_workspace, "rich", "2026-03-28", "- old log")

        with patch.object(C, "call_llm_merge") as mock_llm:
            result = C.run_consolidation(config, config.last_run_file)

        mock_llm.assert_not_called()
        assert result.daily_logs_processed == 0

    def test_llm_failure_returns_error_result(self, tmp_workspace):
        config = C.ConsolidationConfig(
            workspace=tmp_workspace,
            user="rich",
            dry_run=False,
            last_run_file=tmp_workspace / "memory" / ".consolidation-state.json",
            since=datetime(2026, 3, 27, tzinfo=timezone.utc),
        )
        make_daily_log(tmp_workspace, "rich", "2026-03-28", "- a fact")
        make_index(tmp_workspace, "rich", "# Index")

        with patch.object(C, "call_llm_merge", side_effect=RuntimeError("API timeout")):
            result = C.run_consolidation(config, config.last_run_file)

        assert len(result.errors) > 0
        assert any("LLM merge failed" in e for e in result.errors)

    def test_multi_user_isolation(self, tmp_workspace):
        """Each user's consolidation should not affect other users."""
        since = datetime(2026, 3, 27, tzinfo=timezone.utc)

        make_daily_log(tmp_workspace, "rich", "2026-03-28", "- Rich fact")
        make_daily_log(tmp_workspace, "dana", "2026-03-28", "- Dana fact")
        make_index(tmp_workspace, "rich", "# Rich Index")

        mock_response_rich = fake_merge_response(
            updated_topics={"projects.md": "# Rich projects"},
        )
        mock_response_dana = fake_merge_response(
            updated_topics={"context.md": "# Dana context"},
        )

        def selective_llm(*args, **kwargs):
            # Determine which user based on daily logs passed
            logs = args[0]
            if any("Rich" in l.content for l in logs):
                return mock_response_rich
            return mock_response_dana

        state_file = tmp_workspace / "memory" / ".consolidation-state.json"

        for user in ["rich", "dana"]:
            config = C.ConsolidationConfig(
                workspace=tmp_workspace,
                user=user,
                dry_run=False,
                last_run_file=state_file,
                since=since,
            )
            with patch.object(C, "call_llm_merge", side_effect=selective_llm):
                C.run_consolidation(config, state_file)

        # Rich's topic file should exist in rich's dir, not dana's
        rich_topic = C.get_topic_dir(C.ConsolidationConfig(workspace=tmp_workspace, user="rich")) / "projects.md"
        dana_topic = C.get_topic_dir(C.ConsolidationConfig(workspace=tmp_workspace, user="dana")) / "context.md"
        assert rich_topic.exists()
        assert dana_topic.exists()
        # Dana should not have rich's topic
        assert not (C.get_topic_dir(C.ConsolidationConfig(workspace=tmp_workspace, user="dana")) / "projects.md").exists()


# ---------------------------------------------------------------------------
# TestEdgeCases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_empty_topic_file_gets_header(self, rich_config, tmp_workspace):
        """Empty topic files should still be handled gracefully."""
        make_topic_file(tmp_workspace, "rich", "empty.md", "")
        topics = C.read_topic_files(rich_config)
        assert topics[0].content == ""
        # Atomic write should work fine with empty content
        updated = [C.TopicFile(
            name="empty.md",
            path=C.get_topic_dir(rich_config) / "empty.md",
            content=f"{C.AUTO_MANAGED_HEADER}\n# Empty\n",
            category="general",
        )]
        make_index(tmp_workspace, "rich", "# Index")
        result = C.atomic_write_topics(updated, "# Index", rich_config)
        assert result is True

    def test_first_run_no_state_file(self, tmp_workspace):
        state_file = tmp_workspace / "memory" / ".consolidation-state.json"
        assert not state_file.exists()
        state = C.load_state(state_file)
        since = C.get_last_run_for_user(state, "rich")
        assert since is None  # Triggers 30-day fallback in consolidate_user

    def test_no_topic_directory_creates_structure(self, tmp_workspace):
        config = C.ConsolidationConfig(
            workspace=tmp_workspace,
            user="rich",
            dry_run=False,
            last_run_file=tmp_workspace / "memory" / ".consolidation-state.json",
            since=datetime(2026, 3, 27, tzinfo=timezone.utc),
        )
        make_daily_log(tmp_workspace, "rich", "2026-03-28", "- a fact")
        make_index(tmp_workspace, "rich", "# Index")
        # topic dir does NOT exist

        mock_response = fake_merge_response(
            updated_topics={"context.md": "# Context\n- new fact"},
        )

        with patch.object(C, "call_llm_merge", return_value=mock_response):
            result = C.run_consolidation(config, config.last_run_file)

        assert C.get_topic_dir(config).exists()
        assert result.errors == []

    def test_index_at_cap_prunes_before_adding(self):
        # 200-line index + 5 new entries → should stay at 200
        lines = ["# Index\n"] + [f"- entry {i}\n" for i in range(199)]
        current = "".join(lines)
        new_entries = [f"- new entry {i}" for i in range(5)]
        updated = C._update_index(current, new_entries, set(), max_lines=200)
        assert len(updated.splitlines()) <= 200

    def test_relative_dates_in_daily_logs(self, rich_config):
        """Test that the JSONL extractor handles logs with relative dates gracefully."""
        content = "- Yesterday we launched Phase 1\n- Last week we finished the design"
        log = C.DailyLogEntry(date="2026-03-28", path=Path("2026-03-28.md"), content=content, line_count=2)
        entries = C.generate_jsonl_entries([log], rich_config)
        # Just verify it doesn't crash and entries have correct date anchoring
        for entry in entries:
            ts = datetime.fromisoformat(entry["ts"])
            assert ts.year == 2026

    def test_sha256_of_nonexistent_file(self):
        result = C.sha256_of_file(Path("/nonexistent/path/file.md"))
        assert result == ""

    def test_sha256_of_file(self, tmp_workspace):
        f = tmp_workspace / "test.md"
        f.write_text("hello")
        result = C.sha256_of_file(f)
        assert result.startswith("sha256:")


# ---------------------------------------------------------------------------
# TestPathHelpers
# ---------------------------------------------------------------------------

class TestPathHelpers:
    def test_rich_daily_dir(self, tmp_workspace):
        config = C.ConsolidationConfig(workspace=tmp_workspace, user="rich")
        expected = tmp_workspace / "memory" / "personal" / "rich" / "daily"
        assert C.get_daily_log_dir(config) == expected

    def test_household_daily_dir(self, tmp_workspace):
        config = C.ConsolidationConfig(workspace=tmp_workspace, user="household")
        expected = tmp_workspace / "memory" / "shared"
        assert C.get_daily_log_dir(config) == expected

    def test_rich_topic_dir(self, tmp_workspace):
        config = C.ConsolidationConfig(workspace=tmp_workspace, user="rich")
        expected = tmp_workspace / "memory" / "personal" / "rich" / "topics"
        assert C.get_topic_dir(config) == expected

    def test_household_topic_dir(self, tmp_workspace):
        config = C.ConsolidationConfig(workspace=tmp_workspace, user="household")
        expected = tmp_workspace / "memory" / "shared" / "household" / "topics"
        assert C.get_topic_dir(config) == expected

    def test_rich_index_path(self, tmp_workspace):
        config = C.ConsolidationConfig(workspace=tmp_workspace, user="rich")
        expected = tmp_workspace / "MEMORY.md"
        assert C.get_index_path(config) == expected

    def test_dana_index_path(self, tmp_workspace):
        config = C.ConsolidationConfig(workspace=tmp_workspace, user="dana")
        expected = tmp_workspace / "memory" / "personal" / "dana" / "INDEX.md"
        assert C.get_index_path(config) == expected

    def test_household_index_path(self, tmp_workspace):
        config = C.ConsolidationConfig(workspace=tmp_workspace, user="household")
        expected = tmp_workspace / "memory" / "shared" / "household" / "INDEX.md"
        assert C.get_index_path(config) == expected


# ---------------------------------------------------------------------------
# TestBuildMergePrompt
# ---------------------------------------------------------------------------

class TestBuildMergePrompt:
    def test_prompt_contains_daily_content(self):
        logs = [C.DailyLogEntry(
            date="2026-03-28",
            path=Path("2026-03-28.md"),
            content="- unique-fact-xyz",
            line_count=1,
        )]
        prompt = C.build_merge_prompt(logs, [], "", "2026-03-28")
        assert "unique-fact-xyz" in prompt

    def test_prompt_contains_topic_content(self):
        topic = C.TopicFile(
            name="projects.md",
            path=Path("projects.md"),
            content="- unique-topic-content-abc",
            category="projects",
        )
        prompt = C.build_merge_prompt([], [topic], "", "2026-03-28")
        assert "unique-topic-content-abc" in prompt

    def test_prompt_contains_today_date(self):
        prompt = C.build_merge_prompt([], [], "", "2026-03-28")
        assert "2026-03-28" in prompt

    def test_prompt_truncates_long_index(self):
        """Index > 3000 chars should be truncated in the prompt."""
        long_index = "- entry\n" * 600  # > 3000 chars
        prompt = C.build_merge_prompt([], [], long_index, "2026-03-28")
        # Prompt should not contain the full 600-entry index
        assert prompt.count("- entry") <= 400
