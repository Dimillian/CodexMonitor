#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
src_tauri_dir="${repo_root}/src-tauri"
binaries_dir="${src_tauri_dir}/binaries"

build_target="${TARGET:-${CARGO_BUILD_TARGET:-}}"
if [[ -z "${build_target}" ]]; then
  build_target="$(rustc -vV | awk '/^host: / { print $2 }')"
fi
if [[ -z "${build_target}" ]]; then
  echo "Failed to resolve Rust target triple"
  exit 1
fi

cargo_target_args=()
release_dir="${src_tauri_dir}/target/release"
if [[ -n "${TARGET:-${CARGO_BUILD_TARGET:-}}" ]]; then
  cargo_target_args=(--target "${build_target}")
  release_dir="${src_tauri_dir}/target/${build_target}/release"
fi

bin_ext=""
if [[ "${build_target}" == *windows* ]]; then
  bin_ext=".exe"
fi

mkdir -p "${binaries_dir}"

daemon_sidecar_path="${binaries_dir}/codex_monitor_daemon-${build_target}${bin_ext}"
daemonctl_sidecar_path="${binaries_dir}/codex_monitor_daemonctl-${build_target}${bin_ext}"

# Bootstrap sidecar paths so tauri's build-script path checks can pass.
if [[ ! -f "${daemon_sidecar_path}" ]]; then
  : > "${daemon_sidecar_path}"
fi
if [[ ! -f "${daemonctl_sidecar_path}" ]]; then
  : > "${daemonctl_sidecar_path}"
fi
if [[ -z "${bin_ext}" ]]; then
  chmod +x "${daemon_sidecar_path}" "${daemonctl_sidecar_path}"
fi

(
  cd "${src_tauri_dir}"
  if [[ ${#cargo_target_args[@]} -gt 0 ]]; then
    cargo build --release "${cargo_target_args[@]}" \
      --bin codex_monitor_daemon \
      --bin codex_monitor_daemonctl
  else
    cargo build --release \
      --bin codex_monitor_daemon \
      --bin codex_monitor_daemonctl
  fi
)

cp -f \
  "${release_dir}/codex_monitor_daemon${bin_ext}" \
  "${daemon_sidecar_path}"
cp -f \
  "${release_dir}/codex_monitor_daemonctl${bin_ext}" \
  "${daemonctl_sidecar_path}"

if [[ -z "${bin_ext}" ]]; then
  chmod +x "${daemon_sidecar_path}" "${daemonctl_sidecar_path}"
fi

echo "Prepared sidecars for ${build_target} in ${binaries_dir}"
