#!/usr/bin/env bash
# render-composition.sh — Render a Snug composition to an MP4.
#
# Usage: render-composition.sh <project-dir> <composition-id> <output-file.mp4> [framework]
#
# Framework defaults to "remotion" for projects created before hyperframes support.
# Runs inside the Snug project so the framework's local CLI (from package.json) is used.

set -euo pipefail

PROJECT_DIR="${1:?usage: render-composition.sh <project-dir> <composition-id> <output-path> [framework]}"
COMPOSITION_ID="${2:?}"
OUTPUT_PATH="${3:?}"
FRAMEWORK="${4:-remotion}"

if [[ ! -f "${PROJECT_DIR}/package.json" ]]; then
  echo "Not a Snug project (no package.json): ${PROJECT_DIR}" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

cd "$PROJECT_DIR"

case "$FRAMEWORK" in
  remotion)
    # Resolves @remotion/cli from the project's node_modules (same as local `npx remotion`).
    exec bunx remotion render src/index.ts "$COMPOSITION_ID" --output "$OUTPUT_PATH"
    ;;
  hyperframes)
    COMP_DIR="compositions/${COMPOSITION_ID}"
    if [[ ! -f "${COMP_DIR}/index.html" ]]; then
      echo "Composition not found: ${COMP_DIR}/index.html" >&2
      exit 1
    fi
    # Hyperframes renders a directory containing index.html. `--output` is the full flag name.
    exec bunx hyperframes render "$COMP_DIR" --output "$OUTPUT_PATH"
    ;;
  *)
    echo "Unknown framework: $FRAMEWORK" >&2
    exit 1
    ;;
esac
