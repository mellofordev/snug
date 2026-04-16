#!/usr/bin/env bash
#
# update-remotion-skill.sh
#
# Maintainer-only helper. Refreshes the vendored copy of Remotion's official
# Agent Skill (remotion-best-practices) that ships inside every new Snug
# project via the scaffold template.
#
# Pulls from:
#   https://github.com/remotion-dev/remotion
#   packages/skills/skills/remotion/
#
# Writes into:
#   packages/scaffold/template/.claude/skills/remotion-best-practices/
#   packages/scaffold/template/.codex/skills/remotion-best-practices/
#
# Also writes a SOURCE.txt alongside each copy recording the upstream commit
# SHA. The hot path (project scaffolding) never runs this — contributors run
# it manually when bumping the vendored skill.

set -euo pipefail

UPSTREAM_REPO="https://github.com/remotion-dev/remotion.git"
UPSTREAM_SUBPATH="packages/skills/skills/remotion"
SKILL_NAME="remotion-best-practices"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATE_DIR="${SCAFFOLD_DIR}/template"

CLAUDE_TARGET="${TEMPLATE_DIR}/.claude/skills/${SKILL_NAME}"
CODEX_TARGET="${TEMPLATE_DIR}/.codex/skills/${SKILL_NAME}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required on PATH" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d -t snug-remotion-skill.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[update-remotion-skill] sparse-checking out ${UPSTREAM_SUBPATH} from $UPSTREAM_REPO ..."
(
  cd "$TMP_DIR"
  git clone --depth 1 --filter=blob:none --sparse "$UPSTREAM_REPO" remotion >/dev/null 2>&1
  cd remotion
  git sparse-checkout set "$UPSTREAM_SUBPATH" >/dev/null
)

UPSTREAM_SKILL_DIR="$TMP_DIR/remotion/${UPSTREAM_SUBPATH}"
if [[ ! -d "$UPSTREAM_SKILL_DIR" ]]; then
  echo "upstream skill directory not found at ${UPSTREAM_SUBPATH}" >&2
  exit 1
fi

COMMIT_SHA="$(cd "$TMP_DIR/remotion" && git rev-parse HEAD)"
COMMIT_DATE="$(cd "$TMP_DIR/remotion" && git log -1 --format=%cI HEAD)"

copy_into() {
  local dest="$1"
  echo "[update-remotion-skill] refreshing $dest"
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "${UPSTREAM_SKILL_DIR}/." "$dest/"
  cat >"${dest}/SOURCE.txt" <<EOF
Vendored from ${UPSTREAM_REPO}
subpath: ${UPSTREAM_SUBPATH}
commit:  ${COMMIT_SHA}
date:    ${COMMIT_DATE}
EOF
}

copy_into "$CLAUDE_TARGET"
copy_into "$CODEX_TARGET"

echo "[update-remotion-skill] done. commit ${COMMIT_SHA}"
