#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${ROOT_DIR}/.codexmonitor-logs"
PID_FILE="${LOG_DIR}/macos-runner.pid"
LOG_FILE="${LOG_DIR}/macos-runner.log"

mkdir -p "${LOG_DIR}"

if [[ -f "${PID_FILE}" ]]; then
  PID="$(cat "${PID_FILE}" || true)"
  if [[ -n "${PID}" ]] && kill -0 "${PID}" 2>/dev/null; then
    echo "[runner] Already running (pid=${PID}). Logs: ${LOG_FILE}"
    exit 0
  fi
fi

export PATH="$HOME/.cargo/bin:$PATH"

echo "[runner] Starting macOS runner in background..."
echo "[runner] Logs: ${LOG_FILE}"

nohup bash -c "export PATH=\"$HOME/.cargo/bin:\$PATH\"; cd \"${ROOT_DIR}\" && npm run tauri dev" >"${LOG_FILE}" 2>&1 &
echo $! > "${PID_FILE}"

echo "[runner] Started (pid=$(cat "${PID_FILE}"))."
