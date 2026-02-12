#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SIMULATOR_NAME="${SIMULATOR_NAME:-iPhone Air}"
TARGET="${TARGET:-aarch64-sim}"
BUNDLE_ID="${BUNDLE_ID:-com.dimillian.codexmonitor.ios}"
SKIP_BUILD=0
CLEAN_BUILD=1
IOS_APP_ICONSET_DIR="src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset"

usage() {
  cat <<'EOF'
Usage: scripts/build_run_ios.sh [options]

Builds the iOS simulator app, installs it on a booted simulator, and launches it.

Options:
  --simulator <name>   Simulator name (default: "iPhone Air")
  --target <target>    Tauri iOS target (default: "aarch64-sim")
  --bundle-id <id>     Bundle id to launch (default: com.dimillian.codexmonitor.ios)
  --skip-build         Skip the build and only install + launch the existing app
  --no-clean           Do not remove stale src-tauri/gen/apple/build before build
  -h, --help           Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --simulator)
      SIMULATOR_NAME="${2:-}"
      shift 2
      ;;
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --bundle-id)
      BUNDLE_ID="${2:-}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --no-clean)
      CLEAN_BUILD=0
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

resolve_npm() {
  if command -v npm >/dev/null 2>&1; then
    command -v npm
    return
  fi

  for candidate in /opt/homebrew/bin/npm /usr/local/bin/npm; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done

  if [[ -n "${NVM_DIR:-}" && -s "${NVM_DIR}/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    . "${NVM_DIR}/nvm.sh"
    if command -v npm >/dev/null 2>&1; then
      command -v npm
      return
    fi
  fi

  return 1
}

sync_ios_icons() {
  if [[ ! -d "$IOS_APP_ICONSET_DIR" ]]; then
    return
  fi
  if compgen -G "src-tauri/icons/ios/*.png" > /dev/null; then
    cp -f src-tauri/icons/ios/*.png "$IOS_APP_ICONSET_DIR"/
  fi
}

case "$TARGET" in
  aarch64-sim)
    APP_ARCH_DIR="arm64-sim"
    ;;
  x86_64-sim)
    APP_ARCH_DIR="x86_64-sim"
    ;;
  *)
    echo "Unsupported --target: $TARGET (expected aarch64-sim or x86_64-sim)" >&2
    exit 1
    ;;
esac

NPM_BIN="$(resolve_npm || true)"
if [[ -z "$NPM_BIN" ]]; then
  echo "Unable to find npm in PATH or common install locations." >&2
  echo "Install Node/npm, or run from a shell where npm is available." >&2
  exit 1
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  sync_ios_icons
  if [[ "$CLEAN_BUILD" -eq 1 ]]; then
    rm -rf src-tauri/gen/apple/build
  fi
  "$NPM_BIN" run tauri -- ios build -d -t "$TARGET" --ci
fi

APP_PATH="src-tauri/gen/apple/build/${APP_ARCH_DIR}/Codex Monitor.app"
if [[ ! -d "$APP_PATH" ]]; then
  FALLBACK_APP="$(find src-tauri/gen/apple/build -maxdepth 3 -type d -name 'Codex Monitor.app' | head -n 1 || true)"
  if [[ -n "$FALLBACK_APP" ]]; then
    APP_PATH="$FALLBACK_APP"
  fi
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "Built app not found at: $APP_PATH" >&2
  exit 1
fi

open -a Simulator || true
xcrun simctl boot "$SIMULATOR_NAME" >/dev/null 2>&1 || true
xcrun simctl bootstatus booted -b >/dev/null 2>&1 || true
xcrun simctl install booted "$APP_PATH"
xcrun simctl terminate booted "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl launch booted "$BUNDLE_ID"

echo
echo "Launched ${BUNDLE_ID} on simulator '${SIMULATOR_NAME}'."
