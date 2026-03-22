#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────
# CodexMonitor Daemon + Cloudflare Quick Tunnel
# Adapted from GARMR's quick-tunnel pattern for CodexMonitor's
# JSON-RPC daemon (port 4732).
# ─────────────────────────────────────────────────────────────────────

DAEMON_PORT="${CODEX_MONITOR_PORT:-4732}"
DAEMON_TOKEN="${CODEX_MONITOR_DAEMON_TOKEN:-}"
DAEMON_DATA_DIR="${CODEX_MONITOR_DATA_DIR:-$HOME/.local/share/codex-monitor-daemon}"
CODEX_MONITOR_DIR="${CODEX_MONITOR_DIR:-$HOME/CodexMonitor}"

STATE_DIR="${HOME}/.codexmonitor/cloudflared"
PID_FILE_TUNNEL="${STATE_DIR}/tunnel.pid"
PID_FILE_DAEMON="${STATE_DIR}/daemon.pid"
LOG_FILE_TUNNEL="${STATE_DIR}/tunnel.log"
LOG_FILE_DAEMON="${STATE_DIR}/daemon.log"
URL_FILE="${STATE_DIR}/tunnel.url"
TOKEN_FILE="${STATE_DIR}/daemon.token"
TIMEOUT_SECONDS=30

usage() {
  cat <<USAGE
Usage: $(basename "$0") <command> [options]

Commands:
  start       Start the CodexMonitor daemon + Cloudflare tunnel
  stop        Stop both daemon and tunnel
  status      Show current status (daemon, tunnel, URL)
  restart     Stop then start
  url         Print just the public tunnel URL
  token       Print or set the daemon auth token

Options:
  --port <port>          Daemon port (default: 4732, or \$CODEX_MONITOR_PORT)
  --token <token>        Auth token (default: \$CODEX_MONITOR_DAEMON_TOKEN or auto-generated)
  --data-dir <path>      Daemon data directory
  --codex-dir <path>     Path to CodexMonitor repo (default: ~/CodexMonitor)
  --no-tunnel            Start daemon only, skip Cloudflare tunnel
  --help                 Show this help

Environment:
  CODEX_MONITOR_PORT             Daemon listen port (default 4732)
  CODEX_MONITOR_DAEMON_TOKEN     Auth token
  CODEX_MONITOR_DATA_DIR         Daemon data dir
  CODEX_MONITOR_DIR              CodexMonitor repo path
USAGE
}

# ── Flags ──────────────────────────────────────────────────────────
command="${1:-help}"
shift 2>/dev/null || true
NO_TUNNEL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)       DAEMON_PORT="${2:-}"; shift 2 ;;
    --token)      DAEMON_TOKEN="${2:-}"; shift 2 ;;
    --data-dir)   DAEMON_DATA_DIR="${2:-}"; shift 2 ;;
    --codex-dir)  CODEX_MONITOR_DIR="${2:-}"; shift 2 ;;
    --no-tunnel)  NO_TUNNEL=1; shift ;;
    --help|-h)    usage; exit 0 ;;
    *)            echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

mkdir -p "$STATE_DIR"
mkdir -p "$DAEMON_DATA_DIR"

# ── Helpers ────────────────────────────────────────────────────────

is_daemon_running() {
  [[ -f "$PID_FILE_DAEMON" ]] && kill -0 "$(cat "$PID_FILE_DAEMON")" >/dev/null 2>&1
}

is_tunnel_running() {
  [[ -f "$PID_FILE_TUNNEL" ]] && kill -0 "$(cat "$PID_FILE_TUNNEL")" >/dev/null 2>&1
}

extract_url() {
  if [[ -f "$LOG_FILE_TUNNEL" ]]; then
    grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$LOG_FILE_TUNNEL" | tail -1 || true
  fi
}

ensure_token() {
  if [[ -z "$DAEMON_TOKEN" ]]; then
    if [[ -f "$TOKEN_FILE" ]]; then
      DAEMON_TOKEN="$(cat "$TOKEN_FILE")"
    else
      DAEMON_TOKEN="$(openssl rand -hex 24)"
      echo "$DAEMON_TOKEN" > "$TOKEN_FILE"
      chmod 600 "$TOKEN_FILE"
      echo "Generated new auth token (saved to $TOKEN_FILE)"
    fi
  else
    echo "$DAEMON_TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
  fi
}

require_cloudflared() {
  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "Error: cloudflared is not installed." >&2
    echo "Install with: brew install cloudflare/cloudflare/cloudflared" >&2
    exit 1
  fi
}

find_daemon_binary() {
  # Check for pre-built release binary first
  local release_bin="${CODEX_MONITOR_DIR}/src-tauri/target/release/codex_monitor_daemon"
  local debug_bin="${CODEX_MONITOR_DIR}/src-tauri/target/debug/codex_monitor_daemon"

  if [[ -x "$release_bin" ]]; then
    echo "$release_bin"
  elif [[ -x "$debug_bin" ]]; then
    echo "$debug_bin"
  else
    echo ""
  fi
}

# ── Start ──────────────────────────────────────────────────────────

do_start() {
  ensure_token

  # 1. Start daemon
  if is_daemon_running; then
    echo "Daemon already running (pid $(cat "$PID_FILE_DAEMON"))"
  else
    local daemon_bin
    daemon_bin="$(find_daemon_binary)"

    if [[ -z "$daemon_bin" ]]; then
      echo "Daemon binary not found. Building..." >&2
      (cd "${CODEX_MONITOR_DIR}/src-tauri" && cargo build --bin codex_monitor_daemon 2>&1 | tail -5)
      daemon_bin="$(find_daemon_binary)"
      if [[ -z "$daemon_bin" ]]; then
        echo "Error: Failed to build daemon binary." >&2
        exit 1
      fi
    fi

    echo "Starting CodexMonitor daemon on 127.0.0.1:${DAEMON_PORT}..."
    nohup "$daemon_bin" \
      --listen "127.0.0.1:${DAEMON_PORT}" \
      --data-dir "$DAEMON_DATA_DIR" \
      --token "$DAEMON_TOKEN" \
      >"$LOG_FILE_DAEMON" 2>&1 &
    echo $! > "$PID_FILE_DAEMON"

    sleep 1
    if ! is_daemon_running; then
      echo "Error: Daemon failed to start. Check log: $LOG_FILE_DAEMON" >&2
      tail -20 "$LOG_FILE_DAEMON" >&2 || true
      rm -f "$PID_FILE_DAEMON"
      exit 1
    fi
    echo "Daemon started (pid $(cat "$PID_FILE_DAEMON"))"
  fi

  # 2. Start tunnel
  if [[ "$NO_TUNNEL" -eq 1 ]]; then
    echo "Skipping Cloudflare tunnel (--no-tunnel)"
    do_print_connection_info
    return
  fi

  require_cloudflared

  if is_tunnel_running; then
    echo "Tunnel already running (pid $(cat "$PID_FILE_TUNNEL"))"
    do_print_connection_info
    return
  fi

  : > "$LOG_FILE_TUNNEL"
  rm -f "$URL_FILE"

  echo "Starting Cloudflare Quick Tunnel -> 127.0.0.1:${DAEMON_PORT}..."
  nohup cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:${DAEMON_PORT}" \
    >"$LOG_FILE_TUNNEL" 2>&1 &
  echo $! > "$PID_FILE_TUNNEL"

  # Wait for URL
  local url=""
  local waited=0
  while [[ $waited -lt $TIMEOUT_SECONDS ]]; do
    if ! kill -0 "$(cat "$PID_FILE_TUNNEL")" >/dev/null 2>&1; then
      echo "Tunnel exited early. Check log: $LOG_FILE_TUNNEL" >&2
      tail -20 "$LOG_FILE_TUNNEL" >&2 || true
      rm -f "$PID_FILE_TUNNEL"
      exit 1
    fi

    url="$(extract_url)"
    if [[ -n "$url" ]]; then
      echo "$url" > "$URL_FILE"
      # Wait for DNS propagation
      local hostname="${url#https://}"
      local dns_wait=0
      while [[ $dns_wait -lt 15 ]]; do
        if host "$hostname" >/dev/null 2>&1; then
          break
        fi
        sleep 1
        dns_wait=$((dns_wait + 1))
      done
      break
    fi

    sleep 1
    waited=$((waited + 1))
  done

  if [[ -z "$url" ]]; then
    echo "Tunnel started but URL not discovered yet."
    echo "Run: $(basename "$0") status"
  fi

  do_print_connection_info
}

# ── Stop ───────────────────────────────────────────────────────────

do_stop() {
  local stopped=0

  if is_tunnel_running; then
    local pid="$(cat "$PID_FILE_TUNNEL")"
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    rm -f "$PID_FILE_TUNNEL"
    echo "Tunnel stopped."
    stopped=1
  fi

  if is_daemon_running; then
    local pid="$(cat "$PID_FILE_DAEMON")"
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    rm -f "$PID_FILE_DAEMON"
    echo "Daemon stopped."
    stopped=1
  fi

  if [[ "$stopped" -eq 0 ]]; then
    echo "Nothing running."
  fi
}

# ── Status ─────────────────────────────────────────────────────────

do_status() {
  echo "═══ CodexMonitor Remote Access ═══"
  echo ""

  if is_daemon_running; then
    echo "  Daemon:  RUNNING (pid $(cat "$PID_FILE_DAEMON"), port $DAEMON_PORT)"
  else
    echo "  Daemon:  STOPPED"
  fi

  if is_tunnel_running; then
    echo "  Tunnel:  RUNNING (pid $(cat "$PID_FILE_TUNNEL"))"
  else
    echo "  Tunnel:  STOPPED"
  fi

  local url=""
  [[ -f "$URL_FILE" ]] && url="$(cat "$URL_FILE" 2>/dev/null || true)"
  [[ -z "$url" ]] && url="$(extract_url)"

  if [[ -n "$url" ]]; then
    if is_tunnel_running; then
      echo "  URL:     $url"
    else
      echo "  URL:     $url (inactive)"
    fi
  else
    echo "  URL:     not available"
  fi

  if [[ -f "$TOKEN_FILE" ]]; then
    echo "  Token:   $(cat "$TOKEN_FILE" | head -c 8)..."
  fi

  echo ""
  echo "  Logs:    $LOG_FILE_DAEMON"
  echo "           $LOG_FILE_TUNNEL"
}

# ── Connection info ────────────────────────────────────────────────

do_print_connection_info() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local url=""
  [[ -f "$URL_FILE" ]] && url="$(cat "$URL_FILE" 2>/dev/null || true)"

  if [[ -n "$url" ]]; then
    echo "  Public URL:  $url"
  fi
  echo "  Local:       127.0.0.1:${DAEMON_PORT}"
  echo "  Token:       $(cat "$TOKEN_FILE")"
  echo ""
  echo "  iOS Setup:"
  echo "    1. Open CodexMonitor on iPhone"
  echo "    2. Settings > Server"
  if [[ -n "$url" ]]; then
    echo "    3. Host: ${url#https://}:443"
  else
    echo "    3. Host: <your-mac-ip>:${DAEMON_PORT}"
  fi
  echo "    4. Token: paste the token above"
  echo "    5. Tap Connect & Test"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

do_url() {
  local url=""
  [[ -f "$URL_FILE" ]] && url="$(cat "$URL_FILE" 2>/dev/null || true)"
  [[ -z "$url" ]] && url="$(extract_url)"
  if [[ -n "$url" ]]; then
    echo "$url"
  else
    echo "No tunnel URL available." >&2
    exit 1
  fi
}

do_token() {
  ensure_token
  echo "$DAEMON_TOKEN"
}

# ── Dispatch ───────────────────────────────────────────────────────

case "$command" in
  start)    do_start ;;
  stop)     do_stop ;;
  restart)  do_stop; sleep 1; do_start ;;
  status)   do_status ;;
  url)      do_url ;;
  token)    do_token ;;
  help|--help|-h) usage ;;
  *)
    echo "Unknown command: $command" >&2
    usage
    exit 1
    ;;
esac
