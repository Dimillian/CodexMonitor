# CodexMonitor Agent Guide

## Project Summary
CodexMonitor is a macOS Tauri app that orchestrates Codex agents across local workspaces. The frontend is React + Vite; the backend is a Tauri Rust process that spawns `codex app-server` per workspace and streams JSON-RPC events.

## Key Paths

- `src/App.tsx`: composition root
- `src/features/`: feature-sliced UI, hooks, and local helpers
- `src/features/settings/components/SettingsView.tsx`: settings UI (projects, display, Codex)
- `src/features/update/components/UpdateToast.tsx`: in-app updater UI
- `src/features/home/components/Home.tsx`: home dashboard + latest agent runs
- `src/features/settings/hooks/useAppSettings.ts`: app settings load/save + doctor
- `src/features/update/hooks/useUpdater.ts`: update checks + install flow
- `src/features/layout/hooks/useResizablePanels.ts`: panel resize + persistence
- `src/features/composer/hooks/useComposerImages.ts`: image attachment state
- `src/features/composer/hooks/useComposerImageDrop.ts`: drag/drop + paste images
- `src/features/git/hooks/useGitHubIssues.ts`: GitHub issues tab data
- `src/utils/threadItems.ts`: thread item normalization + conversion
- `src/services/tauri.ts`: Tauri IPC wrapper
- `src/styles/`: split CSS by area
- `src/types.ts`: shared types
- `src-tauri/src/lib.rs`: backend app-server client
- `src-tauri/src/git.rs`: git status/log/diff + GitHub issues via `gh`
- `src-tauri/src/settings.rs`: app settings persistence
- `src-tauri/src/codex_config.rs`: read/write Codex `config.toml` feature flags
- `src-tauri/src/prompts.rs`: custom prompt discovery/parsing
- `src-tauri/tauri.conf.json`: window config + effects

## Architecture Guidelines

- **Composition root**: keep orchestration in `src/App.tsx`; avoid logic in components.
- **Components**: presentational only; props in, UI out; no Tauri IPC calls.
- **Hooks**: own state, side-effects, and event wiring (e.g., app-server events).
- **Utils**: pure helpers live in `src/utils/` (no React hooks here).
- **Services**: all Tauri IPC goes through `src/services/` (prefer `src/services/tauri.ts`; event subscriptions can live in `src/services/events.ts`).
- **Types**: shared UI data types live in `src/types.ts`.
- **Styles**: one CSS file per UI area in `src/styles/` (no global refactors in components).
- **Backend IPC**: add new commands in `src-tauri/src/lib.rs` and mirror them in the service.
- **App-server protocol**: do not send any requests before `initialize/initialized`.

## App-Server Flow

- Backend spawns `codex app-server` using the `codex` binary.
- Initializes with `initialize` request and `initialized` notification.
- Streams JSON-RPC notifications over stdout; request/response pairs use `id`.
- Approval requests arrive as server-initiated JSON-RPC requests.
- Threads are fetched via `thread/list`, filtered by `cwd`, and resumed via `thread/resume` when selected.
- Archiving uses `thread/archive` and removes the thread from the UI list.

## Event Stack (Tauri → React)

The app uses a shared event hub for Tauri events so each event has exactly one native `listen` and fan-outs to React subscribers.

- **Backend emits**: `src-tauri/src/lib.rs` uses `emit_menu_event` (or `app.emit`) to send events to the `"main"` window.
- **Frontend hub**: `src/services/events.ts` defines `createEventHub` and module-level hubs (one per event). These hubs call `listen` once and dispatch to subscribers. Each listener call is wrapped in `try/catch` so one handler cannot block others.
- **React subscription**: components/hooks call `useTauriEvent` with a `subscribeX` function from `src/services/events.ts`. Avoid calling `listen` directly from React.

### Adding a new Tauri event

1) **Backend emit**: add a new menu item or command in `src-tauri/src/lib.rs` that calls `app.emit("event-name", payload)` or `emit_menu_event(...)`.
2) **Frontend hub**: add a hub and subscription in `src/services/events.ts`:
   - Define the payload type (or reuse an existing one).
   - Create `const myEventHub = createEventHub<MyPayload>("event-name");`
   - Export `subscribeMyEvent(onEvent, options)` that delegates to the hub.
3) **React usage**: wire it up with `useTauriEvent(subscribeMyEvent, handler)` in a hook/component (usually `src/App.tsx` or a feature hook).
4) **Tests**: update `src/services/events.test.ts` if you add new subscription helpers.

## Workspace Persistence

- Workspaces are stored in `workspaces.json` under the app data directory.
- `list_workspaces` returns saved items; `add_workspace` persists and spawns a session.
- On launch, the app connects each workspace once and loads its thread list.
  - `src/App.tsx` guards this with a `Set` to avoid connect/list loops.

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

- At the end of a task, run `npm run lint` first.
- Run `npm run test` when you touched thread handling, settings, updater, or any shared utils.
- Finish with `npm run typecheck`.

## Common Changes

- UI layout or styling: update `src/features/*/components/*` and `src/styles/*`.
- App-server event handling: edit `src/features/app/hooks/useAppServerEvents.ts`.
- Tauri IPC: add wrappers in `src/services/tauri.ts` and implement in `src-tauri/src/lib.rs`.
- App settings or updater behavior: `src/features/settings/hooks/useAppSettings.ts`, `src/features/update/hooks/useUpdater.ts`, and `src/features/settings/components/SettingsView.tsx`.
- Experimental feature toggles: UI state in `src/features/settings/components/SettingsView.tsx`, shared types in `src/types.ts`, and sync to Codex `config.toml` via `src-tauri/src/codex_config.rs` + `src-tauri/src/settings.rs` (daemon mirror in `src-tauri/src/bin/codex_monitor_daemon.rs`).
- Git diff behavior: `src/features/git/hooks/useGitStatus.ts` (polling + activity refresh) and `src-tauri/src/lib.rs` (libgit2 status).
- GitHub issues panel: `src/features/git/hooks/useGitHubIssues.ts` + `src-tauri/src/git.rs`.
- Thread history rendering: `src/features/threads/hooks/useThreads.ts` converts `thread/resume` turns into UI items.
  - Thread names update on first user message (preview-based), and on resume if a preview exists.
- Thread item parsing/normalization: `src/utils/threadItems.ts`.
- Thread state reducer: `src/features/threads/hooks/useThreadsReducer.ts`.

## Notes

- The window uses `titleBarStyle: "Overlay"` and macOS private APIs for transparency.
- Avoid breaking the JSON-RPC format; app-server rejects requests before initialization.
- The debug panel is UI-only; it logs client/server/app-server events from `useAppServerEvents`.
- App settings live in `settings.json` under the app data directory (Codex path, default access mode, UI scale).
- Experimental toggles that map to Codex features (`collab`, `steer`, `unified_exec`) are synced to `CODEX_HOME/config.toml` (or `~/.codex/config.toml`) on load/save and are best-effort (settings still persist if the file is missing/unwritable).
- UI preferences (panel sizes, reduced transparency toggle, recent thread activity) live in `localStorage`.
- GitHub issues require `gh` to be installed and authenticated.
- Custom prompts are loaded from `$CODEX_HOME/prompts` (or `~/.codex/prompts`) and support optional frontmatter metadata.
