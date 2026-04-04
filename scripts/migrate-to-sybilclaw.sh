#!/usr/bin/env bash
set -euo pipefail

# migrate-to-sybilclaw.sh
# Migrates an existing ~/.openclaw installation to ~/.sybilclaw
# Keeps ~/.openclaw intact as a backup

# Color codes for terminal output
readonly RED=$'\033[0;31m'
readonly GREEN=$'\033[0;32m'
readonly YELLOW=$'\033[1;33m'
readonly BLUE=$'\033[0;34m'
readonly NC=$'\033[0m' # No Color

# Default paths
DEFAULT_SOURCE="$HOME/.openclaw"
DEFAULT_DEST="$HOME/.sybilclaw"
LOG_FILE="$HOME/.sybilclaw-migration.log"

# Flags
SKIP_CONFIRMATION=0
FORCE_OVERWRITE=0
INCLUDE_LOGS=0
DRY_RUN=0
SOURCE_DIR="$DEFAULT_SOURCE"
DEST_DIR="$DEFAULT_DEST"

# Directories and files to copy
DIRS_TO_COPY=(
  "agents"
  "browser"
  "canvas"
  "certs"
  "completions"
  "credentials"
  "cron"
  "delivery-queue"
  "devices"
  "extensions"
  "gateway"
  "identity"
  "media"
  "memory"
  "subagents"
  "tasks"
  "telegram"
)

FILES_TO_COPY=(
  "google-credentials.json"
  "exec-approvals.json"
  "update-check.json"
)

# Files/patterns to skip
SKIP_PATTERNS=(
  "*.bak"
  "*.bak.*"
  "openclaw.json.backup-*"
)

# Usage message
usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Migrate an existing ~/.openclaw installation to ~/.sybilclaw

OPTIONS:
  -y, --yes              Skip confirmation prompt
  -f, --force            Allow migration even if ~/.sybilclaw exists
                         (renames existing to ~/.sybilclaw-backup-TIMESTAMP)
  --include-logs         Also copy logs/ directory (skipped by default)
  --dry-run              Print what would happen without doing it
  --source DIR           Use custom source directory (default: ~/.openclaw)
  --dest DIR             Use custom destination (default: ~/.sybilclaw)
  -h, --help             Show this help message

EXAMPLES:
  $(basename "$0")                    # Interactive migration
  $(basename "$0") --yes              # Skip confirmation
  $(basename "$0") --dry-run          # Preview changes
  $(basename "$0") --include-logs     # Also copy logs/

EOF
}

# Logging functions
# log_file_only: writes to log file only (plain text, no color)
log_file_only() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# log: writes plain text to both terminal and log file
log() {
  local msg="[$(date +'%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg" | tee -a "$LOG_FILE"
}

log_error() {
  printf "%sERROR: %s%s\n" "${RED}" "$*" "${NC}" >&2
  log_file_only "ERROR: $*"
}

log_success() {
  printf "%s✅ %s%s\n" "${GREEN}" "$*" "${NC}"
  log_file_only "SUCCESS: $*"
}

log_info() {
  printf "%sℹ️  %s%s\n" "${BLUE}" "$*" "${NC}"
  log_file_only "INFO: $*"
}

log_warning() {
  printf "%s⚠️  %s%s\n" "${YELLOW}" "$*" "${NC}"
  log_file_only "WARNING: $*"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -y|--yes)
      SKIP_CONFIRMATION=1
      shift
      ;;
    -f|--force)
      FORCE_OVERWRITE=1
      shift
      ;;
    --include-logs)
      INCLUDE_LOGS=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --source)
      SOURCE_DIR="$2"
      shift 2
      ;;
    --dest)
      DEST_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

# Expand tilde in paths
SOURCE_DIR="${SOURCE_DIR/#\~/$HOME}"
DEST_DIR="${DEST_DIR/#\~/$HOME}"

# Cleanup function for error handling
cleanup_on_error() {
  local exit_code=$?
  if [[ $exit_code -ne 0 && -d "$DEST_DIR" && $DRY_RUN -eq 0 ]]; then
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local failed_dir="${DEST_DIR}-failed-${timestamp}"
    log_warning "Migration failed, renaming partial migration to: $failed_dir"
    mv "$DEST_DIR" "$failed_dir" || true
  fi
}

trap cleanup_on_error EXIT

# Validation checks
validate_preconditions() {
  log_info "Validating preconditions..."

  # Check if source exists
  if [[ ! -d "$SOURCE_DIR" ]]; then
    log_error "Source directory does not exist: $SOURCE_DIR"
    exit 1
  fi

  # Check if destination already exists
  if [[ -d "$DEST_DIR" ]]; then
    if [[ $FORCE_OVERWRITE -eq 0 ]]; then
      log_error "Destination directory already exists: $DEST_DIR"
      log_error "Use --force to overwrite (will backup existing directory)"
      exit 1
    else
      log_warning "Destination exists and will be backed up"
    fi
  fi

  # Check if openclaw.json exists in source
  if [[ ! -f "$SOURCE_DIR/openclaw.json" ]]; then
    log_warning "openclaw.json not found in source directory"
    log_warning "This may not be a valid OpenClaw installation"
  fi
}

# Print migration summary
print_summary() {
  cat <<EOF

${BLUE}════════════════════════════════════════════════════════════════${NC}
${BLUE}         SybilClaw Migration Summary${NC}
${BLUE}════════════════════════════════════════════════════════════════${NC}

  Source:      $SOURCE_DIR
  Destination: $DEST_DIR
  Log file:    $LOG_FILE

${YELLOW}What will be migrated:${NC}
  • Configuration files (openclaw.json → sybilclaw.json)
  • All agent state and memory indexes
  • Browser profiles, certs, and credentials
  • Cron jobs, delivery queues, and tasks
  • Extensions, gateway config, and identity
  • Media files and workspace directories
  $(if [[ $INCLUDE_LOGS -eq 1 ]]; then echo "  • Logs directory"; fi)

${YELLOW}What will be skipped:${NC}
  • Logs directory (unless --include-logs specified)
  • Backup files (*.bak, openclaw.json.backup-*)

${YELLOW}Config transformations:${NC}
  • openclaw.json will be copied to sybilclaw.json
  • All /.openclaw/ paths will be replaced with /.sybilclaw/
  • Workspace scripts will be updated with latest version
  • openclaw CLI symlink created (openclaw → sybilclaw for compatibility)

${RED}Important:${NC}
  • Source directory will remain UNTOUCHED (safe backup)
  • Partial migration on failure will be renamed to *-failed-TIMESTAMP

${BLUE}════════════════════════════════════════════════════════════════${NC}

EOF
}

# Ask for confirmation
confirm_migration() {
  if [[ $SKIP_CONFIRMATION -eq 1 || $DRY_RUN -eq 1 ]]; then
    return 0
  fi

  read -p "Proceed with migration? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Migration cancelled by user"
    exit 0
  fi
}

# Backup existing destination if it exists
backup_existing_destination() {
  if [[ -d "$DEST_DIR" && $FORCE_OVERWRITE -eq 1 ]]; then
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_dir="${DEST_DIR}-backup-${timestamp}"
    log_info "Backing up existing destination to: $backup_dir"
    if [[ $DRY_RUN -eq 0 ]]; then
      mv "$DEST_DIR" "$backup_dir"
      log_success "Existing directory backed up"
    fi
  fi
}

# Copy directories
copy_directories() {
  log_info "Copying directories..."

  # Add workspace and workspace-* directories dynamically
  local workspace_dirs=()
  if [[ -d "$SOURCE_DIR/workspace" ]]; then
    workspace_dirs+=("workspace")
  fi

  # Find all workspace-* directories
  while IFS= read -r -d '' dir; do
    local basename=$(basename "$dir")
    if [[ $basename =~ ^workspace- ]]; then
      workspace_dirs+=("$basename")
    fi
  done < <(find "$SOURCE_DIR" -maxdepth 1 -type d -name "workspace-*" -print0 2>/dev/null)

  # Add logs if requested
  if [[ $INCLUDE_LOGS -eq 1 && -d "$SOURCE_DIR/logs" ]]; then
    DIRS_TO_COPY+=("logs")
  fi

  # Copy all directories
  for dir in "${DIRS_TO_COPY[@]}" "${workspace_dirs[@]}"; do
    if [[ -d "$SOURCE_DIR/$dir" ]]; then
      log_info "  Copying $dir/"
      if [[ $DRY_RUN -eq 0 ]]; then
        mkdir -p "$DEST_DIR"
        cp -R "$SOURCE_DIR/$dir" "$DEST_DIR/"
      fi
    fi
  done
}

# Copy individual files
copy_files() {
  log_info "Copying files..."

  for file in "${FILES_TO_COPY[@]}"; do
    if [[ -f "$SOURCE_DIR/$file" ]]; then
      log_info "  Copying $file"
      if [[ $DRY_RUN -eq 0 ]]; then
        mkdir -p "$DEST_DIR"
        cp "$SOURCE_DIR/$file" "$DEST_DIR/"
      fi
    fi
  done
}

# Transform config files
transform_config() {
  log_info "Transforming configuration files..."

  # Copy and transform openclaw.json to sybilclaw.json
  if [[ -f "$SOURCE_DIR/openclaw.json" ]]; then
    log_info "  Transforming openclaw.json → sybilclaw.json"
    if [[ $DRY_RUN -eq 0 ]]; then
      mkdir -p "$DEST_DIR"
      # Copy first
      cp "$SOURCE_DIR/openclaw.json" "$DEST_DIR/sybilclaw.json"
      # Then transform paths
      if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS sed requires empty string for -i
        sed -i '' 's|/.openclaw/|/.sybilclaw/|g' "$DEST_DIR/sybilclaw.json"
      else
        sed -i 's|/.openclaw/|/.sybilclaw/|g' "$DEST_DIR/sybilclaw.json"
      fi
    fi
  fi

  # Transform cron/jobs.json
  if [[ -f "$DEST_DIR/cron/jobs.json" ]]; then
    log_info "  Transforming cron/jobs.json paths"
    if [[ $DRY_RUN -eq 0 ]]; then
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's|/.openclaw/|/.sybilclaw/|g' "$DEST_DIR/cron/jobs.json"
      else
        sed -i 's|/.openclaw/|/.sybilclaw/|g' "$DEST_DIR/cron/jobs.json"
      fi
    fi
  fi

  # Transform workspace/config/*.json files
  if [[ -d "$DEST_DIR/workspace/config" ]]; then
    log_info "  Transforming workspace/config/*.json paths"
    if [[ $DRY_RUN -eq 0 ]]; then
      while IFS= read -r -d '' json_file; do
        if [[ "$OSTYPE" == "darwin"* ]]; then
          sed -i '' 's|/.openclaw/|/.sybilclaw/|g' "$json_file"
        else
          sed -i 's|/.openclaw/|/.sybilclaw/|g' "$json_file"
        fi
      done < <(find "$DEST_DIR/workspace/config" -name "*.json" -type f -print0 2>/dev/null)
    fi
  fi
}

# Create openclaw → sybilclaw symlink for CLI compatibility
create_cli_symlink() {
  log_info "Creating openclaw CLI compatibility symlink..."

  # Find where sybilclaw is installed
  local sybilclaw_bin
  sybilclaw_bin=$(which sybilclaw 2>/dev/null || true)

  if [[ -z "$sybilclaw_bin" ]]; then
    log_warning "sybilclaw not found in PATH — skipping openclaw symlink"
    return 0
  fi

  # Resolve to real path (follow existing symlinks)
  local sybilclaw_real
  sybilclaw_real=$(readlink -f "$sybilclaw_bin" 2>/dev/null || realpath "$sybilclaw_bin" 2>/dev/null || echo "$sybilclaw_bin")

  # Determine target bin directory (same dir as sybilclaw)
  local bin_dir
  bin_dir=$(dirname "$sybilclaw_bin")
  local openclaw_link="$bin_dir/openclaw"

  # Check if openclaw already exists and points to the right place
  if [[ -L "$openclaw_link" ]]; then
    local existing_target
    existing_target=$(readlink "$openclaw_link")
    local sybilclaw_target
    sybilclaw_target=$(readlink "$sybilclaw_bin" 2>/dev/null || echo "")
    if [[ "$existing_target" == "$sybilclaw_target" || "$existing_target" == "$sybilclaw_real" ]]; then
      log_success "openclaw symlink already exists and is correct"
      return 0
    fi
    log_info "  Replacing existing openclaw symlink"
    if [[ $DRY_RUN -eq 0 ]]; then
      rm "$openclaw_link"
    fi
  elif [[ -e "$openclaw_link" ]]; then
    log_warning "$openclaw_link exists but is not a symlink — skipping to avoid overwriting"
    return 0
  fi

  # Get the relative target (same as sybilclaw's own symlink target if it's a symlink)
  local link_target
  if [[ -L "$sybilclaw_bin" ]]; then
    link_target=$(readlink "$sybilclaw_bin")
  else
    link_target="$sybilclaw_real"
  fi

  log_info "  Creating: $openclaw_link → $link_target"
  if [[ $DRY_RUN -eq 0 ]]; then
    ln -s "$link_target" "$openclaw_link"
    log_success "openclaw → sybilclaw symlink created (legacy CLI compatibility)"
  fi
}

# Update workspace scripts
update_workspace_scripts() {
  log_info "Updating workspace scripts..."

  # Get the directory where this script lives
  local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local source_script="$script_dir/session-summary.sh"
  local dest_scripts_dir="$DEST_DIR/workspace/scripts"
  local dest_script="$dest_scripts_dir/session-summary.sh"

  if [[ -f "$source_script" ]]; then
    log_info "  Installing session-summary.sh to workspace/scripts/"
    if [[ $DRY_RUN -eq 0 ]]; then
      mkdir -p "$dest_scripts_dir"

      # Check if we should update (repo version is newer or dest doesn't exist)
      local should_copy=0
      if [[ ! -f "$dest_script" ]]; then
        should_copy=1
      elif [[ "$source_script" -nt "$dest_script" ]]; then
        should_copy=1
      fi

      if [[ $should_copy -eq 1 ]]; then
        cp "$source_script" "$dest_script"
        chmod +x "$dest_script"

        # Update WORKSPACE_ROOT default
        if [[ "$OSTYPE" == "darwin"* ]]; then
          sed -i '' 's|WORKSPACE_ROOT="${WORKSPACE_ROOT:-\$HOME/.openclaw/workspace}"|WORKSPACE_ROOT="${WORKSPACE_ROOT:-\$HOME/.sybilclaw/workspace}"|g' "$dest_script"
        else
          sed -i 's|WORKSPACE_ROOT="${WORKSPACE_ROOT:-\$HOME/.openclaw/workspace}"|WORKSPACE_ROOT="${WORKSPACE_ROOT:-\$HOME/.sybilclaw/workspace}"|g' "$dest_script"
        fi
        log_success "  session-summary.sh installed and updated"
      fi
    fi
  fi
}

# Verification checks
verify_migration() {
  log_info "Verifying migration..."

  local failed=0

  # Check sybilclaw.json exists and is valid JSON
  if [[ -f "$DEST_DIR/sybilclaw.json" ]]; then
    if python3 -m json.tool "$DEST_DIR/sybilclaw.json" > /dev/null 2>&1; then
      log_success "sybilclaw.json exists and is valid JSON"
    else
      log_error "sybilclaw.json is invalid JSON"
      failed=1
    fi
  else
    log_error "sybilclaw.json does not exist"
    failed=1
  fi

  # Check critical directories exist
  for dir in "agents" "credentials"; do
    if [[ -d "$DEST_DIR/$dir" || ! -d "$SOURCE_DIR/$dir" ]]; then
      log_success "$dir/ directory verified"
    else
      log_error "$dir/ directory missing"
      failed=1
    fi
  done

  # Check workspace exists (if it existed in source)
  if [[ -d "$SOURCE_DIR/workspace" ]]; then
    if [[ -d "$DEST_DIR/workspace" ]]; then
      log_success "workspace/ directory verified"
    else
      log_error "workspace/ directory missing"
      failed=1
    fi
  fi

  # Check cron/jobs.json if it existed
  if [[ -f "$SOURCE_DIR/cron/jobs.json" ]]; then
    if [[ -f "$DEST_DIR/cron/jobs.json" ]]; then
      log_success "cron/jobs.json verified"
    else
      log_error "cron/jobs.json missing"
      failed=1
    fi
  fi

  # Check for remaining /.openclaw/ references in sybilclaw.json
  if [[ -f "$DEST_DIR/sybilclaw.json" ]]; then
    if grep -q "/.openclaw/" "$DEST_DIR/sybilclaw.json"; then
      log_warning "Found remaining /.openclaw/ references in sybilclaw.json"
      failed=1
    else
      log_success "No /.openclaw/ references in sybilclaw.json"
    fi
  fi

  # Check for remaining /.openclaw/ references in cron/jobs.json
  if [[ -f "$DEST_DIR/cron/jobs.json" ]]; then
    if grep -q "/.openclaw/" "$DEST_DIR/cron/jobs.json"; then
      log_warning "Found remaining /.openclaw/ references in cron/jobs.json"
      failed=1
    else
      log_success "No /.openclaw/ references in cron/jobs.json"
    fi
  fi

  return $failed
}

# Print completion summary
print_completion() {
  local verification_result=$1

  cat <<EOF

${BLUE}════════════════════════════════════════════════════════════════${NC}
EOF

  if [[ $verification_result -eq 0 ]]; then
    cat <<EOF
${GREEN}✅ Migration complete${NC}
${BLUE}════════════════════════════════════════════════════════════════${NC}

  Source:      $SOURCE_DIR ${GREEN}(untouched — kept as backup)${NC}
  Destination: $DEST_DIR
  Config:      sybilclaw.json ${GREEN}(transformed)${NC}
  Log:         $LOG_FILE

${YELLOW}Next steps:${NC}
  1. Restart SybilClaw: ${BLUE}sybilclaw gateway restart${NC}
  2. Verify it works: ${BLUE}sybilclaw status${NC}
  3. Once confirmed working, you can delete the backup:
     ${BLUE}rm -rf $SOURCE_DIR${NC}

${BLUE}════════════════════════════════════════════════════════════════${NC}
EOF
  else
    cat <<EOF
${YELLOW}⚠️  Migration completed with warnings${NC}
${BLUE}════════════════════════════════════════════════════════════════${NC}

  Check the log file for details: $LOG_FILE

  Some verification checks failed. Please review the warnings above.
  You may need to manually verify or fix some configuration files.

${BLUE}════════════════════════════════════════════════════════════════${NC}
EOF
  fi
}

# Main execution
main() {
  # Initialize log
  echo "=== SybilClaw Migration Log ===" > "$LOG_FILE"
  log "Migration started at $(date)"
  log "Source: $SOURCE_DIR"
  log "Destination: $DEST_DIR"

  if [[ $DRY_RUN -eq 1 ]]; then
    log_info "DRY RUN MODE - No changes will be made"
  fi

  validate_preconditions
  print_summary
  confirm_migration

  log_info "Starting migration..."

  backup_existing_destination
  copy_directories
  copy_files
  transform_config
  update_workspace_scripts
  create_cli_symlink

  if [[ $DRY_RUN -eq 1 ]]; then
    log_info "DRY RUN COMPLETE - No actual changes were made"
    exit 0
  fi

  verify_migration
  local verification_result=$?

  print_completion $verification_result

  log "Migration completed at $(date)"

  # Clear trap on successful completion
  trap - EXIT

  exit $verification_result
}

# Run main
main
