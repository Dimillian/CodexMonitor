# Codebase Map (Task-Oriented)

Canonical navigation guide for CodexMonitor. Use this as: "if you need X, edit Y".

## Start Here: How Changes Flow

For backend behavior, follow this path in order:

1. Frontend callsite: `src/features/**` hooks/components
2. Frontend IPC API: `src/services/tauri.ts`
3. Tauri command registration: `src-tauri/src/lib.rs`
4. App adapter modules: `src-tauri/src/{codex,workspaces,git,files,settings,prompts}/*`
5. Shared core source of truth: `src-tauri/src/shared/*`
6. Daemon RPC parity: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
7. Daemon wiring: `src-tauri/src/bin/codex_monitor_daemon.rs`

If behavior must work in both app and daemon, implement it in `src-tauri/src/shared/*` first.

## If You Need X, Edit Y

| Need | Primary files |
| --- | --- |
| App UI composition/layout | `src/App.tsx`, `src/features/app/components/AppLayout.tsx`, `src/features/app/bootstrap/*`, `src/features/app/orchestration/*`, `src/features/app/hooks/*` |
| Add/change Tauri IPC methods | `src/services/tauri.ts`, `src-tauri/src/lib.rs`, matching backend adapter |
| Change app-server event handling | `src/services/events.ts`, `src/features/app/hooks/useAppServerEvents.ts`, `src/utils/appServerEvents.ts` |
| Change thread state transitions | `src/features/threads/hooks/useThreadsReducer.ts`, `src/features/threads/hooks/threadReducer/*` |
| Change workspace lifecycle/worktrees | `src/features/workspaces/hooks/useWorkspaces.ts`, `src-tauri/src/workspaces/commands.rs`, `src-tauri/src/shared/workspaces_core.rs` |
| Change settings model/update | `src/features/settings/components/SettingsView.tsx`, `src/features/settings/hooks/useAppSettings.ts`, `src/services/tauri.ts`, `src-tauri/src/settings/mod.rs`, `src-tauri/src/shared/settings_core.rs` |
| Change Git/GitHub behavior | `src/features/git/hooks/*`, `src/services/tauri.ts`, `src-tauri/src/git/mod.rs`, `src-tauri/src/shared/git_ui_core.rs`, `src-tauri/src/shared/git_core.rs`, daemon `rpc/git.rs` |
| Change prompts CRUD/listing | `src/features/prompts/hooks/useCustomPrompts.ts`, `src/features/prompts/components/PromptPanel.tsx`, `src/services/tauri.ts`, `src-tauri/src/prompts.rs`, `src-tauri/src/shared/prompts_core.rs` |
| Change daemon JSON-RPC surface | `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`, `src-tauri/src/bin/codex_monitor_daemon/rpc/*`, `src-tauri/src/bin/codex_monitor_daemon.rs` |

## Frontend Navigation

1. Composition root: `src/App.tsx`
2. Tauri IPC wrapper: `src/services/tauri.ts`
3. Event hub fanout: `src/services/events.ts`
4. App-server event router: `src/features/app/hooks/useAppServerEvents.ts`
5. Shared frontend types: `src/types.ts`

## Backend App (Tauri) Navigation

1. Command registry: `src-tauri/src/lib.rs`
2. Codex adapters: `src-tauri/src/codex/mod.rs`
3. Workspace/worktree adapters: `src-tauri/src/workspaces/commands.rs`
4. Git adapters: `src-tauri/src/git/mod.rs`
5. Settings adapters: `src-tauri/src/settings/mod.rs`
6. Prompts adapters: `src-tauri/src/prompts.rs`
7. File adapters: `src-tauri/src/files/mod.rs`

## Daemon Navigation

1. Entrypoint/wiring: `src-tauri/src/bin/codex_monitor_daemon.rs`
2. Dispatcher/router: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
3. Domain handlers: `src-tauri/src/bin/codex_monitor_daemon/rpc/*`

## Shared Cores (Source of Truth)

All cross-runtime domain behavior belongs in `src-tauri/src/shared/*`:

1. Codex core: `src-tauri/src/shared/codex_core.rs`
2. Workspaces/worktrees: `src-tauri/src/shared/workspaces_core.rs`, `src-tauri/src/shared/worktree_core.rs`
3. Settings: `src-tauri/src/shared/settings_core.rs`
4. Files: `src-tauri/src/shared/files_core.rs`
5. Git/GitHub: `src-tauri/src/shared/git_core.rs`, `src-tauri/src/shared/git_ui_core.rs`
6. Prompts: `src-tauri/src/shared/prompts_core.rs`

## Type Contract Files

Keep Rust and TypeScript contracts in sync:

1. Rust backend types: `src-tauri/src/types.rs`
2. Frontend types: `src/types.ts`

