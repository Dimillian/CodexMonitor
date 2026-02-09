# CodexMonitor iOS Remote Blueprint (Orbit + Tailscale Bootstrap)

This document is the canonical implementation plan for shipping CodexMonitor on iOS with a Tailscale-first bootstrap path and Orbit on Cloudflare as the production relay/control plane to a macOS runner.

## Scope

- Build and ship a real iOS app (Tauri mobile target).
- Keep macOS as the execution host (Codex binary, repos, git, terminals, files).
- Provide a low-friction self-host bootstrap path via Tailscale + TCP daemon for early end-to-end mobile testing.
- Use Orbit on Cloudflare as secure relay/realtime bridge between iOS and macOS.
- Make macOS setup manageable from CodexMonitor Settings: authenticate, pair device, launch/stop runner, inspect status/logs.
- Keep one backend logic path (shared core + daemon). Do not duplicate backend behavior in iOS UI.

## Non-Goals (This Plan)

- Building a custom Cloudflare Worker/DO protocol for relay.
- Defining a custom bridge envelope (`seq`/`ack`) as a required transport contract.
- Reintroducing CloudKit/PR31-based remote architecture.

## Current State (Important)

- Tauri app is desktop-first with `#[cfg_attr(mobile, tauri::mobile_entry_point)]` already present in `src-tauri/src/lib.rs`.
- `remote_backend` has been refactored into pluggable transport modules:
  - `src-tauri/src/remote_backend/mod.rs`
  - `src-tauri/src/remote_backend/protocol.rs`
  - `src-tauri/src/remote_backend/transport.rs`
  - `src-tauri/src/remote_backend/tcp_transport.rs`
  - `src-tauri/src/remote_backend/orbit_ws_transport.rs`
- Current transport behavior:
  - TCP transport remains intact (existing remote path preserved).
  - Orbit WS transport is implemented for connect/read/write + request/response routing, including line-delimited frame splitting.
  - App transport is currently single-connection (no client-side reconnect loop yet).
  - Daemon Orbit runner mode includes reconnect/backoff for outbound Orbit WS.
- Remote provider settings baseline is implemented:
  - `remoteBackendProvider`: `"tcp" | "orbit"`
  - `remoteBackendHost`, `remoteBackendToken`
  - `orbitWsUrl`, `orbitAuthUrl`
  - `orbitRunnerName`, `orbitAutoStartRunner`
  - `orbitUseAccess`, `orbitAccessClientId`, `orbitAccessClientSecretRef`
- Orbit remote operations are implemented in app and daemon wiring via shared core:
  - `orbit_connect_test`
  - `orbit_sign_in_start`
  - `orbit_sign_in_poll` (stores token to app settings on authorization)
  - `orbit_sign_out` (best-effort logout + token clear)
  - `orbit_runner_start`
  - `orbit_runner_stop`
  - `orbit_runner_status`
- Settings UI now includes Orbit provider setup/actions in `SettingsView`:
  - URLs, runner name, access fields, connect/sign-in/sign-out, runner start/stop/status
  - inline device-code polling flow wired to `orbit_sign_in_poll`
- Remote notification forwarding currently handles only:
  - `app-server-event`
  - `terminal-output`
  - `terminal-exit`
- Mobile UI scope is the existing app layout in mobile form-factor (no separate mobile-only feature surface).
- Shared-core parity refactor is in place for prompts, local usage, codex utility helpers, git/github UI helpers, and workspace actions.
- Tailscale setup helper is implemented for TCP remote mode:
  - Desktop command: `tailscale_status`
  - Desktop command: `tailscale_daemon_command_preview`
  - Settings UI helpers: detect Tailscale, use suggested tailnet host, show daemon launch command template
- Daemon RPC parity for the current mobile scope is complete.
- `terminal_*` and `dictation_*` command parity are intentionally out of scope for this mobile phase.

## Target Architecture

## Components

1. iOS App (Tauri)
- UI + local state + IPC wrappers.
- Uses remote mode only (no local codex execution).
- Connects to Orbit WebSocket endpoint and consumes Codex JSON-RPC stream.

2. macOS App + Daemon Runner
- Runs all backend operations (shared cores, codex process, files/git/terminal).
- Maintains outbound connection to Orbit.
- Receives JSON-RPC from Orbit and returns results/events.

3. Tailscale Tailnet (Bootstrap Path)
- iOS and macOS join the same user-managed tailnet.
- iOS connects directly to daemon TCP endpoint over tailnet (`remoteBackendProvider=tcp`).
- No hosted CodexMonitor service required.

4. Orbit Cloud Services
- Auth service (passkey + JWT/session).
- Orbit relay (Worker + Durable Object routing + event persistence endpoint).
- User-owned self-host deployment path only.

## Canonical Protocol Choice

- Use Orbit JSON-RPC relay model plus Orbit control messages (`orbit.subscribe`, `orbit.unsubscribe`, `orbit.list-anchors`, keepalive ping/pong).
- For Tailscale bootstrap mode, continue using existing TCP JSON-RPC over tailnet (`remoteBackendProvider=tcp`) with token auth.
- Do not introduce a second custom transport protocol for this phase.
- Reconnection/resync should use Orbit thread event history endpoint and thread resume flows.

## Data Flow

1. macOS runner authenticates and opens persistent WS to Orbit.
2. iOS app authenticates and opens WS to Orbit.
3. iOS subscribes to thread channels via `orbit.subscribe`.
4. iOS sends JSON-RPC `invoke` messages (for example `thread/start`, `turn/start`) through Orbit.
5. Orbit relays to runner.
6. Runner executes daemon RPC / app-server operations.
7. Orbit relays results and notifications back to subscribed iOS clients.
8. On reconnect, iOS reloads state from thread resume + stored events endpoint.

## Orbit Deployment Model

## Self-Hosted Orbit Only

- User deploys Orbit/Auth workers and D1 with Wrangler.
- User provides Orbit/Auth endpoints in Settings.
- Pair/auth flows remain the same once endpoints are configured.

## Required Backend Refactor in CodexMonitor

## 1) Refactor `remote_backend` to pluggable transport

Target: keep existing `call_remote(...)` callsites while replacing transport internals.

Implemented structure:

- `src-tauri/src/remote_backend/mod.rs`
- `src-tauri/src/remote_backend/protocol.rs`
- `src-tauri/src/remote_backend/transport.rs` (trait)
- `src-tauri/src/remote_backend/tcp_transport.rs` (legacy/dev)
- `src-tauri/src/remote_backend/orbit_ws_transport.rs` (new)

`RemoteTransport` trait:

- `connect(config) -> Client`
- `send(request) -> pending result`
- `subscribe_events() -> stream`
- `close()`
- `status()`

Current status:

- Done: transport split + provider routing + Orbit WS connect/read/write path.
- Done: WebSocket payload parsing split to protocol lines before JSON-RPC dispatch.
- Pending: app-side reconnect strategy and replay/resync contract integration.

## 2) Add bridge configuration to settings model

Extend `AppSettings` in `src-tauri/src/types.rs` and UI types in `src/types.ts`.

Implemented baseline fields:

- `remoteBackendProvider`: `"tcp" | "orbit"`
- `remoteBackendHost`
- `remoteBackendToken`
- `orbitWsUrl`
- `orbitAuthUrl`
- `orbitRunnerName`
- `orbitAutoStartRunner`
- `orbitUseAccess`
- `orbitAccessClientId`
- `orbitAccessClientSecretRef`

Planned next (not yet implemented in settings model):

- deployment/auth/pairing metadata required for full self-host Orbit UX
- secure-storage integration for secret material lifecycle (set/reset/rotation)

Keep secrets out of plain `settings.json` where possible.

## 3) Secret storage

Implement secure secret storage adapter:

- macOS: Keychain via Rust crate (`keyring`) or dedicated secure-storage layer.
- iOS: Keychain-backed storage for mobile credentials.

Store only secret references/aliases in app settings JSON.

## 4) Runner service manager (macOS)

Add backend service manager module:

- `src-tauri/src/bridge_runner/mod.rs`

Responsibilities:

- Start runner process/task.
- Stop runner.
- Report health (`connecting|online|offline|error`).
- Persist last logs ring buffer.
- Auto-start on app launch if enabled.

Current implementation:

- Basic runner lifecycle controls are implemented via Tauri commands in `src-tauri/src/orbit/mod.rs` and daemon Orbit mode args in `src-tauri/src/bin/codex_monitor_daemon.rs`.
- Full background service management (LaunchAgent install/remove, log viewer, lifecycle recovery after app restart) remains pending.

Potential implementations:

- Embedded task in app process (faster iteration).
- Optional LaunchAgent installation for background persistence across app restarts.

## 5) Daemon Orbit mode

Extend daemon binary (`src-tauri/src/bin/codex_monitor_daemon.rs`) with optional Orbit connector mode.

Representative options:

- `--orbit-url`
- `--orbit-auth-url`
- `--orbit-device-login`
- `--orbit-token-ref`

Behavior:

- Outbound WS to Orbit relay.
- Translate Orbit-relayed JSON-RPC to existing RPC handler + event bus.
- Support runner reconnect and re-subscription behavior.

Current implementation status:

- Orbit mode args are implemented: `--orbit-url`, `--orbit-token`, `--orbit-auth-url`, `--orbit-runner-name`.
- Orbit mode loop is implemented with reconnect/backoff, event forwarding, ping/pong handling, and `anchor.hello` metadata send.
- Further Orbit-specific subscription/replay semantics remain pending until mobile Orbit client wiring is added.

## 6) Command parity scope (mobile phase)

Remote mode must support all commands exercised by the current mobile UI surface.

Implemented in shared core + daemon/app adapters:

- Git + GitHub UI commands:
  - `list_git_roots`, `get_git_status`, `get_git_diffs`, `get_git_log`, `get_git_commit_diff`, `get_git_remote`
  - `list_git_branches`, `checkout_git_branch`, `create_git_branch`
  - `stage_git_file`, `stage_git_all`, `unstage_git_file`
  - `revert_git_file`, `revert_git_all`
  - `commit_git`, `push_git`, `pull_git`, `fetch_git`, `sync_git`
  - GitHub issues/PRs/comments/diff commands
- Prompts commands:
  - `prompts_list`, `prompts_create`, `prompts_update`, `prompts_delete`, `prompts_move`, `prompts_workspace_dir`, `prompts_global_dir`
- Workspace/app extras:
  - `add_clone`, `apply_worktree_changes`, `open_workspace_in`, `get_open_app_icon`
- Utility commands:
  - `codex_doctor`, `generate_commit_message`, `generate_run_metadata`, `local_usage_snapshot`, `send_notification_fallback`, `is_macos_debug_build`, `menu_set_accelerators`

Out of scope for this mobile phase:

- Terminal commands:
  - `terminal_open`, `terminal_write`, `terminal_resize`, `terminal_close`
- Dictation commands:
  - `dictation_model_status`, `dictation_download_model`, `dictation_cancel_download`, `dictation_remove_model`, `dictation_start`, `dictation_request_permission`, `dictation_stop`, `dictation_cancel`

Validation policy:

- No CI parity guard is required for this phase.
- Validate parity locally before merge (build/tests + remote-mode smoke checks).

## Frontend Plan

## Settings UX (required for easy setup)

Update `src/features/settings/components/SettingsView.tsx` to add an Orbit section when `backendMode=remote` and provider is orbit.

Required controls:

- Provider selector (`TCP daemon` / `Orbit`)
- TCP + Tailscale helpers:
  - `Detect Tailscale`
  - `Use suggested host`
  - daemon launch command template
- Orbit WS URL input
- Orbit Auth URL input
- Runner name input
- Access auth toggle + client id input + secret set/reset (optional)
- `Connect test` button
- `Sign In` / `Sign Out` actions
- `Start Runner` / `Stop Runner` buttons
- `Install LaunchAgent` / `Remove LaunchAgent` (optional)
- Status badge + last heartbeat + error message
- `Copy Pair Code` / `Show QR`
- `View Logs` drawer

Current implementation status:

- Implemented now:
  - Provider selector
  - TCP Tailscale helper controls (`Detect Tailscale`, suggested host, daemon command template)
  - Orbit WS/Auth URL inputs
  - Runner name input
  - Access toggle + client id/secret ref fields
  - `Connect test`, `Sign In`, `Sign Out`, `Start Runner`, `Stop Runner`, `Refresh Status`
  - inline status/auth-code/verification URL display
- Pending:
  - LaunchAgent install/remove controls
  - status badge with heartbeat metadata
  - `Copy Pair Code` / `Show QR`
  - logs drawer UI

UX behavior:

- Disable invalid combinations.
- Show clear actionable errors (auth failed, runner offline, endpoint invalid, token expired).
- Persist non-secret fields immediately.
- Save secrets via secure backend command only.

## iOS client UX

- First launch setup:
  - endpoint-aware sign-in (self-host)
  - `Scan QR` / `Enter pair code`
  - Recent sessions
- Runtime status:
  - `Connected to <runnerName>`
  - Latency indicator
  - Reconnecting state
- Conflict handling:
  - Runner offline banner
  - Rehydration state after reconnect

## User Setup Flows

## Tailscale Bootstrap (Implemented)

Desktop setup:

1. Install Tailscale and sign into the same tailnet on desktop and iPhone.
2. In CodexMonitor Settings, set `Backend Mode = Remote`, `Provider = TCP`.
3. Click `Detect Tailscale` and then `Use suggested host`.
4. Set a `Remote backend token`.
5. Copy the generated daemon command template and run it on desktop.
6. Use the same host/token in mobile app remote settings.

Mobile setup:

1. Install and sign into Tailscale on iOS.
2. Open CodexMonitor iOS app.
3. Set remote provider to TCP and enter tailnet host + token from desktop setup.
4. Connect and validate thread list + messaging.

## Self-Hosted Orbit

Desktop setup:

1. Deploy Orbit/Auth services to Cloudflare.
2. Open CodexMonitor Settings.
3. Set `Backend Mode = Remote`, `Provider = Orbit`.
4. Enter `Orbit WS URL` and `Orbit Auth URL`.
5. Configure optional Access credentials.
6. Sign in and start runner.
7. Pair mobile via QR/code.

Mobile setup:

1. Launch iOS app.
2. Sign in against configured self-host auth.
3. Scan QR or enter pair code.
4. Store credentials in Keychain and auto-connect.

User-provided information:

- Orbit WS URL.
- Orbit Auth URL.
- Optional Access client credentials (if enabled).

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

## Orbit integration tests

- Simulate iOS disconnect/reconnect.
- Verify thread rehydration via resume/events endpoint.
- Verify idempotent handling of duplicate RPC responses.
- Verify unauthorized client rejection.
- Verify runner failover from offline -> online.
- Verify thread subscription behavior (`orbit.subscribe`/`orbit.unsubscribe`).

## Manual scenario checklist

1. Pair iOS with macOS runner.
2. List workspaces.
3. Connect workspace.
4. Start thread, send messages, interrupt turn.
5. Git diff panel operations.
6. Prompts CRUD.
7. Verify terminal UI is not exposed in mobile mode.
8. Verify dictation UI is not exposed in mobile mode.
9. Background iOS app, resume, ensure state resync.
10. macOS runner restart, iOS auto-reconnect.

## Implementation Milestones

1. Milestone A: iOS compile baseline + mobile-safe stubs.
2. Milestone B: Orbit integration baseline (self-host config path).
3. Milestone C: `remote_backend` transport refactor + Orbit WS transport + runner Orbit mode.
4. Milestone D: daemon parity closure for mobile scope (excluding terminal/dictation).
5. Milestone E: Settings UX/service manager + pairing UX.
6. Milestone F: full E2E validation and TestFlight beta.

## Definition of Done

- iOS app can fully control a macOS runner via Orbit bridge.
- Remote feature parity with desktop local mode for supported workflows.
- macOS users can configure Orbit from Settings using self-hosted Orbit endpoints.
- Runner can be started/stopped/auto-started from app.
- Reconnect/resync is robust and observable.
- Build/install flow is documented and reproducible.

## Fresh-Agent Execution Checklist

1. Read this document completely.
2. Implement Milestone A first and ensure local iOS dev build works.
3. Integrate Orbit transport/auth in isolation with mock runner/client tests.
4. Refactor `remote_backend` to transport abstraction.
5. Complete daemon parity for mobile scope and validate locally.
6. Build settings UX and runner service controls.
7. Validate full manual checklist on simulator and physical device.
8. Ship behind feature flag, then remove flag after beta validation.
