#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"
WORKTREES_DIR="$ROOT_DIR/.worktrees"
DEFAULT_BASE_BRANCH="main"

usage() {
  cat <<'EOF'
Usage:
  ./wt.sh create <issue> <short-desc>     Create a worktree for issue
  ./wt.sh list                             List active worktrees
  ./wt.sh path <issue>                     Print worktree path for issue
  ./wt.sh remove <issue> [--branch]        Remove worktree, optionally delete branch
  ./wt.sh dev <issue> [default|alt]        Run npm run dev/dev:alt in issue worktree
  ./wt.sh build <issue>                    Run npm run build in issue worktree
  ./wt.sh start <issue> [tray]             Run npm run start/start:tray in issue worktree
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

slugify() {
  local input="$*"
  input="$(printf '%s' "$input" | tr '[:upper:]' '[:lower:]')"
  input="$(printf '%s' "$input" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g')"
  printf '%s' "$input"
}

issue_prefix() {
  printf 'issue-%s-' "$1"
}

find_worktree_path() {
  local issue="$1"
  local prefix
  prefix="$(issue_prefix "$issue")"

  if [[ ! -d "$WORKTREES_DIR" ]]; then
    return 1
  fi

  local matches=()
  while IFS= read -r path; do
    matches+=("$path")
  done < <(python3 - <<'PY' "$WORKTREES_DIR" "$prefix"
import os
import sys
root, prefix = sys.argv[1], sys.argv[2]
if os.path.isdir(root):
    for name in sorted(os.listdir(root)):
        full = os.path.join(root, name)
        if name.startswith(prefix) and os.path.isdir(full):
            print(full)
PY
)

  if [[ ${#matches[@]} -eq 0 ]]; then
    return 1
  fi

  if [[ ${#matches[@]} -gt 1 ]]; then
    echo "Found multiple worktrees for issue #$issue:" >&2
    printf ' - %s\n' "${matches[@]}" >&2
    exit 1
  fi

  printf '%s' "${matches[0]}"
}

ensure_root_dirs() {
  mkdir -p "$WORKTREES_DIR"
}

create_worktree() {
  local issue="$1"
  shift
  local desc
  desc="$(slugify "$*")"

  if [[ -z "$issue" || -z "$desc" ]]; then
    echo "Usage: ./wt.sh create <issue> <short-desc>" >&2
    exit 1
  fi

  require_cmd git
  ensure_root_dirs

  local branch="feature/${issue}-${desc}"
  local path="$WORKTREES_DIR/issue-${issue}-${desc}"
  local root_env="$ROOT_DIR/.env"
  local worktree_env="$path/.env"

  if [[ -d "$path" ]]; then
    echo "Worktree already exists: $path" >&2
    exit 1
  fi

  if git -C "$ROOT_DIR" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$ROOT_DIR" worktree add "$path" "$branch"
  else
    git -C "$ROOT_DIR" worktree add "$path" -b "$branch" "$DEFAULT_BASE_BRANCH"
  fi

  if [[ -f "$worktree_env" ]]; then
    echo "Skipped .env copy: worktree already has .env"
  elif [[ -f "$root_env" ]]; then
    cp "$root_env" "$worktree_env"
    echo "Copied .env to worktree"
  else
    echo "Skipped .env copy: root .env not found"
  fi

  echo "Created worktree: $path"
  echo "Branch: $branch"
}

list_worktrees() {
  require_cmd git
  git -C "$ROOT_DIR" worktree list
}

print_worktree_path() {
  local issue="$1"

  if [[ -z "$issue" ]]; then
    echo "Usage: ./wt.sh path <issue>" >&2
    exit 1
  fi

  local path
  path="$(find_worktree_path "$issue")" || {
    echo "No worktree found for issue #$issue" >&2
    exit 1
  }

  echo "$path"
}

remove_worktree() {
  local issue="$1"
  local remove_branch="${2:-}"

  if [[ -z "$issue" ]]; then
    echo "Usage: ./wt.sh remove <issue> [--branch]" >&2
    exit 1
  fi

  require_cmd git

  local path
  path="$(find_worktree_path "$issue")" || {
    echo "No worktree found for issue #$issue" >&2
    exit 1
  }

  local branch
  branch="$(git -C "$path" branch --show-current)"

  git -C "$ROOT_DIR" worktree remove "$path"
  echo "Removed worktree: $path"

  if [[ "$remove_branch" == "--branch" ]]; then
    git -C "$ROOT_DIR" branch -D "$branch"
    echo "Removed branch: $branch"
  fi
}

run_in_worktree() {
  local issue="$1"
  shift

  local path
  path="$(find_worktree_path "$issue")" || {
    echo "No worktree found for issue #$issue" >&2
    exit 1
  }

  (cd "$path" && "$@")
}

run_dev() {
  local issue="$1"
  local mode="${2:-default}"

  case "$mode" in
    default) run_in_worktree "$issue" npm run dev ;;
    alt) run_in_worktree "$issue" npm run dev:alt ;;
    *)
      echo "Unsupported dev mode: $mode" >&2
      echo "Use one of: default, alt" >&2
      exit 1
      ;;
  esac
}

run_build() {
  local issue="$1"
  run_in_worktree "$issue" npm run build
}

run_start() {
  local issue="$1"
  local mode="${2:-default}"

  case "$mode" in
    default) run_in_worktree "$issue" npm run start ;;
    tray) run_in_worktree "$issue" npm run start:tray ;;
    *)
      echo "Unsupported start mode: $mode" >&2
      echo "Use one of: default, tray" >&2
      exit 1
      ;;
  esac
}

main() {
  local command="${1:-}"

  case "$command" in
    create)
      shift
      create_worktree "${1:-}" "${@:2}"
      ;;
    list)
      list_worktrees
      ;;
    path)
      shift
      print_worktree_path "${1:-}"
      ;;
    remove)
      shift
      remove_worktree "${1:-}" "${2:-}"
      ;;
    dev)
      shift
      run_dev "${1:-}" "${2:-default}"
      ;;
    build)
      shift
      run_build "${1:-}"
      ;;
    start)
      shift
      run_start "${1:-}" "${2:-default}"
      ;;
    ""|-h|--help|help)
      usage
      ;;
    *)
      echo "Unknown command: $command" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
