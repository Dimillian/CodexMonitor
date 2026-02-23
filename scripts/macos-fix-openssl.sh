#!/usr/bin/env bash
set -euo pipefail

app_path="${1:-src-tauri/target/release/bundle/macos/Codex Monitor.app}"
identity="${CODESIGN_IDENTITY:-}"
entitlements_path="${ENTITLEMENTS_PATH:-src-tauri/Entitlements.plist}"

if [[ -z "${identity}" ]]; then
  echo "CODESIGN_IDENTITY is required. Example:"
  echo "  CODESIGN_IDENTITY='Developer ID Application: Your Name (TEAMID)' $0"
  exit 1
fi

if [[ ! -d "${app_path}" ]]; then
  echo "App bundle not found: ${app_path}"
  exit 1
fi

codesign_entitlements=()
if [[ -f "${entitlements_path}" ]]; then
  echo "Using entitlements: ${entitlements_path}"
  codesign_entitlements=(--entitlements "${entitlements_path}")
else
  echo "Warning: entitlements file not found at ${entitlements_path}; signing without entitlements."
fi

openssl_prefix=""
if command -v brew >/dev/null 2>&1; then
  openssl_prefix="$(brew --prefix openssl@3 2>/dev/null || true)"
fi
if [[ -z "${openssl_prefix}" ]]; then
  if [[ -d "/opt/homebrew/opt/openssl@3" ]]; then
    openssl_prefix="/opt/homebrew/opt/openssl@3"
  elif [[ -d "/usr/local/opt/openssl@3" ]]; then
    openssl_prefix="/usr/local/opt/openssl@3"
  fi
fi

if [[ -z "${openssl_prefix}" ]]; then
  echo "OpenSSL@3 not found. Install it with Homebrew first."
  exit 1
fi

libssl="${openssl_prefix}/lib/libssl.3.dylib"
libcrypto="${openssl_prefix}/lib/libcrypto.3.dylib"
frameworks_dir="${app_path}/Contents/Frameworks"
bin_path="${app_path}/Contents/MacOS/codex-monitor"
daemon_path="${app_path}/Contents/MacOS/codex_monitor_daemon"
daemonctl_path="${app_path}/Contents/MacOS/codex_monitor_daemonctl"

if [[ ! -f "${libssl}" || ! -f "${libcrypto}" ]]; then
  echo "OpenSSL dylibs not found at ${openssl_prefix}/lib"
  exit 1
fi

mkdir -p "${frameworks_dir}"
cp -f "${libssl}" "${frameworks_dir}/"
cp -f "${libcrypto}" "${frameworks_dir}/"

install_name_tool -id "@rpath/libssl.3.dylib" "${frameworks_dir}/libssl.3.dylib"
install_name_tool -id "@rpath/libcrypto.3.dylib" "${frameworks_dir}/libcrypto.3.dylib"
for candidate in \
  "${libcrypto}" \
  "/opt/homebrew/opt/openssl@3/lib/libcrypto.3.dylib" \
  "/usr/local/opt/openssl@3/lib/libcrypto.3.dylib" \
  "/opt/homebrew/Cellar/openssl@3/3.6.0/lib/libcrypto.3.dylib" \
  "/usr/local/Cellar/openssl@3/3.6.0/lib/libcrypto.3.dylib"
do
  install_name_tool -change "${candidate}" "@rpath/libcrypto.3.dylib" "${frameworks_dir}/libssl.3.dylib" 2>/dev/null || true
done

for candidate in \
  "${libssl}" \
  "/opt/homebrew/opt/openssl@3/lib/libssl.3.dylib" \
  "/usr/local/opt/openssl@3/lib/libssl.3.dylib"
do
  install_name_tool -change "${candidate}" "@rpath/libssl.3.dylib" "${bin_path}" 2>/dev/null || true
done

for candidate in \
  "${libcrypto}" \
  "/opt/homebrew/opt/openssl@3/lib/libcrypto.3.dylib" \
  "/usr/local/opt/openssl@3/lib/libcrypto.3.dylib"
do
  install_name_tool -change "${candidate}" "@rpath/libcrypto.3.dylib" "${bin_path}" 2>/dev/null || true
done

if ! otool -l "${bin_path}" | { command -v rg >/dev/null 2>&1 && rg -q "@executable_path/../Frameworks" || grep -q "@executable_path/../Frameworks"; }; then
  install_name_tool -add_rpath "@executable_path/../Frameworks" "${bin_path}"
fi

codesign --force --options runtime --timestamp --sign "${identity}" "${frameworks_dir}/libcrypto.3.dylib"
codesign --force --options runtime --timestamp --sign "${identity}" "${frameworks_dir}/libssl.3.dylib"
codesign --force --options runtime --timestamp --sign "${identity}" "${codesign_entitlements[@]}" "${bin_path}"
if [[ -f "${daemon_path}" ]]; then
  codesign --force --options runtime --timestamp --sign "${identity}" "${codesign_entitlements[@]}" "${daemon_path}"
fi
if [[ -f "${daemonctl_path}" ]]; then
  codesign --force --options runtime --timestamp --sign "${identity}" "${codesign_entitlements[@]}" "${daemonctl_path}"
fi
codesign --force --options runtime --timestamp --sign "${identity}" "${codesign_entitlements[@]}" "${app_path}"

echo "Bundled OpenSSL dylibs and re-signed ${app_path}"
