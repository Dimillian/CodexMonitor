# CopilotMonitor Agent Guide

All docs must canonical, no past commentary, only live state.

## Project Summary
CopilotMonitor is a Tauri app that orchestrates Codex agents across local workspaces.

- Frontend: React + Vite
- Backend (app): Tauri Rust process
- Backend (daemon): `src-tauri/src/bin/codex_monitor_daemon.rs`
- Shared backend domain logic: `src-tauri/src/shared/*`

## Backend Architecture

The backend separates shared domain logic from environment wiring.

- Shared domain/core logic: `src-tauri/src/shared/*`
- App wiring and platform concerns: feature folders + adapters
- Daemon wiring and transport concerns: `src-tauri/src/bin/codex_monitor_daemon.rs`

## Feature Folders

### Codex

- `src-tauri/src/codex/mod.rs`
- `src-tauri/src/codex/args.rs`
- `src-tauri/src/codex/home.rs`
- `src-tauri/src/codex/config.rs`

### Files

- `src-tauri/src/files/mod.rs`
- `src-tauri/src/files/io.rs`
- `src-tauri/src/files/ops.rs`
- `src-tauri/src/files/policy.rs`

### Dictation

- `src-tauri/src/dictation/mod.rs`
- `src-tauri/src/dictation/real.rs`
- `src-tauri/src/dictation/stub.rs`

### Workspaces

- `src-tauri/src/workspaces/*`

### Shared Core Layer

- `src-tauri/src/shared/*`

Root-level single-file features remain at `src-tauri/src/*.rs` (for example: `menu.rs`, `prompts.rs`, `terminal.rs`, `remote_backend.rs`).

## Shared Core Modules (Source of Truth)

Shared logic that must work in both the app and the daemon lives under `src-tauri/src/shared/`.

- `src-tauri/src/shared/codex_core.rs`
  - Threads, approvals, login/cancel, account, skills, config model
- `src-tauri/src/shared/workspaces_core.rs`
  - Workspace/worktree operations, persistence, sorting, git command helpers
- `src-tauri/src/shared/settings_core.rs`
  - App settings load/update, Codex config path
- `src-tauri/src/shared/files_core.rs`
  - File read/write logic
- `src-tauri/src/shared/git_core.rs`
  - Git command helpers and remote/branch logic
- `src-tauri/src/shared/worktree_core.rs`
  - Worktree naming/path helpers and clone destination helpers
- `src-tauri/src/shared/account.rs`
  - Account helper utilities and tests

## App/Daemon Pattern

Use this mental model when changing backend code:

1. Put shared logic in a shared core module.
2. Keep app and daemon code as thin adapters.
3. Pass environment-specific behavior via closures or small adapter helpers.

The app and daemon do not re-implement domain logic.

## Daemon Module Wrappers

The daemon defines wrapper modules named `codex` and `files` inside `src-tauri/src/bin/codex_monitor_daemon.rs`.

These wrappers re-export the daemon’s local modules:

- Codex: `codex_args`, `codex_home`, `codex_config`
- Files: `file_io`, `file_ops`, `file_policy`

Shared cores use `crate::codex::*` and `crate::files::*` paths. The daemon wrappers satisfy those paths without importing app-only modules.

## Key Paths

### Frontend

- Composition root: `src/App.tsx`
- Feature slices: `src/features/`
- Tauri IPC wrapper: `src/services/tauri.ts`
- Tauri event hub: `src/services/events.ts`
- Shared UI types: `src/types.ts`
- Thread item normalization: `src/utils/threadItems.ts`
- Styles: `src/styles/`

### Backend (App)

- Tauri command registry: `src-tauri/src/lib.rs`
- Codex adapters: `src-tauri/src/codex/*`
- Files adapters: `src-tauri/src/files/*`
- Dictation adapters: `src-tauri/src/dictation/*`
- Workspaces adapters: `src-tauri/src/workspaces/*`
- Shared core layer: `src-tauri/src/shared/*`
- Git feature: `src-tauri/src/git/mod.rs`

### Backend (Daemon)

- Daemon entrypoint: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Daemon imports shared cores via `#[path = "../shared/mod.rs"] mod shared;`

## Architecture Guidelines

### Frontend Guidelines

- Composition root: keep orchestration in `src/App.tsx`.
- Components: presentational only. Props in, UI out. No Tauri IPC.
- Hooks: own state, side effects, and event wiring.
- Utils: pure helpers only in `src/utils/`.
- Services: all Tauri IPC goes through `src/services/`.
- Types: shared UI types live in `src/types.ts`.
- Styles: one CSS file per UI area under `src/styles/`.

Keep `src/App.tsx` lean:

- Keep it to wiring: hook composition, layout, and assembly.
- Move stateful logic/effects into hooks under `src/features/app/hooks/`.
- Keep Tauri IPC, menu listeners, and subscriptions out of `src/App.tsx`.

### Backend Guidelines

- Shared logic goes in `src-tauri/src/shared/` first.
- App and daemon are thin adapters around shared cores.
- Avoid duplicating git/worktree/codex/settings/files logic in adapters.
- Prefer explicit, readable adapter helpers over clever abstractions.
- Do not folderize single-file features unless you are splitting them.

## Daemon: How and When to Add Code

The daemon runs backend logic outside the Tauri app.

### When to Update the Daemon

Update the daemon when one of these is true:

- A Tauri command is used in remote mode.
- The daemon exposes the same behavior over its JSON-RPC transport.
- Shared core behavior changes and the daemon wiring must pass new inputs.

### Where Code Goes

1. Shared behavior or domain logic:
   - Add or update code in `src-tauri/src/shared/*.rs`.
2. App-only behavior:
   - Update the app adapters or Tauri commands.
3. Daemon-only transport/wiring behavior:
   - Update `src-tauri/src/bin/codex_monitor_daemon.rs`.

### How to Add a New Backend Command

1. Implement the core logic in a shared module.
2. Wire it in the app.
   - Add a Tauri command in `src-tauri/src/lib.rs`.
   - Call the shared core from the appropriate adapter.
   - Mirror it in `src/services/tauri.ts`.
3. Wire it in the daemon.
   - Add a daemon method that calls the same shared core.
   - Add the JSON-RPC handler branch in `codex_monitor_daemon.rs`.

### Adapter Patterns to Reuse

- Shared git unit wrapper:
  - `workspaces_core::run_git_command_unit(...)`
- App spawn adapter:
  - `spawn_with_app(...)` in `src-tauri/src/workspaces/commands.rs`
- Daemon spawn adapter:
  - `spawn_with_client(...)` in `src-tauri/src/bin/codex_monitor_daemon.rs`
- Daemon wrapper modules:
  - `mod codex { ... }` and `mod files { ... }` in `codex_monitor_daemon.rs`

If you find yourself copying logic between app and daemon, extract it into `src-tauri/src/shared/`.

## App-Server Flow

- Backend spawns `codex app-server` using the `codex` binary.
- Initialize with `initialize` and then `initialized`.
- Do not send requests before initialization.
- JSON-RPC notifications stream over stdout.
- Threads are listed via `thread/list` and resumed via `thread/resume`.
- Archiving uses `thread/archive`.

## Event Stack (Tauri → React)

The app uses a shared event hub so each native event has one `listen` and many subscribers.

- Backend emits: `src-tauri/src/lib.rs` emits events to the main window.
- Frontend hub: `src/services/events.ts` defines `createEventHub` and module-level hubs.
- React subscription: use `useTauriEvent(subscribeX, handler)`.

### Adding a New Tauri Event

1. Emit the event in `src-tauri/src/lib.rs`.
2. Add a hub and `subscribeX` helper in `src/services/events.ts`.
3. Subscribe via `useTauriEvent` in a hook or component.
4. Update `src/services/events.test.ts` if you add new subscription helpers.

## Workspace Persistence

- Workspaces live in `workspaces.json` under the app data directory.
- Settings live in `settings.json` under the app data directory.
- On launch, the app connects each workspace once and loads its thread list.

## Common Changes (Where to Look First)

- UI layout or styling:
  - `src/features/*/components/*` and `src/styles/*`
- App-server events:
  - `src/features/app/hooks/useAppServerEvents.ts`
- Tauri IPC shape:
  - `src/services/tauri.ts` and `src-tauri/src/lib.rs`
- Shared backend behavior:
  - `src-tauri/src/shared/*`
- Workspaces/worktrees:
  - Shared core: `src-tauri/src/shared/workspaces_core.rs`
  - App adapters: `src-tauri/src/workspaces/*`
  - Daemon wiring: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Settings and Codex config:
  - Shared core: `src-tauri/src/shared/settings_core.rs`
  - App adapters: `src-tauri/src/codex/config.rs`, `src-tauri/src/settings/mod.rs`
  - Daemon wiring: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Files:
  - Shared core: `src-tauri/src/shared/files_core.rs`
  - App adapters: `src-tauri/src/files/*`
- Codex threads/approvals/login:
  - Shared core: `src-tauri/src/shared/codex_core.rs`
  - App adapters: `src-tauri/src/codex/*`
  - Daemon wiring: `src-tauri/src/bin/codex_monitor_daemon.rs`

## Threads Feature Split (Frontend)

`useThreads` is a composition layer that wires focused hooks and shared utilities.

- Orchestration: `src/features/threads/hooks/useThreads.ts`
- Actions: `src/features/threads/hooks/useThreadActions.ts`
- Approvals: `src/features/threads/hooks/useThreadApprovals.ts`
- Event handlers: `src/features/threads/hooks/useThreadEventHandlers.ts`
- Messaging: `src/features/threads/hooks/useThreadMessaging.ts`
- Storage: `src/features/threads/hooks/useThreadStorage.ts`
- Status helpers: `src/features/threads/hooks/useThreadStatus.ts`
- Selectors: `src/features/threads/hooks/useThreadSelectors.ts`
- Rate limits: `src/features/threads/hooks/useThreadRateLimits.ts`
- Collab links: `src/features/threads/hooks/useThreadLinking.ts`

## Running Locally

```bash
npm install
npm run tauri dev
```

## Release Build

```bash
npm run tauri build
```

## Type Checking

```bash
npm run typecheck
```

## Tests

```bash
npm run test
```

```bash
npm run test:watch
```

## Validation

At the end of a task:

1. Run `npm run lint`.
2. Run `npm run test` when you touched threads, settings, updater, shared utils, or backend cores.
3. Run `npm run typecheck`.
4. If you changed Rust backend code, run `cargo check` in `src-tauri`.

## Notes

- The window uses `titleBarStyle: "Overlay"` and macOS private APIs for transparency.
- Avoid breaking JSON-RPC format; the app-server is strict.
- App settings and Codex feature toggles are best-effort synced to `CODEX_HOME/config.toml`.
- UI preferences live in `localStorage`.
- GitHub issues require `gh` to be installed and authenticated.
- Custom prompts are loaded from `$CODEX_HOME/prompts` (or `~/.codex/prompts`).

## Error Toasts

- Use `pushErrorToast` from `src/services/toasts.ts` for user-facing errors.
- Toast wiring:
  - Hook: `src/features/notifications/hooks/useErrorToasts.ts`
  - UI: `src/features/notifications/components/ErrorToasts.tsx`
  - Styles: `src/styles/error-toasts.css`
