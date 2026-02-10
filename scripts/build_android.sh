#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/android_env.sh"

declare -a TARGETS=()
DEBUG_MODE=0
SPLIT_PER_ABI=0
APK_ONLY=0
AAB_ONLY=0
OPEN_ANDROID_STUDIO=0
CI_MODE=1
SKIP_INIT=0

usage() {
  cat <<'EOF'
Usage: scripts/build_android.sh [options]

Builds Android artifacts (APK/AAB) using Tauri.

Options:
  --target <abi>      Add target ABI (aarch64, armv7, i686, x86_64), repeatable
  --debug             Build debug artifacts
  --split-per-abi     Build split APK/AAB per ABI
  --apk-only          Build APKs only
  --aab-only          Build AABs only
  --open              Open Android Studio
  --no-ci             Allow interactive prompts
  --skip-init         Skip Android project initialization check
  -h, --help          Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGETS+=("${2:-}")
      shift 2
      ;;
    --debug)
      DEBUG_MODE=1
      shift
      ;;
    --split-per-abi)
      SPLIT_PER_ABI=1
      shift
      ;;
    --apk-only)
      APK_ONLY=1
      shift
      ;;
    --aab-only)
      AAB_ONLY=1
      shift
      ;;
    --open)
      OPEN_ANDROID_STUDIO=1
      shift
      ;;
    --no-ci)
      CI_MODE=0
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

if [[ "$APK_ONLY" -eq 1 && "$AAB_ONLY" -eq 1 ]]; then
  echo "--apk-only and --aab-only cannot be used together." >&2
  exit 1
fi

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

if [[ "$SKIP_INIT" -eq 0 ]]; then
  init_cmd=("$ROOT_DIR/scripts/init_android.sh")
  if [[ "$CI_MODE" -eq 0 ]]; then
    init_cmd+=(--no-ci)
  fi
  "${init_cmd[@]}"
fi

ensure_android_env

NPM_BIN="$(resolve_npm || true)"
if [[ -z "$NPM_BIN" ]]; then
  echo "Unable to find npm in PATH or common install locations." >&2
  echo "Install Node/npm, or run from a shell where npm is available." >&2
  exit 1
fi

cmd=("$NPM_BIN" run tauri -- android build)
if [[ "$DEBUG_MODE" -eq 1 ]]; then
  cmd+=(--debug)
fi
if [[ "${#TARGETS[@]}" -gt 0 ]]; then
  cmd+=(--target "${TARGETS[@]}")
fi
if [[ "$SPLIT_PER_ABI" -eq 1 ]]; then
  cmd+=(--split-per-abi)
fi
if [[ "$APK_ONLY" -eq 1 ]]; then
  cmd+=(--apk true --aab false)
fi
if [[ "$AAB_ONLY" -eq 1 ]]; then
  cmd+=(--apk false --aab true)
fi
if [[ "$OPEN_ANDROID_STUDIO" -eq 1 ]]; then
  cmd+=(--open)
fi
if [[ "$CI_MODE" -eq 1 ]]; then
  cmd+=(--ci)
fi

"${cmd[@]}"

if [[ -d "src-tauri/gen/android/app/build/outputs" ]]; then
  echo
  echo "Android artifacts:"
  find src-tauri/gen/android/app/build/outputs -type f \
    \( -name '*.apk' -o -name '*.aab' \) | sort
fi
