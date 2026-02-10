#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/android_env.sh"

DEVICE=""
HOST=""
OPEN_ANDROID_STUDIO=0
RELEASE_MODE=0
NO_WATCH=0
LIST_DEVICES=0
SKIP_INIT=0

usage() {
  cat <<'EOF'
Usage: scripts/build_run_android.sh [options]

Builds and runs CodexMonitor in Android development mode.

Options:
  --device <name|id>  Run on a specific connected/emulated device
  --host <address>    Public dev-server host for physical device testing
  --open              Open Android Studio instead of auto-running on device
  --release           Run in release mode
  --no-watch          Disable file watching
  --list-devices      List devices via adb and exit
  --skip-init         Skip Android project initialization check
  -h, --help          Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      DEVICE="${2:-}"
      shift 2
      ;;
    --host)
      HOST="${2:-}"
      shift 2
      ;;
    --open)
      OPEN_ANDROID_STUDIO=1
      shift
      ;;
    --release)
      RELEASE_MODE=1
      shift
      ;;
    --no-watch)
      NO_WATCH=1
      shift
      ;;
    --list-devices)
      LIST_DEVICES=1
      shift
      ;;
    --skip-init)
      SKIP_INIT=1
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

if [[ "$LIST_DEVICES" -eq 1 ]]; then
  ensure_android_env
  if ! command -v adb >/dev/null 2>&1; then
    echo "adb is not available in PATH." >&2
    echo "Install Android Platform Tools and ensure adb is available." >&2
    exit 1
  fi
  adb devices -l
  exit 0
fi

if [[ "$SKIP_INIT" -eq 0 ]]; then
  "$ROOT_DIR/scripts/init_android.sh"
fi

ensure_android_env

NPM_BIN="$(resolve_npm || true)"
if [[ -z "$NPM_BIN" ]]; then
  echo "Unable to find npm in PATH or common install locations." >&2
  echo "Install Node/npm, or run from a shell where npm is available." >&2
  exit 1
fi

cmd=("$NPM_BIN" run tauri -- android dev)
if [[ "$OPEN_ANDROID_STUDIO" -eq 1 ]]; then
  cmd+=(--open)
fi
if [[ "$RELEASE_MODE" -eq 1 ]]; then
  cmd+=(--release)
fi
if [[ "$NO_WATCH" -eq 1 ]]; then
  cmd+=(--no-watch)
fi
if [[ -n "$HOST" ]]; then
  cmd+=(--host "$HOST")
fi
if [[ -n "$DEVICE" ]]; then
  cmd+=("$DEVICE")
fi

"${cmd[@]}"
