#!/usr/bin/env sh
set -u

STRICT=0
if [ "${1:-}" = "--strict" ]; then
  STRICT=1
fi

missing=""
if ! command -v cmake >/dev/null 2>&1; then
  missing="cmake"
fi

if [ -z "$missing" ]; then
  echo "Doctor: OK"
  exit 0
fi

echo "Doctor: missing dependencies: $missing"

case "$(uname -s)" in
  Darwin)
    echo "Install: brew install cmake"
    ;;
  Linux)
    echo "Ubuntu/Debian: sudo apt-get install cmake"
    echo "Fedora: sudo dnf install cmake"
    echo "Arch: sudo pacman -S cmake"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "Install: choco install cmake"
    echo "Or download from: https://cmake.org/download/"
    ;;
  *)
    echo "Install CMake from: https://cmake.org/download/"
    ;;
esac

if [ "$STRICT" -eq 1 ]; then
  exit 1
fi

exit 0
