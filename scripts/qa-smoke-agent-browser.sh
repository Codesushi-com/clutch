#!/usr/bin/env bash
set -euo pipefail

# Smoke test the OpenClutch UI for a given project using Vercel agent-browser.
#
# Usage:
#   ./scripts/qa-smoke-agent-browser.sh <project-slug> [base-url]
#
# Example:
#   ./scripts/qa-smoke-agent-browser.sh the-clutch http://localhost:3002

SLUG="${1:-}"
BASE_URL="${2:-${CLUTCH_URL:-http://localhost:3002}}"

if [[ -z "$SLUG" ]]; then
  echo "Usage: $0 <project-slug> [base-url]" >&2
  exit 2
fi

SESSION="qa-${SLUG}-$$"
TITLE="QA smoke: ${SLUG} $(date +%Y-%m-%dT%H:%M:%S)"

ab() {
  # Use npx so the repo doesn't need a global install.
  npx -y agent-browser --session "$SESSION" "$@"
}

cleanup() {
  # Best-effort close; don't fail cleanup.
  ab close >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Ensure browser is installed (no-op if already installed)
ab install >/dev/null 2>&1 || true

# 1) Open board
ab open "${BASE_URL}/projects/${SLUG}/board" >/dev/null

# Wait until the page stabilizes
ab wait --load networkidle >/dev/null 2>&1 || true
ab wait --text "Board" >/dev/null

# 2) Open "New Ticket" dialog
ab find role button click --name "New Ticket" >/dev/null
ab wait --text "Create Task" >/dev/null

# 3) Fill in title + set priority + role QA
# (Refs are dialog-local and fairly stable, but we use semantic locators when possible.)
# Title textbox
ab find role textbox fill --name "Title" -- "${TITLE}" >/dev/null
# Priority: Medium
ab find role button click --name "Medium" >/dev/null
# Role: QA
ab find role combobox select --name "Role" --values "QA" >/dev/null 2>&1 || true

# 4) Create
ab find role button click --name "Create Task" >/dev/null

# 5) Assert task title appears somewhere on the board
ab wait --text "${TITLE}" >/dev/null

# 6) Screenshot for evidence
OUT="/tmp/clutch-qa-smoke-${SLUG}.png"
ab screenshot "$OUT" >/dev/null

echo "OK: smoke test passed for project '${SLUG}'"
echo "- created task title: ${TITLE}"
echo "- screenshot: ${OUT}"
