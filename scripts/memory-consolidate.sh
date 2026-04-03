#!/usr/bin/env bash
# memory-consolidate.sh — Wrapper for the memory consolidation cron job
# Iterates over all users and calls consolidate.py for each, sequentially.
#
# Usage:
#   memory-consolidate.sh [--workspace <path>] [--user <name>] [--dry-run]
#
# Environment:
#   CONSOLIDATE_WORKSPACE  — override workspace path
#   CONSOLIDATE_USERS      — space-separated list of users to process

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONSOLIDATE_PY="${SCRIPT_DIR}/consolidate.py"

# Defaults
WORKSPACE="${CONSOLIDATE_WORKSPACE:-${HOME}/.openclaw/workspace}"
USERS_DEFAULT=("rich" "dana" "terry" "lily" "household")
DRY_RUN=""
SINGLE_USER=""

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --workspace)
            WORKSPACE="$2"; shift 2 ;;
        --user)
            SINGLE_USER="$2"; shift 2 ;;
        --dry-run)
            DRY_RUN="--dry-run"; shift ;;
        -v|--verbose)
            VERBOSE="--verbose"; shift ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1 ;;
    esac
done

VERBOSE="${VERBOSE:-}"

# Build user list
if [[ -n "$SINGLE_USER" ]]; then
    USERS=("$SINGLE_USER")
elif [[ -n "${CONSOLIDATE_USERS:-}" ]]; then
    # shellcheck disable=SC2206
    IFS=' ' read -r -a USERS <<< "$CONSOLIDATE_USERS"
else
    USERS=("${USERS_DEFAULT[@]}")
fi

# Resolve state file path
STATE_FILE="${WORKSPACE}/memory/.consolidation-state.json"

echo "[memory-consolidate] Starting at $(date -Iseconds)"
echo "[memory-consolidate] Workspace: ${WORKSPACE}"
echo "[memory-consolidate] Users: ${USERS[*]}"
[[ -n "$DRY_RUN" ]] && echo "[memory-consolidate] DRY RUN mode"

FAILED_USERS=()

for user in "${USERS[@]}"; do
    echo ""
    echo "[memory-consolidate] ── Processing user: ${user} ──"

    # Check if user's daily log directory exists at all
    if [[ "$user" == "household" ]]; then
        USER_DIR="${WORKSPACE}/memory/shared"
    else
        USER_DIR="${WORKSPACE}/memory/personal/${user}"
    fi

    if [[ ! -d "$USER_DIR" ]]; then
        echo "[memory-consolidate] No memory directory for ${user}, skipping"
        continue
    fi

    if python3 "${CONSOLIDATE_PY}" \
        --workspace "${WORKSPACE}" \
        --user "${user}" \
        --last-run-file "${STATE_FILE}" \
        ${DRY_RUN} \
        ${VERBOSE}; then
        echo "[memory-consolidate] ✓ ${user} done"
    else
        echo "[memory-consolidate] ✗ ${user} FAILED (exit $?)" >&2
        FAILED_USERS+=("$user")
        # Continue processing other users — don't abort on single failure
    fi
done

echo ""
echo "[memory-consolidate] Finished at $(date -Iseconds)"

if [[ ${#FAILED_USERS[@]} -gt 0 ]]; then
    echo "[memory-consolidate] FAILED users: ${FAILED_USERS[*]}" >&2
    exit 1
fi

echo "[memory-consolidate] All users consolidated successfully."
exit 0
