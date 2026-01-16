#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

DEVICE="${1:-iPad von Peter (2)}"
CONTAINER_ID="${CODEXMONITOR_CLOUDKIT_CONTAINER_ID:-iCloud.com.ilass.codexmonitor}"
BUNDLE_ID="${BUNDLE_ID:-com.ilass.codexmonitor}"
APP_BIN="${APP_BIN:-${ROOT_DIR}/src-tauri/target/release/bundle/macos/CodexMonitor.app/Contents/MacOS/codex-monitor}"

OUT_DIR="${ROOT_DIR}/.run/ios/device"
mkdir -p "${OUT_DIR}"

export VITE_E2E=1
export CODEXMONITOR_CLOUDKIT_CONTAINER_ID="${CONTAINER_ID}"

echo "[ios-e2e-device] Building + installing with VITE_E2E=1..."
scripts/ios-build-device.sh

APP_PATH="${ROOT_DIR}/src-tauri/gen/apple/build/arm64/CodexMonitor.app"
if [[ ! -d "${APP_PATH}" ]]; then
  echo "[ios-e2e-device] Expected app bundle not found at: ${APP_PATH}" >&2
  exit 1
fi

echo "[ios-e2e-device] Installing to device: ${DEVICE}"
xcrun devicectl device install app --device "${DEVICE}" "${APP_PATH}"

STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_PATH="${OUT_DIR}/e2e-${STAMP}.log"
echo "[ios-e2e-device] Launching ${BUNDLE_ID} on ${DEVICE}..."

START_MS="$(python3 -c 'import time; print(int(time.time()*1000))')"

/usr/bin/env DEVICECTL_CHILD_CODEXMONITOR_CLOUDKIT_CONTAINER_ID="${CONTAINER_ID}" \
  xcrun devicectl device process launch \
  --device "${DEVICE}" \
  --terminate-existing \
  --activate \
  "${BUNDLE_ID}" > "${LOG_PATH}" 2>&1 || true

echo "[ios-e2e-device] Launch output:"
tail -n 120 "${LOG_PATH}" || true

if [[ ! -x "${APP_BIN}" ]]; then
  echo "[ios-e2e-device] Error: macOS app binary not found/executable at: ${APP_BIN}" >&2
  exit 1
fi

echo "[ios-e2e-device] Waiting for CloudKit command result (this verifies iPad -> CloudKit -> Mac runner -> Codex -> CloudKit)..."

DEADLINE_MS=$((START_MS + 180000))
while true; do
  NOW_MS="$(python3 -c 'import time; print(int(time.time()*1000))')"
  if (( NOW_MS > DEADLINE_MS )); then
    echo "[ios-e2e-device] Timed out waiting for CloudKit command result." >&2
    exit 1
  fi

  RUNNER_JSON="$("${APP_BIN}" --cloudkit-latest-runner "${CONTAINER_ID}" 2>/dev/null || true)"
  RUNNER_ID="$(python3 - <<'PY' "${RUNNER_JSON}"
import json,sys
raw=sys.argv[1].strip()
if not raw:
  sys.exit(0)
try:
  data=json.loads(raw)
  print(data.get("runnerId",""))
except Exception:
  pass
PY
)"
  if [[ -z "${RUNNER_ID}" ]]; then
    sleep 2
    continue
  fi

  RES_JSON="$("${APP_BIN}" --cloudkit-latest-command-result "${CONTAINER_ID}" "${RUNNER_ID}" 2>/dev/null || true)"
  OK="$(python3 - <<'PY' "${RES_JSON}" "${START_MS}"
import json,sys
raw=sys.argv[1].strip()
start=int(sys.argv[2])
if not raw:
  sys.exit(0)
try:
  data=json.loads(raw)
except Exception:
  sys.exit(0)
if not data:
  sys.exit(0)
created=int(data.get("createdAtMs") or 0)
if created < start:
  sys.exit(0)
if not data.get("ok"):
  sys.exit(0)
payload=data.get("payloadJson") or ""
try:
  inner=json.loads(payload)
except Exception:
  inner={}
assistant=(inner.get("assistantText") or "").strip()
if not assistant:
  sys.exit(0)
print("1")
PY
)"
  if [[ "${OK}" == "1" ]]; then
    echo "[ios-e2e-device] E2E SUCCESS"
    exit 0
  fi

  sleep 2
done
