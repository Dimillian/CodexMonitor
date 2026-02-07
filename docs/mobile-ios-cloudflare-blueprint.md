# CodexMonitor iOS + Cloudflare Bridge Blueprint

This document is the canonical implementation plan for shipping CodexMonitor on iOS using a Cloudflare bridge to a macOS runner.

## Scope

- Build and ship a real iOS app (Tauri mobile target).
- Keep macOS as the execution host (Codex binary, repos, git, terminals, files).
- Use Cloudflare as secure relay/realtime bridge between iOS and macOS.
- Make macOS setup manageable from CodexMonitor Settings: configure bridge, store credentials, launch/stop service, inspect status/logs.
- Keep one backend logic path (shared core + daemon). Do not duplicate backend behavior in iOS UI.

## Current State (Important)

- Tauri app is desktop-first with `#[cfg_attr(mobile, tauri::mobile_entry_point)]` already present in `src-tauri/src/lib.rs`.
- `src-tauri/src/remote_backend.rs` currently uses raw TCP `host:port` and optional token auth.
- Remote notification forwarding currently handles only:
  - `app-server-event`
  - `terminal-output`
  - `terminal-exit`
- Daemon RPC surface does not match full local Tauri command surface yet (major parity gap).

## Target Architecture

## Components

1. iOS App (Tauri)
- UI + local state + IPC wrappers.
- Uses remote mode only (no local codex execution).
- Connects to Cloudflare WebSocket bridge.

2. macOS App + Daemon Runner
- Runs all backend operations (shared cores, codex process, files/git/terminal).
- Maintains outbound connection to Cloudflare bridge.
- Receives command envelopes from bridge and returns results/events.

3. Cloudflare Bridge
- Worker entrypoint for auth/session routing.
- Durable Object per session for fanout and coordination.
- Durable Object SQLite storage for cursor/queue/snapshot persistence.
- Optional REST endpoints for pairing bootstrap.

## Data Flow

1. macOS runner authenticates to Cloudflare and opens persistent WS.
2. iOS app pairs and opens WS to same session.
3. iOS sends `invoke` envelopes to bridge.
4. Bridge forwards to runner.
5. Runner executes daemon RPC.
6. Runner streams `result` + `event` envelopes back.
7. iOS applies ordered events and acks sequence.
8. On reconnect, iOS requests replay from last acked sequence.

## Transport Protocol (Bridge Envelope)

All frames JSON:

```json
{
  "v": 1,
  "sessionId": "string",
  "seq": 123,
  "kind": "auth|invoke|result|event|ack|ping|pong|error",
  "requestId": "uuid-optional",
  "method": "optional",
  "params": {},
  "result": {},
  "error": { "code": "string", "message": "string" },
  "ts": 1730000000000
}
```

Rules:
- `requestId` required for `invoke/result/error`.
- `seq` monotonic per session for replay.
- `ack` carries highest contiguous applied `seq`.
- Bridge stores unacked frames in DO storage.

## Cloudflare Implementation Plan

## Product Choices

- Workers + Durable Objects (WebSocket hibernation API).
- Durable Object SQLite-backed storage.
- Cloudflare Access service token authentication.

## Worker/DO Topology

- Worker routes:
  - `GET /ws/:sessionId` (WS upgrade)
  - `POST /pair/start` (desktop bootstrap)
  - `POST /pair/claim` (mobile claim via code)
  - `GET /session/:id/status`
- Durable Object key = `sessionId`.
- One runner connection max per session.
- Multiple viewer/client connections allowed (future web clients).

## Durable Object Storage Schema

- `session_meta` (owner, createdAt, ttl, runnerOnline).
- `messages` (seq, kind, requestId, payload, createdAt).
- `acks` (clientId -> seq).
- `pair_codes` (shortCode, expiresAt, claimedBy).

## Auth Model

- Runner and client both must present credentials.
- Recommend Access service token headers at Worker ingress.
- Inside envelope, include signed session claim (short-lived JWT or HMAC token minted by Worker during pairing).
- Rotate bridge secrets without app rebuild (settings update + reconnect).

## Wrangler Bootstrap

Example `wrangler.toml` skeleton:

```toml
name = "codexmonitor-bridge"
main = "src/index.ts"
compatibility_date = "2026-02-07"

[durable_objects]
bindings = [
  { name = "SESSIONS", class_name = "SessionBridge" }
]

[[migrations]]
tag = "v1"
new_sqlite_classes = ["SessionBridge"]
```

Initial ops checklist:

1. `npm create cloudflare@latest codexmonitor-bridge`.
2. Add Durable Object class and WS handlers.
3. Add pairing endpoints.
4. Add auth middleware (Access token verification policy).
5. `npx wrangler deploy`.
6. Save Worker URL for app settings.

## Required Backend Refactor in CodexMonitor

## 1) Refactor `remote_backend` to pluggable transport

Target: keep existing `call_remote(...)` callsites while replacing transport internals.

Proposed structure:

- `src-tauri/src/remote_backend/mod.rs`
- `src-tauri/src/remote_backend/protocol.rs`
- `src-tauri/src/remote_backend/transport.rs` (trait)
- `src-tauri/src/remote_backend/tcp_transport.rs` (legacy/dev)
- `src-tauri/src/remote_backend/cloudflare_ws_transport.rs` (new)

`RemoteTransport` trait:

- `connect(config) -> Client`
- `send(request) -> pending result`
- `subscribe_events() -> stream`
- `close()`
- `status()`

## 2) Add cloud bridge configuration to settings model

Extend `AppSettings` in `src-tauri/src/types.rs` and UI types in `src/types.ts`.

Add section:

- `remoteBridgeProvider`: `"tcp" | "cloudflare"`
- `cloudflareWorkerUrl`
- `cloudflareSessionId`
- `cloudflareRunnerName`
- `cloudflareAutoStartRunner` (bool)
- `cloudflareUseAccess` (bool)
- `cloudflareAccessClientId` (non-secret allowed)
- `cloudflareAccessClientSecretRef` (secret reference only)

Keep secrets out of plain `settings.json` where possible.

## 3) Secret storage

Implement secure secret storage adapter:

- macOS: Keychain via Rust crate (`keyring`) or dedicated secure-storage layer.
- iOS: Keychain-backed storage for mobile credentials.

Store only secret reference/alias in app settings JSON.

## 4) Runner service manager (macOS)

Add backend service manager module:

- `src-tauri/src/bridge_runner/mod.rs`

Responsibilities:
- Start runner process/task.
- Stop runner.
- Report health (`connecting|online|offline|error`).
- Persist last logs ring buffer.
- Auto-start on app launch if enabled.

Potential implementations:
- Embedded task in app process (faster iteration).
- Optional LaunchAgent installation for background persistence across app restarts.

## 5) Daemon bridge mode

Extend daemon binary (`src-tauri/src/bin/codex_monitor_daemon.rs`) with optional bridge connector mode:

- `--bridge-url`
- `--bridge-session`
- `--bridge-auth-*`

Behavior:
- Outbound WS to Worker.
- Translate bridge envelopes <-> existing RPC handler + event bus.

## 6) Command parity completion (blocking)

Remote mode must support the full local command surface used by UI.

Implement missing daemon methods and/or remote routing for at least:

- Git commands:
  - `list_git_roots`, `get_git_status`, `get_git_diffs`, `get_git_log`, `get_git_commit_diff`, `get_git_remote`
  - `list_git_branches`, `checkout_git_branch`, `create_git_branch`
  - `stage_git_file`, `stage_git_all`, `unstage_git_file`
  - `revert_git_file`, `revert_git_all`
  - `commit_git`, `push_git`, `pull_git`, `fetch_git`, `sync_git`
  - GitHub API commands for issues/PRs/comments/diff
- Terminal commands:
  - `terminal_open`, `terminal_write`, `terminal_resize`, `terminal_close`
- Prompts commands:
  - `prompts_list`, `prompts_create`, `prompts_update`, `prompts_delete`, `prompts_move`, `prompts_workspace_dir`, `prompts_global_dir`
- Dictation commands:
  - `dictation_model_status`, `dictation_download_model`, `dictation_cancel_download`, `dictation_remove_model`, `dictation_start`, `dictation_request_permission`, `dictation_stop`, `dictation_cancel`
- Workspace/app extras:
  - `add_clone`, `apply_worktree_changes`, `open_workspace_in`, `get_open_app_icon`
- Utility commands:
  - `codex_doctor`, `get_commit_message_prompt`, `generate_commit_message`, `generate_run_metadata`, `local_usage_snapshot`, `send_notification_fallback`, `is_macos_debug_build`, `menu_set_accelerators`

Add CI guard:
- Script that parses `generate_handler![]` and daemon RPC dispatch and fails on mismatch.

## Frontend Plan

## Settings UX (required for easy setup)

Update `src/features/settings/components/SettingsView.tsx` to add a Cloudflare section when `backendMode=remote` and provider is cloudflare.

Required controls:

- Provider selector (`TCP daemon` / `Cloudflare bridge`)
- Worker URL input
- Session ID input
- Runner name input
- Access auth toggle + client id input + secret set/reset
- `Connect test` button
- `Start Runner` / `Stop Runner` buttons
- `Install LaunchAgent` / `Remove LaunchAgent` (optional)
- Status badge + last heartbeat + error message
- `Copy Pair Code` / `Show QR` (if pairing flow enabled)
- `View Logs` drawer

UX behavior:
- Disable invalid combos.
- Show clear actionable errors (auth failed, session not found, runner offline).
- Persist non-secret fields immediately.
- Save secrets via secure backend command only.

## iOS client UX

- Connection screen:
  - Worker URL
  - Pair code / QR scanner (if enabled)
  - Recent sessions
- Runtime status:
  - `Connected to <runnerName>`
  - Latency indicator
  - Reconnecting state
- Conflict handling:
  - Runner offline banner
  - Replay-in-progress state after reconnect

## Mobile-safe UI readiness

Current responsive layouts exist (`phone`, `tablet`, `desktop`), but ensure:

- touch target sizes are >= 44pt
- no hover-only actions for critical controls
- keyboard-safe composer on iOS (safe area + bottom inset)
- panel resizing gestures disabled on touch layouts

## iOS Build + Install Runbook

## Prerequisites (macOS)

1. Xcode (full app, not only CLT).
2. Rust iOS targets:

```bash
rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
```

3. CocoaPods:

```bash
brew install cocoapods
```

4. JS dependencies from repo root:

```bash
npm install
```

## Initialize iOS project files

From repo root:

```bash
npm run tauri ios init
```

Expected output:
- `src-tauri/gen/apple/*` generated.
- Xcode project/workspace for iOS target available.

## Run on iOS Simulator (dev)

```bash
npm run tauri ios dev
```

Notes:
- Uses `build.devUrl` and `beforeDevCommand`.
- Rust + frontend hot-reload loop in dev.

## Run on Physical Device (dev)

1. Open generated Xcode workspace.
2. Set Apple Team + signing profile for iOS target.
3. Ensure frontend dev server reachable from device network.
4. Run:

```bash
npm run tauri ios dev -- <device-name-or-udid>
```

If network issues appear, ensure dev server listens on host interface and uses `TAURI_DEV_HOST` when set.

## Build production iOS app

```bash
npm run tauri ios build
```

Output:
- Release build artifacts/IPA via Tauri iOS build flow.

## Install build

Development install options:

1. Xcode run to connected device.
2. Xcode Organizer distribute to internal testers.
3. TestFlight (recommended for team validation).

For direct IPA sideload in controlled environments, use Apple Configurator or MDM as appropriate.

## Tauri and Cargo Changes Required for iOS Compatibility

## Cargo dependency gating

In `src-tauri/Cargo.toml`, gate non-mobile dependencies behind desktop cfg where needed (for example terminal/generic git native deps if unsupported on iOS runtime path).

## Tauri config split

Create and maintain iOS-specific config (`src-tauri/tauri.ios.conf.json`) for:

- iOS bundle identifiers
- iOS icons/assets
- iOS permissions usage strings
- iOS-specific plugin toggles

Keep desktop-only settings out of iOS config (titlebar/private APIs/updater artifacts).

## Backend module gating

Use `cfg` for mobile-safe stubs where functionality is desktop-only, while preserving command signatures used by frontend.

## Testing and Validation Matrix

## Unit/Type/Lint

From repo root:

```bash
npm run lint
npm run typecheck
npm run test
```

If Rust touched:

```bash
cd src-tauri
cargo check
cargo test
```

## Bridge integration tests

- Simulate iOS disconnect/reconnect.
- Verify replay from `ack` cursor.
- Verify idempotent handling of duplicate `requestId`.
- Verify unauthorized client rejection.
- Verify runner failover from offline -> online.

## Manual scenario checklist

1. Pair iOS with macOS runner.
2. List workspaces.
3. Connect workspace.
4. Start thread, send messages, interrupt turn.
5. Git diff panel operations.
6. Terminal open/write/resize/close.
7. Prompts CRUD.
8. Background iOS app, resume, ensure state resync.
9. macOS runner restart, iOS auto-reconnect.

## Implementation Milestones

1. Milestone A: iOS compile baseline + mobile-safe stubs.
2. Milestone B: Cloudflare Worker + DO bridge deployed + tested with mock clients.
3. Milestone C: remote_backend transport refactor + runner bridge mode.
4. Milestone D: daemon parity closure + CI parity guard.
5. Milestone E: settings UX/service manager + pairing UX.
6. Milestone F: full E2E validation and TestFlight beta.

## Definition of Done

- iOS app can fully control a macOS runner via Cloudflare bridge.
- Remote feature parity with desktop local mode for supported workflows.
- macOS users can configure bridge from Settings without terminal steps.
- Runner can be started/stopped/auto-started from app.
- Reconnect/replay is robust and observable.
- Build/install flow is documented and reproducible.

## Fresh-Agent Execution Checklist

1. Read this document completely.
2. Implement Milestone A first and ensure local iOS dev build works.
3. Implement Cloudflare bridge in isolation (mock runner/client).
4. Refactor `remote_backend` to transport abstraction.
5. Complete daemon parity and add parity CI guard.
6. Build settings UX and runner service controls.
7. Validate full manual checklist on simulator and physical device.
8. Ship behind feature flag, then remove flag after beta validation.
