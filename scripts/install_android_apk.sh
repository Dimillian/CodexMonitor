#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PACKAGE_ID="com.dimillian.codexmonitor.android"
ACTIVITY_NAME=".MainActivity"
DEVICE_ID=""
APK_PATH="src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
LIST_DEVICES=0
SKIP_LAUNCH=0

usage() {
  cat <<'EOF'
Usage: scripts/install_android_apk.sh [options]

Installs a built CodexMonitor APK to an Android device (phone or emulator) via adb.

Options:
  --device <id>     adb device id (default: first connected device)
  --apk <path>      APK path (default: debug universal APK)
  --list-devices    List connected devices and exit
  --skip-launch     Install only (do not launch app)
  -h, --help        Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      DEVICE_ID="${2:-}"
      shift 2
      ;;
    --apk)
      APK_PATH="${2:-}"
      shift 2
      ;;
    --list-devices)
      LIST_DEVICES=1
      shift
      ;;
    --skip-launch)
      SKIP_LAUNCH=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is not available in PATH." >&2
  exit 1
fi

if [[ "$LIST_DEVICES" -eq 1 ]]; then
  adb devices -l
  exit 0
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "APK not found: $APK_PATH" >&2
  echo "Build one first with: ./scripts/build_android.sh --apk-only --debug" >&2
  exit 1
fi

if [[ -z "$DEVICE_ID" ]]; then
  DEVICE_ID="$(
    adb devices | awk 'NR>1 && $2=="device" {print $1; exit}'
  )"
fi

if [[ -z "$DEVICE_ID" ]]; then
  echo "No connected Android device found." >&2
  echo "Run with --list-devices after connecting a phone/emulator." >&2
  exit 1
fi

echo "Installing $APK_PATH to $DEVICE_ID..."
adb -s "$DEVICE_ID" install -r -d "$APK_PATH"

if [[ "$SKIP_LAUNCH" -eq 0 ]]; then
  echo "Launching ${PACKAGE_ID}/${ACTIVITY_NAME} on $DEVICE_ID..."
  adb -s "$DEVICE_ID" shell am start -n "${PACKAGE_ID}/${ACTIVITY_NAME}"
fi

echo "Done."
