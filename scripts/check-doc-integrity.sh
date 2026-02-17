#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT_DIR}"

REQUIRED_FILES=(
  "AGENTS.md"
  "CLAUDE.md"
  "README.md"
  "docs/index.md"
  "docs/ai/agent-contract.md"
  "docs/codebase-map.md"
  "docs/testing/testing-strategy.md"
  "docs/ci-cd/pipeline-reference.md"
  "docs/debug/logging-and-troubleshooting.md"
  "docs/ui-ux/design-system-contract.md"
  "docs/explanation/documentation-policy.md"
)

FAILED=0

for file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "${file}" ]]; then
    echo "ERROR: required doc missing: ${file}"
    FAILED=1
  fi
done

while IFS='|' read -r md_file target; do
  [[ -z "${target}" ]] && continue
  [[ "${target}" == http://* || "${target}" == https://* || "${target}" == mailto:* ]] && continue
  [[ "${target}" == \#* ]] && continue

  target="${target%%#*}"
  if ! (cd "$(dirname "${md_file}")" && [[ -e "${target}" ]]); then
    echo "ERROR: broken local link in ${md_file} -> ${target}"
    FAILED=1
  fi
done < <(
  perl -ne 'while(/\]\(([^)]+)\)/g){print "$ARGV|$1\n"}' \
    AGENTS.md CLAUDE.md CONTRIBUTING.md SECURITY.md SUPPORT.md README.md $(find docs -type f -name "*.md" | sort)
)

if [[ "${FAILED}" -ne 0 ]]; then
  echo "Docs integrity check failed."
  exit 1
fi

echo "Docs integrity check passed."
