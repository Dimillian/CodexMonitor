# Remote Backend POC (daemon)

This fork includes a **proof-of-concept** daemon that runs CodexMonitor's backend logic in a separate process (intended for WSL2/Linux), exposing a simple **line-delimited JSON-RPC** protocol over TCP.

This is **not** wired into the desktop app yet (no UI toggle / remote proxy), but it is useful to validate the architecture and iterate on the protocol.

## Run

From the repo root:

```bash
cd src-tauri

# pick a strong token (or export CODEX_MONITOR_DAEMON_TOKEN)
TOKEN="change-me"

cargo run --bin codex_monitor_daemon -- \
  --listen 127.0.0.1:4732 \
  --data-dir "$HOME/.local/share/codex-monitor-daemon" \
  --token "$TOKEN"
```

Notes:
- In WSL2, Windows access usually requires binding to `0.0.0.0` (depending on your port forwarding setup).
- `--insecure-no-auth` exists for local dev only.

## Protocol

- One JSON object per line.
- Requests: `{"id": <number>, "method": "<string>", "params": <object|null>}`
- Responses: `{"id": <number>, "result": <any>}` or `{"id": <number>, "error": {"message": "<string>"}}`
- Events (server → client notifications): `{"method":"app-server-event","params":{...}}`

### Auth handshake (required unless `--insecure-no-auth`)

First request must be:

```json
{"id": 1, "method": "auth", "params": {"token": "..." }}
```

## Quick test with netcat

```bash
printf '{\"id\":1,\"method\":\"auth\",\"params\":{\"token\":\"change-me\"}}\\n' | nc -w 1 127.0.0.1 4732
printf '{\"id\":2,\"method\":\"ping\"}\\n' | nc -w 1 127.0.0.1 4732
printf '{\"id\":3,\"method\":\"list_workspaces\",\"params\":{}}\\n' | nc -w 1 127.0.0.1 4732
```

## Implemented methods (initial)

- `ping`
- `list_workspaces`
- `add_workspace` (`{ path, codex_bin? }`)
- `add_worktree` (`{ parentId, branch }`)
- `connect_workspace` (`{ id }`)
- `remove_workspace` (`{ id }`)
- `remove_worktree` (`{ id }`)
- `update_workspace_settings` (`{ id, settings }`)
- `update_workspace_codex_bin` (`{ id, codex_bin? }`)
- `list_workspace_files` (`{ workspaceId }`)
- `get_app_settings`
- `update_app_settings` (`{ settings }`)
- `start_thread` (`{ workspaceId }`)
- `resume_thread` (`{ workspaceId, threadId }`)
- `list_threads` (`{ workspaceId, cursor?, limit? }`)
- `archive_thread` (`{ workspaceId, threadId }`)
- `send_user_message` (`{ workspaceId, threadId, text, model?, effort?, accessMode?, images? }`)
- `turn_interrupt` (`{ workspaceId, threadId, turnId }`)
- `start_review` (`{ workspaceId, threadId, target, delivery? }`)
- `model_list` (`{ workspaceId }`)
- `account_rate_limits` (`{ workspaceId }`)
- `skills_list` (`{ workspaceId }`)
- `respond_to_server_request` (`{ workspaceId, requestId, result }`)
