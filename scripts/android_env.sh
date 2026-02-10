#!/usr/bin/env bash

ensure_android_env() {
  local sdk_home="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  if [[ -z "$sdk_home" ]]; then
    for candidate in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
      if [[ -d "$candidate" ]]; then
        sdk_home="$candidate"
        break
      fi
    done
  fi

  if [[ -z "$sdk_home" ]]; then
    return
  fi

  export ANDROID_HOME="$sdk_home"
  export ANDROID_SDK_ROOT="$sdk_home"

  local platform_tools_dir="$sdk_home/platform-tools"
  if [[ -d "$platform_tools_dir" && ":$PATH:" != *":$platform_tools_dir:"* ]]; then
    export PATH="$platform_tools_dir:$PATH"
  fi

  local cmdline_tools_latest="$sdk_home/cmdline-tools/latest/bin"
  if [[ -d "$cmdline_tools_latest" && ":$PATH:" != *":$cmdline_tools_latest:"* ]]; then
    export PATH="$cmdline_tools_latest:$PATH"
  fi

  if [[ -z "${NDK_HOME:-}" ]]; then
    local ndk_dir="$sdk_home/ndk"
    if [[ -d "$ndk_dir" ]]; then
      local latest_ndk=""
      latest_ndk="$(ls -1 "$ndk_dir" 2>/dev/null | sort | tail -n 1)"
      if [[ -n "$latest_ndk" && -d "$ndk_dir/$latest_ndk" ]]; then
        export NDK_HOME="$ndk_dir/$latest_ndk"
      fi
    fi
  fi
}
