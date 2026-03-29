#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:?usage: init-project.sh <target-dir> <template-dir>}"
TEMPLATE_DIR="${2:?usage: init-project.sh <target-dir> <template-dir>}"

MARKER="${TARGET_DIR%/}/compositions/HelloWorld.tsx"

if [[ -f "$MARKER" ]]; then
  echo "Project already initialized (found HelloWorld.tsx). Skipping."
  exit 0
fi

if [[ ! -d "$TEMPLATE_DIR" ]]; then
  echo "Template directory not found: $TEMPLATE_DIR" >&2
  exit 1
fi

# Ensure target exists (may already be the empty dir created by the app)
mkdir -p "$TARGET_DIR"

# Copy template tree into target (exclude nothing — template is canonical)
cp -R "${TEMPLATE_DIR}/." "$TARGET_DIR/"

mkdir -p "${TARGET_DIR}/output"

(
  cd "$TARGET_DIR"
  bun install
)

echo "Scaffold complete: $TARGET_DIR"
