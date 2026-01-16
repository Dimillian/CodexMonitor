#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

APP_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/CodexMonitor.app"
PROFILE_PATH="${CODEXMONITOR_PROVISIONPROFILE:-$ROOT_DIR/codexmonitorMac.provisionprofile}"
ENTITLEMENTS_PATH="${CODEXMONITOR_ENTITLEMENTS:-$ROOT_DIR/src-tauri/entitlements.macos.plist}"
SIGNING_IDENTITY="${CODEXMONITOR_CODESIGN_IDENTITY:-Apple Development: Peter Vogel (HUDS4L39Y8)}"

echo "[macos-build-signed] building…"
cd "$ROOT_DIR"
PATH="$HOME/.cargo/bin:$PATH" npm run tauri build

if [[ ! -d "$APP_PATH" ]]; then
  echo "[macos-build-signed] error: app bundle not found at: $APP_PATH" >&2
  exit 1
fi

if [[ ! -f "$ENTITLEMENTS_PATH" ]]; then
  echo "[macos-build-signed] error: entitlements file not found at: $ENTITLEMENTS_PATH" >&2
  exit 1
fi

if [[ ! -f "$PROFILE_PATH" ]]; then
  echo "[macos-build-signed] error: provisioning profile not found at: $PROFILE_PATH" >&2
  echo "[macos-build-signed] tip: set CODEXMONITOR_PROVISIONPROFILE=/path/to/profile.provisionprofile" >&2
  exit 1
fi

echo "[macos-build-signed] embedding provisioning profile…"
cp "$PROFILE_PATH" "$APP_PATH/Contents/embedded.provisionprofile"

# Provisioning profiles downloaded from the Apple Developer portal can carry a
# quarantine xattr (e.g. if downloaded via Safari). Keeping it inside the app
# bundle can prevent the app from launching via LaunchServices.
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true

echo "[macos-build-signed] signing (nested)…"
codesign --force --deep --sign "$SIGNING_IDENTITY" "$APP_PATH"

echo "[macos-build-signed] signing (app entitlements)…"
codesign --force --sign "$SIGNING_IDENTITY" --entitlements "$ENTITLEMENTS_PATH" "$APP_PATH"

echo "[macos-build-signed] verifying…"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

echo "[macos-build-signed] done: $APP_PATH"
