#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEVICE=""
TARGET="${TARGET:-aarch64}"
BUNDLE_ID="${BUNDLE_ID:-com.dimillian.codexmonitor.ios}"
DEVELOPMENT_TEAM="${APPLE_DEVELOPMENT_TEAM:-}"
SKIP_BUILD=0
OPEN_XCODE=0
LIST_DEVICES=0
IOS_APP_ICONSET_DIR="src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset"

usage() {
  cat <<'EOF'
Usage: scripts/build_run_ios_device.sh [options]

Builds the iOS app for physical devices, installs it to a USB-connected iPhone/iPad,
and launches it using devicectl.

Options:
  --device <id|name>   Required unless --list-devices is used.
                       Accepts UDID, serial, UUID, or device name.
  --target <target>    Tauri iOS target (default: aarch64)
  --bundle-id <id>     Bundle id to launch (default: com.dimillian.codexmonitor.ios)
  --team <id>          Apple development team ID (sets APPLE_DEVELOPMENT_TEAM)
  --skip-build         Skip build and only install + launch existing app
  --open-xcode         Open Xcode after build instead of install/launch via devicectl
  --list-devices       Print devices known by devicectl and exit
  -h, --help           Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      DEVICE="${2:-}"
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
    --team)
      DEVELOPMENT_TEAM="${2:-}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --open-xcode)
      OPEN_XCODE=1
      shift
      ;;
    --list-devices)
      LIST_DEVICES=1
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
  if compgen -G "src-tauri/icons/ios/*.png" >/dev/null; then
    cp -f src-tauri/icons/ios/*.png "$IOS_APP_ICONSET_DIR"/
  fi
}

has_configured_ios_team() {
  node -e '
    const fs = require("fs");
    const baseCfg = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
    let iosCfg = {};
    try {
      iosCfg = JSON.parse(fs.readFileSync("src-tauri/tauri.ios.conf.json", "utf8"));
    } catch (_) {}
    const team = iosCfg?.bundle?.iOS?.developmentTeam ?? baseCfg?.bundle?.iOS?.developmentTeam;
    process.exit(team && String(team).trim() ? 0 : 1);
  ' >/dev/null 2>&1
}

if ! xcrun devicectl --help >/dev/null 2>&1; then
  echo "xcrun devicectl is unavailable. Update Xcode to a version that includes CoreDevice tooling." >&2
  exit 1
fi

if [[ "$LIST_DEVICES" -eq 1 ]]; then
  xcrun devicectl list devices --columns Name Identifier DeviceClass Platform | sed -n '1,200p'
  exit 0
fi

if [[ "$OPEN_XCODE" -eq 0 && -z "$DEVICE" ]]; then
  echo "--device is required for install/launch. Use --list-devices to discover IDs." >&2
  exit 1
fi

NPM_BIN="$(resolve_npm || true)"
if [[ -z "$NPM_BIN" ]]; then
  echo "Unable to find npm in PATH or common install locations." >&2
  echo "Install Node/npm, or run from a shell where npm is available." >&2
  exit 1
fi

if [[ -n "$DEVELOPMENT_TEAM" ]]; then
  export APPLE_DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM"
fi

if [[ "$SKIP_BUILD" -eq 0 && -z "${APPLE_DEVELOPMENT_TEAM:-}" ]]; then
  if ! has_configured_ios_team; then
    echo "Missing iOS signing team." >&2
    echo "Set one via --team <TEAM_ID> or APPLE_DEVELOPMENT_TEAM, or set bundle.iOS.developmentTeam in src-tauri/tauri.ios.conf.json (or src-tauri/tauri.conf.json)." >&2
    echo "Tip: First-time setup can be done with --open-xcode." >&2
    exit 1
  fi
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  sync_ios_icons
  if [[ "$OPEN_XCODE" -eq 1 ]]; then
    "$NPM_BIN" run tauri -- ios build -d -t "$TARGET" --open
    exit 0
  fi
  "$NPM_BIN" run tauri -- ios build -d -t "$TARGET" --ci
fi

APP_PATH="src-tauri/gen/apple/build/arm64/Codex Monitor.app"
if [[ ! -d "$APP_PATH" ]]; then
  APP_PATH="$(find src-tauri/gen/apple/build -maxdepth 4 -type d -name 'Codex Monitor.app' | head -n 1 || true)"
fi

if [[ -z "$APP_PATH" || ! -d "$APP_PATH" ]]; then
  echo "Built app not found under src-tauri/gen/apple/build." >&2
  exit 1
fi

xcrun devicectl device install app --device "$DEVICE" "$APP_PATH"
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing "$BUNDLE_ID"

echo
echo "Installed and launched ${BUNDLE_ID} on device '${DEVICE}'."
