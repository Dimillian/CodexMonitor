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

echo "[ios] Building (simulator)..."
npm run tauri -- ios build -d -t aarch64-sim --ci
