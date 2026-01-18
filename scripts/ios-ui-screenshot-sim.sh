#!/usr/bin/env bash
set -euo pipefail

SIM_NAME="${1:-iPad (A16)}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ART_DIR="${ROOT_DIR}/.codexmonitor-artifacts/ios"
mkdir -p "${ART_DIR}"

export PATH="$HOME/.cargo/bin:$PATH"
export VITE_E2E="${VITE_E2E:-1}"
APP_BUNDLE_ID="${APP_BUNDLE_ID:-com.ilass.codexmonitor}"
WAIT_SECS="${WAIT_SECS:-18}"

echo "[ios-sim-shot] Simulator: ${SIM_NAME}"

SIM_LINE="$(xcrun simctl list devices | grep -F "${SIM_NAME} (" | head -n 1 || true)"
if [[ -z "${SIM_LINE}" ]]; then
  echo "[ios-sim-shot] ERROR: simulator not found: ${SIM_NAME}" >&2
  exit 1
fi
SIM_UDID="$(echo "${SIM_LINE}" | sed -n 's/.*(\([0-9A-Fa-f-]\{8,\}\)).*/\1/p')"
if [[ -z "${SIM_UDID}" ]]; then
  echo "[ios-sim-shot] ERROR: failed to parse simulator UDID." >&2
  exit 1
fi

echo "[ios-sim-shot] UDID: ${SIM_UDID}"
xcrun simctl boot "${SIM_UDID}" >/dev/null 2>&1 || true
xcrun simctl bootstatus "${SIM_UDID}" -b

echo "[ios-sim-shot] Building (aarch64-sim)..."
rm -rf "${ROOT_DIR}/src-tauri/gen/apple/build" || true
if [[ ! -d "${ROOT_DIR}/src-tauri/gen/apple" ]]; then
  (cd "${ROOT_DIR}" && npx tauri ios init)
fi
(cd "${ROOT_DIR}" && npx tauri ios build --debug --target aarch64-sim)

APP_PATH="$(
  find "$HOME/Library/Developer/Xcode/DerivedData" \
    -type d \
    \( -path '*/Build/Products/Debug-iphonesimulator/CodexMonitor.app' -o -path '*/Build/Products/debug-iphonesimulator/CodexMonitor.app' \) \
    -print0 \
    | xargs -0 ls -td 2>/dev/null \
    | head -n 1 \
    || true
)"
if [[ -z "${APP_PATH}" ]]; then
  echo "[ios-sim-shot] ERROR: could not find built CodexMonitor.app (iphonesimulator)." >&2
  exit 1
fi

echo "[ios-sim-shot] Installing: ${APP_PATH}"
xcrun simctl uninstall "${SIM_UDID}" "${APP_BUNDLE_ID}" >/dev/null 2>&1 || true
xcrun simctl install "${SIM_UDID}" "${APP_PATH}"

echo "[ios-sim-shot] Launching..."
STAMP="$(date +%Y%m%d-%H%M%S)"
STDOUT_LOG="${ART_DIR}/sim-${SIM_UDID}-${STAMP}.stdout.log"
STDERR_LOG="${ART_DIR}/sim-${SIM_UDID}-${STAMP}.stderr.log"
xcrun simctl launch \
  --terminate-running-process \
  --stdout="${STDOUT_LOG}" \
  --stderr="${STDERR_LOG}" \
  "${SIM_UDID}" \
  "${APP_BUNDLE_ID}" \
  >/dev/null || true

sleep "${WAIT_SECS}"

OUT="${ART_DIR}/sim-${SIM_UDID}-${STAMP}.png"
echo "[ios-sim-shot] Screenshot: ${OUT}"
xcrun simctl io "${SIM_UDID}" screenshot "${OUT}"

echo "[ios-sim-shot] Done."
