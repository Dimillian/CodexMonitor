# Codebase Map (Task-Oriented)

Canonical navigation guide for CodexMonitor. Use this as: "if you need X, edit Y".

Related docs:

- Setup/build/release: `README.md`
- iOS remote over Tailscale (TCP): `docs/mobile-ios-tailscale-blueprint.md`

## Start Here: How Changes Flow

For backend behavior, follow this path in order:

1. Frontend callsite: `src/features/**` hooks/components
2. Frontend IPC API: `src/services/tauri.ts`
3. Tauri command registration: `src-tauri/src/lib.rs` (`invoke_handler`)
4. App adapter: `src-tauri/src/{codex,workspaces,git,files,settings,prompts}/*`
5. Shared core source of truth: `src-tauri/src/shared/*`
6. Daemon RPC method parity: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
7. Daemon state/wiring implementation: `src-tauri/src/bin/codex_monitor_daemon.rs`

If a behavior must work in both app and daemon, implement it in `src-tauri/src/shared/*` first.

## If You Need X, Edit Y

| Need | Primary files to edit |
| --- | --- |
| App-level UI composition/layout wiring | `src/App.tsx`, `src/features/app/components/AppLayout.tsx`, `src/features/app/bootstrap/*`, `src/features/app/orchestration/*`, `src/features/app/hooks/*` |
| Add/change Tauri IPC methods used by frontend | `src/services/tauri.ts`, `src-tauri/src/lib.rs`, matching backend adapter module |
| Add/change app-server event handling in UI | `src/services/events.ts`, `src/features/app/hooks/useAppServerEvents.ts`, `src/utils/appServerEvents.ts`, `src/features/threads/utils/threadNormalize.ts` |
| Change thread state transitions | `src/features/threads/hooks/useThreadsReducer.ts`, `src/features/threads/hooks/threadReducer/*`, `src/features/threads/hooks/useThreads.ts`, focused thread hooks under `src/features/threads/hooks/*` |
| Change workspace lifecycle/worktree behavior | `src/features/workspaces/hooks/useWorkspaces.ts`, `src-tauri/src/workspaces/commands.rs`, `src-tauri/src/shared/workspaces_core.rs`, `src-tauri/src/shared/workspaces_core/*`, `src-tauri/src/shared/worktree_core.rs` |
| Change settings model/load/update | `src/features/settings/components/SettingsView.tsx`, `src/features/settings/hooks/useAppSettings.ts`, `src/services/tauri.ts`, `src-tauri/src/settings/mod.rs`, `src-tauri/src/shared/settings_core.rs`, `src-tauri/src/types.rs`, `src/types.ts` |
| Change Git/GitHub backend behavior | `src/features/git/hooks/*`, `src/services/tauri.ts`, `src-tauri/src/git/mod.rs`, `src-tauri/src/shared/git_ui_core.rs`, `src-tauri/src/shared/git_ui_core/*`, `src-tauri/src/shared/git_core.rs`, `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`, `src-tauri/src/bin/codex_monitor_daemon/rpc/git.rs` |
| Change prompts CRUD/listing behavior | `src/features/prompts/hooks/useCustomPrompts.ts`, `src/features/prompts/components/PromptPanel.tsx`, `src/services/tauri.ts`, `src-tauri/src/prompts.rs`, `src-tauri/src/shared/prompts_core.rs`, `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` |
| Change file read/write for Agents/config | `src/services/tauri.ts`, `src-tauri/src/files/mod.rs`, `src-tauri/src/shared/files_core.rs`, `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` |
| Add/change daemon JSON-RPC surface | `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`, `src-tauri/src/bin/codex_monitor_daemon/rpc/*`, `src-tauri/src/bin/codex_monitor_daemon.rs`, matching shared core |

## Frontend Navigation

- Composition root: `src/App.tsx`
- App bootstrap orchestration: `src/features/app/bootstrap/*`
- App layout/thread/workspace orchestration: `src/features/app/orchestration/*`
- Tauri IPC wrapper: `src/services/tauri.ts`
- Tauri event hub (single-listener fanout): `src/services/events.ts`
- Event subscription hook: `src/features/app/hooks/useTauriEvent.ts`
- App-server event router: `src/features/app/hooks/useAppServerEvents.ts`
- Shared frontend types: `src/types.ts`

### Import Aliases

Use TS/Vite aliases for refactor-safe imports:

- `@/*` -> `src/*`
- `@app/*` -> `src/features/app/*`
- `@settings/*` -> `src/features/settings/*`
- `@threads/*` -> `src/features/threads/*`
- `@services/*` -> `src/services/*`
- `@utils/*` -> `src/utils/*`

### Threads

- Orchestrator: `src/features/threads/hooks/useThreads.ts`
- Reducer composition entrypoint: `src/features/threads/hooks/useThreadsReducer.ts`
- Reducer slices: `src/features/threads/hooks/threadReducer/*`
- Event-focused handlers: `src/features/threads/hooks/useThreadEventHandlers.ts`, `src/features/threads/hooks/useThreadTurnEvents.ts`, `src/features/threads/hooks/useThreadItemEvents.ts`, `src/features/threads/hooks/useThreadApprovalEvents.ts`, `src/features/threads/hooks/useThreadUserInputEvents.ts`
- Message send/steer/interrupt: `src/features/threads/hooks/useThreadMessaging.ts`
- Persistence/local thread metadata: `src/features/threads/hooks/useThreadStorage.ts`, `src/features/threads/utils/threadStorage.ts`

### Workspaces

- Workspace state and lifecycle: `src/features/workspaces/hooks/useWorkspaces.ts`
- Workspace home behavior: `src/features/workspaces/hooks/useWorkspaceHome.ts`
- Workspace file list and reads in app layer: `src/features/app/hooks/useWorkspaceFileListing.ts`, `src/features/workspaces/hooks/useWorkspaceFiles.ts`

### Settings

- Main settings surface: `src/features/settings/components/SettingsView.tsx`
- Settings state + persistence flow: `src/features/settings/hooks/useAppSettings.ts`, `src/features/app/hooks/useAppSettingsController.ts`
- Typed settings contracts: `src/types.ts`

### Git

- Git UI hooks: `src/features/git/hooks/*`
- Git panel components: `src/features/git/components/*`
- Branch workflows: `src/features/git/hooks/useGitBranches.ts`, `src/features/git/hooks/useBranchSwitcher.ts`

### Prompts

- Prompt UI and workflow: `src/features/prompts/components/PromptPanel.tsx`, `src/features/prompts/hooks/useCustomPrompts.ts`

## Backend App (Tauri) Navigation

- Command registry (what frontend can invoke): `src-tauri/src/lib.rs`
- Codex adapters: `src-tauri/src/codex/mod.rs`
- Workspace/worktree adapters: `src-tauri/src/workspaces/commands.rs`
- Git adapters: `src-tauri/src/git/mod.rs`
- Settings adapters: `src-tauri/src/settings/mod.rs`
- Prompts adapters: `src-tauri/src/prompts.rs`
- File adapters: `src-tauri/src/files/mod.rs`
- Event emission implementation: `src-tauri/src/event_sink.rs`
- Event payload definitions: `src-tauri/src/backend/events.rs`

## Daemon Navigation

- Daemon entrypoint and state/wiring: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Daemon JSON-RPC dispatcher/router: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon domain handlers: `src-tauri/src/bin/codex_monitor_daemon/rpc/*`
- Daemon transport: `src-tauri/src/bin/codex_monitor_daemon/transport.rs`

When adding a new method, keep method names and payload shape aligned with `src/services/tauri.ts` and app commands in `src-tauri/src/lib.rs`.

## Shared Cores (Source of Truth)

All cross-runtime domain behavior belongs in `src-tauri/src/shared/*`:

- Codex threads/approvals/account/skills/config: `src-tauri/src/shared/codex_core.rs`
- Codex helper commands: `src-tauri/src/shared/codex_aux_core.rs`
- Codex update/version helpers: `src-tauri/src/shared/codex_update_core.rs`
- Workspaces/worktrees: `src-tauri/src/shared/workspaces_core.rs`, `src-tauri/src/shared/workspaces_core/*`, `src-tauri/src/shared/worktree_core.rs`
- Settings model/update: `src-tauri/src/shared/settings_core.rs`
- Files read/write: `src-tauri/src/shared/files_core.rs`
- Git and GitHub logic: `src-tauri/src/shared/git_core.rs`, `src-tauri/src/shared/git_ui_core.rs`, `src-tauri/src/shared/git_ui_core/*`
- Prompts CRUD/listing: `src-tauri/src/shared/prompts_core.rs`
- Usage snapshot and aggregation: `src-tauri/src/shared/local_usage_core.rs`
- Process helpers: `src-tauri/src/shared/process_core.rs`

## Events Map (Backend -> Frontend)

- Backend emits through sink: `src-tauri/src/event_sink.rs`
- App-server event name: `app-server-event`
- Terminal event names: `terminal-output`, `terminal-exit`
- Frontend fanout hubs: `src/services/events.ts`
- Frontend routing into thread state: `src/features/app/hooks/useAppServerEvents.ts` -> thread hooks/reducer under `src/features/threads/hooks/*`

If event payload format changes, update parser/guards first in `src/utils/appServerEvents.ts`.

## Type Contract Files

Keep Rust and TypeScript contracts in sync:

- Rust backend types: `src-tauri/src/types.rs`
- Frontend types: `src/types.ts`

This is required for settings, workspace metadata, app-server payload handling, and RPC response decoding.
