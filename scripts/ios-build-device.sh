#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Ensure we don't accidentally pick up an older MacPorts cargo (e.g. /opt/local/bin/cargo).
NODE_BIN="$(command -v node)"
NODE_DIR="$(cd "$(dirname "${NODE_BIN}")" && pwd)"

export PATH="${ROOT_DIR}/node_modules/.bin:${HOME}/.cargo/bin:${NODE_DIR}:/usr/bin:/bin:/usr/sbin:/sbin"

cd "${ROOT_DIR}"

echo "[ios] Using cargo: $(command -v cargo)"
cargo -V

rm -rf "${ROOT_DIR}/src-tauri/gen/apple/build"

echo "[ios] Building (device)..."
npm run tauri -- ios build -d -t aarch64 --ci

IPA_PATH="${ROOT_DIR}/src-tauri/gen/apple/build/arm64/CodexMonitor.ipa"
if [[ -f "${IPA_PATH}" ]]; then
  echo "[ios] Extracting .app from ${IPA_PATH}..."
  TMP_DIR="${ROOT_DIR}/src-tauri/gen/apple/build/arm64/_ipa_extract"
  rm -rf "${TMP_DIR}"
  mkdir -p "${TMP_DIR}"
  unzip -q "${IPA_PATH}" -d "${TMP_DIR}"
  APP_IN_PAYLOAD="${TMP_DIR}/Payload/CodexMonitor.app"
  OUT_APP="${ROOT_DIR}/src-tauri/gen/apple/build/arm64/CodexMonitor.app"
  rm -rf "${OUT_APP}"
  if [[ -d "${APP_IN_PAYLOAD}" ]]; then
    cp -R "${APP_IN_PAYLOAD}" "${OUT_APP}"
    echo "[ios] Extracted app bundle to: ${OUT_APP}"
  else
    echo "[ios] Warning: could not find Payload/CodexMonitor.app inside ipa." >&2
  fi
fi
