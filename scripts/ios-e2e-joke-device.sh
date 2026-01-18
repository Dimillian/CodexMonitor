#!/usr/bin/env bash
set -euo pipefail

DEVICE_NAME="${1:-iPad von Peter (2)}"

export PATH="$HOME/.cargo/bin:$PATH"
export VITE_E2E=1

APPLE_TEAM_DEFAULT="ZAMR4EWP34"
export APPLE_DEVELOPMENT_TEAM="${APPLE_DEVELOPMENT_TEAM:-$APPLE_TEAM_DEFAULT}"
APP_BUNDLE_ID="${APP_BUNDLE_ID:-com.ilass.codexmonitor}"

echo "[ios-e2e] Device: ${DEVICE_NAME}"
echo "[ios-e2e] Team: ${APPLE_DEVELOPMENT_TEAM}"
echo "[ios-e2e] Building (debug, device aarch64) with VITE_E2E=1..."
rm -rf "${PWD}/src-tauri/gen/apple/build" || true
if [[ ! -d "${PWD}/src-tauri/gen/apple" ]]; then
  npx tauri ios init
fi
npx tauri ios build --debug --target aarch64

echo "[ios-e2e] Looking for CodexMonitor.app (debug-iphoneos)..."
UDID="$(
  xcrun xctrace list devices 2>/dev/null \
    | grep -F "${DEVICE_NAME}" \
    | head -n 1 \
    | sed -n 's/.*(\([0-9a-fA-F-]\{8,\}\)).*/\1/p'
)"
if [[ -z "${UDID}" ]]; then
  echo "[ios-e2e] ERROR: Could not find UDID for device: ${DEVICE_NAME}" >&2
  exit 1
fi

APP_PATH="$(
  find "$HOME/Library/Developer/Xcode/DerivedData" \
    -type d \
    -path '*/Build/Products/debug-iphoneos/CodexMonitor.app' \
    -print0 \
    | xargs -0 ls -td 2>/dev/null \
    | head -n 1 \
    || true
)"

if [[ -z "${APP_PATH}" ]]; then
  echo "[ios-e2e] ERROR: Could not find built CodexMonitor.app in DerivedData." >&2
  exit 1
fi

echo "[ios-e2e] Installing app: ${APP_PATH}"
xcrun devicectl device install app --device "${UDID}" "${APP_PATH}"

echo "[ios-e2e] Launching bundle id: ${APP_BUNDLE_ID}"
xcrun devicectl device process launch --terminate-existing --device "${UDID}" "${APP_BUNDLE_ID}"

echo "[ios-e2e] Launched. The app should auto-run the E2E joke test (Status should become PASS)."
