#!/usr/bin/env bash
# start-player.sh — Start the Remotion Vite player for a Snug project.
#
# - If .snug-player.lock points at a live process, prints the stored URL and exits.
# - Otherwise removes a stale lock, cds into the project, and execs `bun run player`.
#   The Electron main process spawns this script with a pipe; exec replaces this shell
#   with Bun/Vite so dev-server logs stream to Node without file buffering.
#
# Usage:  start-player.sh <project-dir>

set -euo pipefail

PROJECT_DIR="${1:?usage: start-player.sh <project-dir>}"
LOCK_FILE="${PROJECT_DIR}/.snug-player.lock"

if [[ ! -f "${PROJECT_DIR}/package.json" ]]; then
  echo "Not a Snug project (no package.json): ${PROJECT_DIR}" >&2
  exit 1
fi

if [[ -f "$LOCK_FILE" ]]; then
  stored_pid=$(grep '^pid=' "$LOCK_FILE" 2>/dev/null | cut -d= -f2 || true)
  stored_url=$(grep '^url=' "$LOCK_FILE" 2>/dev/null | cut -d= -f2 || true)

  if [[ -n "$stored_pid" ]] && kill -0 "$stored_pid" 2>/dev/null && [[ -n "$stored_url" ]]; then
    # Marker so Electron can tell reuse from a fresh Vite stream (do not rewrite lock with shell PID)
    echo "SNUG_PLAYER_REUSE"
    echo "$stored_url"
    exit 0
  fi

  rm -f "$LOCK_FILE"
fi

# Use a normalized absolute path so Bun always reads this project’s package.json (not Electron’s cwd).
cd "$(cd "$PROJECT_DIR" && pwd)" || exit 1
exec bun run player
