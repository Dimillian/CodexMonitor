#!/usr/bin/env bash
set -euo pipefail

TAURI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for release_dir in "${TAURI_DIR}/target/release"; do
  if [[ -d "${release_dir}" ]]; then
    rm -f \
      "${release_dir}/codex_monitor_daemon" \
      "${release_dir}/codex_monitor_daemon.exe" \
      "${release_dir}/codex_monitor_daemonctl" \
      "${release_dir}/codex_monitor_daemonctl.exe" \
      "${release_dir}/codex_monitor_daemon.d" \
      "${release_dir}/codex_monitor_daemonctl.d"
  fi
done

bundle_macos_dir="${TAURI_DIR}/target/release/bundle/macos/Codex Monitor.app/Contents/MacOS"
if [[ -d "${bundle_macos_dir}" ]]; then
  rm -f \
    "${bundle_macos_dir}/codex_monitor_daemon" \
    "${bundle_macos_dir}/codex_monitor_daemonctl"
fi
