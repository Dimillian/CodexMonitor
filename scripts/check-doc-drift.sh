#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="${1:-}"
HEAD_SHA="${2:-HEAD}"
LOCAL_MODE=0

if [[ -z "${BASE_SHA}" ]]; then
  if [[ -n "${GITHUB_BASE_REF:-}" ]]; then
    git fetch --no-tags --prune --depth=1 origin "${GITHUB_BASE_REF}"
    BASE_SHA="$(git merge-base "origin/${GITHUB_BASE_REF}" "${HEAD_SHA}")"
  elif [[ -n "${GITHUB_EVENT_BEFORE:-}" && "${GITHUB_EVENT_BEFORE}" != "0000000000000000000000000000000000000000" ]]; then
    BASE_SHA="${GITHUB_EVENT_BEFORE}"
  else
    LOCAL_MODE=1
    BASE_SHA="WORKTREE"
  fi
fi

if [[ "${LOCAL_MODE}" -eq 1 ]]; then
  CHANGED_FILES="$(
    {
      git diff --name-only HEAD
      git diff --name-only --cached
      git ls-files --others --exclude-standard
    } | sort -u
  )"
  echo "Doc drift check range: WORKTREE (HEAD + staged + untracked)"
else
  CHANGED_FILES="$(git diff --name-only "${BASE_SHA}" "${HEAD_SHA}")"
  echo "Doc drift check range: ${BASE_SHA}..${HEAD_SHA}"
fi

echo "Changed files:"
echo "${CHANGED_FILES}"

has_changes_in() {
  local pattern="$1"
  echo "${CHANGED_FILES}" | grep -E -q "${pattern}"
}

require_doc_update() {
  local trigger_pattern="$1"
  local required_doc_pattern="$2"
  local message="$3"
  if has_changes_in "${trigger_pattern}" && ! has_changes_in "${required_doc_pattern}"; then
    echo "ERROR: ${message}"
    return 1
  fi
  return 0
}

FAILED=0

require_doc_update "^(src/|src-tauri/)" "^(docs/codebase-map\\.md|docs/ai/|docs/reference/|docs/how-to/|docs/explanation/)" \
  "Backend/frontend code changed without required docs updates (codebase map or domain docs)." || FAILED=1

require_doc_update "^\\.github/workflows/" "^docs/ci-cd/" \
  "Workflow changed without docs/ci-cd update." || FAILED=1

require_doc_update "^e2e/" "^docs/testing/" \
  "E2E changed without docs/testing update." || FAILED=1

require_doc_update "^(src/styles/|src/features/.*/components/)" "^docs/ui-ux/" \
  "UI layer changed without docs/ui-ux update." || FAILED=1

if [[ "${FAILED}" -ne 0 ]]; then
  echo "Doc drift gate failed."
  exit 1
fi

echo "Doc drift gate passed."
