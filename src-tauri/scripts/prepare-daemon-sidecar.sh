#!/usr/bin/env bash
set -euo pipefail

TAURI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARIES_DIR="${TAURI_DIR}/target/sidecars"
DAEMON_NAME="codex-monitor-daemon"

target_triple="${CARGO_BUILD_TARGET:-}"

if [[ -z "${target_triple}" ]]; then
  case "${TAURI_ENV_PLATFORM:-}" in
    macos)
      case "${TAURI_ENV_ARCH:-}" in
        arm64|aarch64) target_triple="aarch64-apple-darwin" ;;
        x86_64) target_triple="x86_64-apple-darwin" ;;
      esac
      ;;
    linux)
      case "${TAURI_ENV_ARCH:-}" in
        arm64|aarch64) target_triple="aarch64-unknown-linux-gnu" ;;
        x86_64) target_triple="x86_64-unknown-linux-gnu" ;;
      esac
      ;;
    windows)
      case "${TAURI_ENV_ARCH:-}" in
        arm64|aarch64) target_triple="aarch64-pc-windows-msvc" ;;
        x86_64) target_triple="x86_64-pc-windows-msvc" ;;
      esac
      ;;
  esac
fi

if [[ -z "${target_triple}" ]]; then
  target_triple="$(rustc -vV | awk '/^host: / { print $2 }')"
fi

if [[ -z "${target_triple}" ]]; then
  echo "Failed to resolve target triple for daemon sidecar packaging"
  exit 1
fi

exe_ext=""
if [[ "${target_triple}" == *windows* ]]; then
  exe_ext=".exe"
fi

cargo_args=(
  build
  --release
  --features
  daemon-binaries
  --bin
  codex-monitor-daemon
  --bin
  codex-monitor-daemonctl
)
if [[ -n "${target_triple}" ]]; then
  cargo_args+=(--target "${target_triple}")
fi
(cd "${TAURI_DIR}" && cargo "${cargo_args[@]}")

src_candidates=(
  "${TAURI_DIR}/target/${target_triple}/release/${DAEMON_NAME}${exe_ext}"
  "${TAURI_DIR}/target/release/${DAEMON_NAME}${exe_ext}"
)

daemon_src=""
for candidate in "${src_candidates[@]}"; do
  if [[ -f "${candidate}" ]]; then
    daemon_src="${candidate}"
    break
  fi
done

if [[ -z "${daemon_src}" ]]; then
  printf 'Daemon binary not found. Looked for:\n'
  printf '  %s\n' "${src_candidates[@]}"
  exit 1
fi

mkdir -p "${BINARIES_DIR}"
daemon_sidecar="${BINARIES_DIR}/${DAEMON_NAME}-${target_triple}${exe_ext}"
cp -f "${daemon_src}" "${daemon_sidecar}"
chmod +x "${daemon_sidecar}" || true

# Canonical sidecar path used by desktop bundle file mappings.
daemon_canonical="${BINARIES_DIR}/${DAEMON_NAME}${exe_ext}"
cp -f "${daemon_src}" "${daemon_canonical}"
chmod +x "${daemon_canonical}" || true

# Keep daemonctl available in the same canonical sidecar directory for macOS bundle mapping.
daemonctl_name="codex-monitor-daemonctl"
daemonctl_candidates=(
  "${TAURI_DIR}/target/${target_triple}/release/${daemonctl_name}${exe_ext}"
  "${TAURI_DIR}/target/release/${daemonctl_name}${exe_ext}"
)
daemonctl_src=""
for candidate in "${daemonctl_candidates[@]}"; do
  if [[ -f "${candidate}" ]]; then
    daemonctl_src="${candidate}"
    cp -f "${candidate}" "${BINARIES_DIR}/${daemonctl_name}${exe_ext}"
    chmod +x "${BINARIES_DIR}/${daemonctl_name}${exe_ext}" || true
    break
  fi
done

# Compatibility bridge for current tauri-bundler source lookup.
# Keep these copies only in the resolved target release dir.
release_dir="$(dirname "${daemon_src}")"
cp -f "${daemon_src}" "${release_dir}/codex_monitor_daemon${exe_ext}"
if [[ -n "${daemonctl_src}" ]]; then
  cp -f "${daemonctl_src}" "${release_dir}/codex_monitor_daemonctl${exe_ext}"
fi

# If an old bundle directory exists, purge legacy executable names before rebundling.
bundle_macos_dir="${TAURI_DIR}/target/release/bundle/macos/Codex Monitor.app/Contents/MacOS"
if [[ -d "${bundle_macos_dir}" ]]; then
  rm -f \
    "${bundle_macos_dir}/codex_monitor_daemon" \
    "${bundle_macos_dir}/codex_monitor_daemonctl"
fi

echo "Prepared daemon sidecar: ${daemon_sidecar}"
