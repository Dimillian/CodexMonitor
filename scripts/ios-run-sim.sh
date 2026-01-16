#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}"

UDID="${1:-}"
if [[ -z "${UDID}" ]]; then
  UDID="$(xcrun simctl list devices booted | rg -o '[0-9A-Fa-f-]{36}' | head -n 1 || true)"
fi

if [[ -z "${UDID}" ]]; then
  echo "[ios] No booted simulator found."
  echo "[ios] Boot one first (e.g. via Simulator.app), then rerun:"
  echo "      scripts/ios-run-sim.sh"
  exit 1
fi

OUT_DIR="${ROOT_DIR}/.run/ios"
mkdir -p "${OUT_DIR}"

APP_PATH="${ROOT_DIR}/src-tauri/gen/apple/build/arm64-sim/CodexMonitor.app"
BUNDLE_ID="${BUNDLE_ID:-com.ilass.codexmonitor}"

scripts/ios-build-sim.sh

echo "[ios] Installing to simulator ${UDID}..."
xcrun simctl install "${UDID}" "${APP_PATH}"

STDOUT_LOG="${OUT_DIR}/app-stdout.log"
STDERR_LOG="${OUT_DIR}/app-stderr.log"

echo "[ios] Launching ${BUNDLE_ID} (logs: ${STDOUT_LOG}, ${STDERR_LOG})..."
if [[ -n "${CODEXMONITOR_CLOUDKIT_CONTAINER_ID:-}" ]]; then
  echo "[ios] Setting CODEXMONITOR_CLOUDKIT_CONTAINER_ID for simulator runtime..."
  xcrun simctl spawn "${UDID}" launchctl setenv \
    CODEXMONITOR_CLOUDKIT_CONTAINER_ID "${CODEXMONITOR_CLOUDKIT_CONTAINER_ID}"
fi

xcrun simctl launch \
  --terminate-running-process \
  --stdout="${STDOUT_LOG}" \
  --stderr="${STDERR_LOG}" \
  "${UDID}" "${BUNDLE_ID}"

sleep 2

STAMP="$(date +%Y%m%d-%H%M%S)"
SCREENSHOT_PATH="${OUT_DIR}/screenshot-${STAMP}.png"
echo "[ios] Taking screenshot: ${SCREENSHOT_PATH}"
xcrun simctl io "${UDID}" screenshot "${SCREENSHOT_PATH}"

echo "[ios] Done."
