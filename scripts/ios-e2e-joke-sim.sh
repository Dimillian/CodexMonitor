#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

UDID="${1:-}"
if [[ -z "${UDID}" ]]; then
  UDID="$(xcrun simctl list devices booted | rg -o '[0-9A-Fa-f-]{36}' | head -n 1 || true)"
fi

if [[ -z "${UDID}" ]]; then
  echo "[ios-e2e] No booted simulator found."
  echo "[ios-e2e] Boot one first (e.g. via Simulator.app), then rerun:"
  echo "          scripts/ios-e2e-joke-sim.sh"
  exit 1
fi

OUT_DIR="${ROOT_DIR}/.run/ios"
mkdir -p "${OUT_DIR}"

export VITE_E2E=1

if [[ -z "${CODEXMONITOR_CLOUDKIT_CONTAINER_ID:-}" ]]; then
  echo "[ios-e2e] CODEXMONITOR_CLOUDKIT_CONTAINER_ID is not set."
  echo "[ios-e2e] CloudKit access will likely fail without a container identifier."
fi

echo "[ios-e2e] Building + launching with VITE_E2E=1..."
scripts/ios-run-sim.sh "${UDID}"

echo "[ios-e2e] Waiting for CloudKit command/response..."
sleep 25

STAMP="$(date +%Y%m%d-%H%M%S)"
SCREENSHOT_PATH="${OUT_DIR}/e2e-joke-${STAMP}.png"
echo "[ios-e2e] Taking screenshot: ${SCREENSHOT_PATH}"
xcrun simctl io "${UDID}" screenshot "${SCREENSHOT_PATH}"

echo "[ios-e2e] Done."
