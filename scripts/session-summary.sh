#!/usr/bin/env bash
set -euo pipefail

# session-summary.sh
# Appends a session summary entry to today's JSONL transcript file
# Idempotent: skips if session_id already exists in today's file

WORKSPACE_ROOT="${WORKSPACE_ROOT:-$HOME/.sybilclaw/workspace}"
TRANSCRIPTS_DIR="$WORKSPACE_ROOT/memory/transcripts"

# Parse arguments
SESSION_ID=""
SUMMARY=""
TOPICS=""
DECISIONS=""
MEMORY_UPDATES=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --session-id)
      SESSION_ID="$2"
      shift 2
      ;;
    --summary)
      SUMMARY="$2"
      shift 2
      ;;
    --topics)
      TOPICS="$2"
      shift 2
      ;;
    --decisions)
      DECISIONS="$2"
      shift 2
      ;;
    --memory-updates)
      MEMORY_UPDATES="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$SESSION_ID" ]]; then
  echo "Error: --session-id is required" >&2
  exit 1
fi

if [[ -z "$SUMMARY" ]]; then
  echo "Error: --summary is required" >&2
  exit 1
fi

# Get today's date in YYYY-MM-DD format
TODAY=$(date +%Y-%m-%d)
JSONL_FILE="$TRANSCRIPTS_DIR/$TODAY.jsonl"

# Create transcripts directory if it doesn't exist
mkdir -p "$TRANSCRIPTS_DIR"

# Check if session_id already exists in today's file (idempotency check)
if [[ -f "$JSONL_FILE" ]]; then
  if grep -q "\"session_id\":\"$SESSION_ID\"" "$JSONL_FILE"; then
    echo "Session $SESSION_ID already exists in $JSONL_FILE, skipping" >&2
    exit 0
  fi
fi

# Build JSON entry
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Convert comma-separated strings to JSON arrays
topics_json="[]"
if [[ -n "$TOPICS" ]]; then
  IFS=',' read -ra TOPIC_ARRAY <<< "$TOPICS"
  topics_json="["
  for i in "${!TOPIC_ARRAY[@]}"; do
    [[ $i -gt 0 ]] && topics_json+=","
    topics_json+="\"${TOPIC_ARRAY[$i]}\""
  done
  topics_json+="]"
fi

decisions_json="[]"
if [[ -n "$DECISIONS" ]]; then
  IFS=',' read -ra DECISION_ARRAY <<< "$DECISIONS"
  decisions_json="["
  for i in "${!DECISION_ARRAY[@]}"; do
    [[ $i -gt 0 ]] && decisions_json+=","
    escaped_decision="${DECISION_ARRAY[$i]//\"/\\\"}"
    decisions_json+="\"$escaped_decision\""
  done
  decisions_json+="]"
fi

memory_updates_json="[]"
if [[ -n "$MEMORY_UPDATES" ]]; then
  IFS=',' read -ra UPDATE_ARRAY <<< "$MEMORY_UPDATES"
  memory_updates_json="["
  for i in "${!UPDATE_ARRAY[@]}"; do
    [[ $i -gt 0 ]] && memory_updates_json+=","
    memory_updates_json+="\"${UPDATE_ARRAY[$i]}\""
  done
  memory_updates_json+="]"
fi

# Escape quotes in summary
SUMMARY_ESCAPED="${SUMMARY//\"/\\\"}"

JSON_ENTRY=$(cat <<EOF
{"session_id":"$SESSION_ID","timestamp":"$TIMESTAMP","summary":"$SUMMARY_ESCAPED","topics":$topics_json,"decisions":$decisions_json,"memory_updates":$memory_updates_json}
EOF
)

echo "$JSON_ENTRY" >> "$JSONL_FILE"
echo "Session summary appended to $JSONL_FILE" >&2
