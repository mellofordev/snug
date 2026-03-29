#!/usr/bin/env bash
# render-composition.sh — Run Remotion CLI to render one composition to an MP4.
#
# Usage: render-composition.sh <project-dir> <composition-id> <output-file.mp4>
#
# Runs inside the Snug project so local remotion / @remotion/cli from package.json are used.

set -euo pipefail

PROJECT_DIR="${1:?usage: render-composition.sh <project-dir> <composition-id> <output-path>}"
COMPOSITION_ID="${2:?}"
OUTPUT_PATH="${3:?}"

if [[ ! -f "${PROJECT_DIR}/package.json" ]]; then
  echo "Not a Snug project (no package.json): ${PROJECT_DIR}" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

cd "$PROJECT_DIR"

# Same as local `npx remotion`: resolves @remotion/cli from the project's node_modules
exec bunx remotion render src/index.ts "$COMPOSITION_ID" --output "$OUTPUT_PATH"
