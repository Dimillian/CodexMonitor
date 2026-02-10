#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/android_env.sh"

ANDROID_GEN_DIR="src-tauri/gen/android"
FORCE_INIT=0
SKIP_TARGETS_INSTALL=0
CI_MODE=1

usage() {
  cat <<'EOF'
Usage: scripts/init_android.sh [options]

Initializes Tauri Android project files under src-tauri/gen/android.

Options:
  --force                 Re-run init even if src-tauri/gen/android exists
  --skip-targets-install  Do not install missing Rust Android targets
  --no-ci                 Allow interactive prompts
  -h, --help              Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE_INIT=1
      shift
      ;;
    --skip-targets-install)
      SKIP_TARGETS_INSTALL=1
      shift
      ;;
    --no-ci)
      CI_MODE=0
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

if [[ "$FORCE_INIT" -eq 0 && -d "$ANDROID_GEN_DIR" ]]; then
  echo "Android project already initialized at ${ANDROID_GEN_DIR}."
  exit 0
fi

ensure_android_env

NPM_BIN="$(resolve_npm || true)"
if [[ -z "$NPM_BIN" ]]; then
  echo "Unable to find npm in PATH or common install locations." >&2
  echo "Install Node/npm, or run from a shell where npm is available." >&2
  exit 1
fi

cmd=("$NPM_BIN" run tauri -- android init)
if [[ "$CI_MODE" -eq 1 ]]; then
  cmd+=(--ci)
fi
if [[ "$SKIP_TARGETS_INSTALL" -eq 1 ]]; then
  cmd+=(--skip-targets-install)
fi

"${cmd[@]}"
echo "Android project initialized."
