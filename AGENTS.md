# CodexMonitor Agent Guide

All docs must be canonical, with no past commentary, only live state.

## Project Summary
CodexMonitor is a Tauri app that orchestrates Codex agents across local workspaces.

- Frontend: React + Vite
- Backend (app): Tauri Rust process
- Backend (daemon): `src-tauri/src/bin/codex_monitor_daemon.rs`
- Shared backend domain logic: `src-tauri/src/shared/*`

## Backend Architecture

The backend separates shared domain logic from environment wiring.

- Shared domain/core logic: `src-tauri/src/shared/*`
- App wiring and platform concerns: feature folders + adapters
- Daemon wiring and transport concerns: `src-tauri/src/bin/codex_monitor_daemon.rs` and `src-tauri/src/bin/codex_monitor_daemon/*`

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

Root-level single-file features remain at `src-tauri/src/*.rs` (for example: `menu.rs`, `prompts.rs`, `terminal.rs`).
Module-folder features remain in dedicated folders (for example: `src-tauri/src/remote_backend/*`, `src-tauri/src/tailscale/*`).

## Shared Core Modules (Source of Truth)

Shared logic that must work in both the app and the daemon lives under `src-tauri/src/shared/`.

- `src-tauri/src/shared/codex_core.rs`
  - Threads, approvals, login/cancel, account, skills, config model
- `src-tauri/src/shared/codex_aux_core.rs`
  - Codex helper logic used by app and daemon adapters
- `src-tauri/src/shared/codex_update_core.rs`
  - Codex update and version comparison helpers
- `src-tauri/src/shared/workspaces_core.rs`
  - Workspace/worktree operations, persistence, sorting, git command helpers
- `src-tauri/src/shared/settings_core.rs`
  - App settings load/update, Codex config path
- `src-tauri/src/shared/files_core.rs`
  - File read/write logic
- `src-tauri/src/shared/git_core.rs`
  - Git command helpers and remote/branch logic
- `src-tauri/src/shared/git_ui_core.rs`
  - Git/GitHub UI-facing backend logic shared across app and daemon
- `src-tauri/src/shared/local_usage_core.rs`
  - Local usage snapshots and workspace usage aggregation
- `src-tauri/src/shared/orbit_core.rs`
  - Orbit connectivity and auth flow helpers
- `src-tauri/src/shared/process_core.rs`
  - Process spawn and command execution helper utilities
- `src-tauri/src/shared/prompts_core.rs`
  - Prompt CRUD/listing helpers for global and workspace prompts
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
- Daemon RPC handler and method router: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Daemon transport wiring: `src-tauri/src/bin/codex_monitor_daemon/transport.rs`
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

### Design System Usage

Use the design-system layer for shared UI shells and tokenized styling.

- Primitive component locations:
  - `src/features/design-system/components/modal/ModalShell.tsx`
  - `src/features/design-system/components/toast/ToastPrimitives.tsx`
  - `src/features/design-system/components/panel/PanelPrimitives.tsx`
  - `src/features/design-system/components/popover/PopoverPrimitives.tsx`
  - Toast sub-primitives: `ToastHeader`, `ToastActions`, `ToastError` (in `ToastPrimitives.tsx`)
  - Panel sub-primitives: `PanelMeta`, `PanelSearchField`, `PanelNavList`, `PanelNavItem` (in `PanelPrimitives.tsx`)
  - Popover sub-primitives: `PopoverMenuItem` (in `PopoverPrimitives.tsx`)
- Diff theming and style bridge:
  - `src/features/design-system/diff/diffViewerTheme.ts`
- DS token/style locations:
  - `src/styles/ds-tokens.css`
  - `src/styles/ds-modal.css`
  - `src/styles/ds-toast.css`
  - `src/styles/ds-panel.css`
  - `src/styles/ds-popover.css`
  - `src/styles/ds-diff.css`

Naming conventions:

- DS CSS classes use `.ds-*` prefixes.
- DS CSS variables use `--ds-*` prefixes.
- DS React primitives use `PascalCase` component names (`ModalShell`, `ToastCard`, `ToastHeader`, `ToastActions`, `ToastError`, `PanelFrame`, `PanelHeader`, `PanelMeta`, `PanelSearchField`, `PanelNavList`, `PanelNavItem`, `PopoverSurface`, `PopoverMenuItem`).
- Feature CSS should keep feature-prefixed classes (`.worktree-*`, `.update-*`) for content/layout specifics.

Do:

- Use DS primitives first for shared shells (modal wrappers, toast cards/viewports, panel shells/headers, popover/dropdown surfaces).
- Pull shared visual tokens from `--ds-*` variables.
- Keep feature styles focused on feature-specific layout/content, not duplicated shell chrome.
- Centralize shared animation/chrome in DS stylesheets when used by multiple feature families.

Don't:

- Recreate fixed modal backdrops/cards in feature CSS when `ModalShell` is used.
- Duplicate toast card chrome (background/border/shadow/padding/enter animation) per toast family.
- Duplicate panel shell layout/header alignment in feature styles when `PanelFrame`/`PanelHeader` already provide it.
- Recreate popover/dropdown shell chrome in feature CSS when `PopoverSurface`/`PopoverMenuItem` already provide it.
- Add new non-DS color constants for shared shells; add/extend DS tokens instead.

Migration guidance for new/updated components:

1. Start by wrapping UI in the closest DS primitive.
2. Migrate shared shell styles into DS CSS (`ds-*.css`) and delete redundant feature-level shell selectors.
3. Keep only feature-local classes for spacing/content/interaction details.
4. For legacy selectors that are still referenced, keep minimal compatibility aliases temporarily.
5. Remove compatibility aliases once callsites reach zero, then rerun lint/typecheck/tests.

Anti-duplication guidance:

- Before adding shell styles, search for existing DS token/primitive coverage.
- If two or more feature files need the same shell rule, move it to DS CSS immediately.
- Prefer extending DS primitives/tokens over introducing another feature-specific wrapper class.
- During refactors, remove unused legacy selectors once callsites are migrated.

Enforcement workflow:

- Lint guardrails for DS-targeted files live in `.eslintrc.cjs`.
- Popover guardrails are enforced for migrated popover files (`MainHeader`, `Sidebar`, `SidebarHeader`, `SidebarCornerActions`, `OpenAppMenu`, `LaunchScript*`, `ComposerInput`, `FilePreviewPopover`, `WorkspaceHome`) to require `PopoverSurface`/`PopoverMenuItem`.
- Codemod scripts live in `scripts/codemods/`:
  - `modal-shell-codemod.mjs`
  - `panel-shell-codemod.mjs`
  - `toast-shell-codemod.mjs`
- Run `npm run codemod:ds:dry` before UI shell migration PRs.
- Keep `npm run lint:ds`/`npm run lint` green for modal/toast/panel/popover/diff files.

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
   - Update `src-tauri/src/bin/codex_monitor_daemon.rs` and/or `src-tauri/src/bin/codex_monitor_daemon/*` modules.

### How to Add a New Backend Command

1. Implement the core logic in a shared module.
2. Wire it in the app.
   - Add a Tauri command in `src-tauri/src/lib.rs`.
   - Call the shared core from the appropriate adapter.
   - Mirror it in `src/services/tauri.ts`.
3. Wire it in the daemon.
   - Add a daemon method that calls the same shared core.
   - Add/update the JSON-RPC handler branch in `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`.

### Backend Command Checklist

For any new backend command or command shape change, update all layers:

1. Shared logic first (`src-tauri/src/shared/*`) when behavior is domain-level.
2. Tauri command surface (`src-tauri/src/lib.rs`).
3. Frontend IPC client (`src/services/tauri.ts`).
4. Daemon JSON-RPC surface (`src-tauri/src/bin/codex_monitor_daemon/rpc.rs`).
5. Tests for touched layers (TS + Rust as applicable).

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
  - Daemon wiring: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Settings and Codex config:
  - Shared core: `src-tauri/src/shared/settings_core.rs`
  - App adapters: `src-tauri/src/codex/config.rs`, `src-tauri/src/settings/mod.rs`
  - Daemon wiring: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Files:
  - Shared core: `src-tauri/src/shared/files_core.rs`
  - App adapters: `src-tauri/src/files/*`
  - Daemon wiring: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Codex threads/approvals/login:
  - Shared core: `src-tauri/src/shared/codex_core.rs`
  - App adapters: `src-tauri/src/codex/*`
  - Daemon wiring: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`

## Navigation Hotspots

High-churn or high-complexity files where extra care is needed:

- `src/App.tsx` (frontend orchestration root)
- `src/features/settings/components/SettingsView.tsx` (settings surface)
- `src/features/threads/hooks/useThreadsReducer.ts` (thread state transitions)
- `src-tauri/src/shared/git_ui_core.rs` (shared git/github logic)
- `src-tauri/src/shared/workspaces_core.rs` (workspace/worktree core)
- `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` (daemon RPC routing)

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
npm run tauri:dev
```

## iOS (WIP)

- iOS is supported as WIP.
- Simulator:
```bash
./scripts/build_run_ios.sh
```
- USB device:
```bash
./scripts/build_run_ios_device.sh --list-devices
./scripts/build_run_ios_device.sh --device "Dimillian’s iPhone" --team Z6P74P6T99
```
- If signing is not ready:
```bash
./scripts/build_run_ios_device.sh --open-xcode
```

## Release Build

```bash
npm run tauri:build
```

## Canonical Commands

Prefer these package scripts (source of truth: `package.json`):

```bash
npm install
npm run doctor:strict
npm run tauri:dev
npm run tauri:build
npm run lint
npm run test
npm run typecheck
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
