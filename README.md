# CodexMonitor

![CodexMonitor](screenshot.png)

CodexMonitor is a macOS Tauri app for orchestrating multiple Codex agents across local workspaces. It provides a sidebar to manage projects, a home screen for quick actions, and a conversation view backed by the Codex app-server protocol.

## Features

### Workspaces & Threads

- Add and persist workspaces, group/sort them, and jump into recent agent activity from the home dashboard.
- Spawn one `codex app-server` per workspace, resume threads, and track unread/running state.
- Worktree and clone agents for isolated work; worktrees live under the app data directory (legacy `.codex-worktrees` supported).
- Thread management: pin/rename/archive/copy, per-thread drafts, and stop/interrupt in-flight turns.
- Optional remote backend (daemon) mode for running Codex on another machine.

### Composer & Agent Controls

- Compose with queueing plus image attachments (picker, drag/drop, paste).
- Autocomplete for skills (`$`), prompts (`/prompts:`), reviews (`/review`), and file paths (`@`).
- Model picker, collaboration modes (when enabled), reasoning effort, access mode, and context usage ring.
- Dictation with hold-to-talk shortcuts and live waveform (Whisper).
- Render reasoning/tool/diff items and handle approval prompts.

### Git & GitHub

- Diff stats, staged/unstaged file diffs, revert/stage controls, and commit log.
- Branch list with checkout/create plus upstream ahead/behind counts.
- GitHub Issues and Pull Requests via `gh` (lists, diffs, comments) and open commits/PRs in the browser.
- PR composer: "Ask PR" to send PR context into a new agent thread.

### Files & Prompts

- File tree with search, file-type icons, and Reveal in Finder.
- Prompt library for global/workspace prompts: create/edit/delete/move and run in current or new threads.

### UI & Experience

- Resizable sidebar/right/plan/terminal/debug panels with persisted sizes.
- Responsive layouts (desktop/tablet/phone) with tabbed navigation.
- Sidebar usage and credits meter for account rate limits plus a home usage snapshot.
- Terminal dock with multiple tabs for background commands (experimental).
- In-app updates with toast-driven download/install, debug panel copy/clear, sound notifications, and macOS overlay title bar with vibrancy + reduced transparency toggle.

## Requirements

- Node.js + npm
- Rust toolchain (stable)
- CMake (required for native dependencies; Whisper/dictation uses it on non-Windows)
- Codex installed on your system and available as `codex` in `PATH`
- Git CLI (used for worktree operations)
- GitHub CLI (`gh`) for the Issues panel (optional)

If the `codex` binary is not in `PATH`, update the backend to pass a custom path per workspace.
If you hit native build errors, run:

```bash
npm run doctor
```

## Getting Started

Install dependencies:

```bash
npm install
```

Run in dev mode:

```bash
npm run tauri dev
```

## Release Build

Build the production Tauri bundle (app + dmg):

```bash
npm run tauri build
```

The macOS app bundle will be in `src-tauri/target/release/bundle/macos/`.

### Windows (opt-in)

Windows builds are opt-in and use a separate Tauri config file to avoid macOS-only window effects.

```bash
npm run tauri:build:win
```

Artifacts will be in:

- `src-tauri/target/release/bundle/nsis/` (installer exe)
- `src-tauri/target/release/bundle/msi/` (msi)

Note: dictation is currently disabled on Windows builds (to avoid requiring LLVM/libclang for `whisper-rs`/bindgen).

## Type Checking

Run the TypeScript checker (no emit):

```bash
npm run typecheck
```

Note: `npm run build` also runs `tsc` before bundling the frontend.

## Project Structure

```
src/
  features/         feature-sliced UI + hooks
  services/         Tauri IPC wrapper
  styles/           split CSS by area
  types.ts          shared types
src-tauri/
  src/lib.rs        Tauri backend + codex app-server client
  tauri.conf.json   window configuration
```

## Notes

- Workspaces persist to `workspaces.json` under the app data directory.
- App settings persist to `settings.json` under the app data directory (Codex path, default access mode, UI scale).
- Experimental settings supported in the UI: Collab mode (`features.collab`), Background terminal (`features.unified_exec`), and Steer mode (`features.steer`), synced to `$CODEX_HOME/config.toml` (or `~/.codex/config.toml`) on load/save.
- On launch and on window focus, the app reconnects and refreshes thread lists for each workspace.
- Threads are restored by filtering `thread/list` results using the workspace `cwd`.
- Selecting a thread always calls `thread/resume` to refresh messages from disk.
- CLI sessions appear if their `cwd` matches the workspace path; they are not live-streamed unless resumed.
- The app uses `codex app-server` over stdio; see `src-tauri/src/lib.rs`.
- Codex sessions use the default Codex home (usually `~/.codex`); if a legacy `.codexmonitor/` exists in a workspace, it is used for that workspace.
- Worktree agents live under the app data directory (`worktrees/<workspace-id>`); legacy `.codex-worktrees/` paths remain supported, and the app no longer edits repo `.gitignore` files.
- UI state (panel sizes, reduced transparency toggle, recent thread activity) is stored in `localStorage`.
- Custom prompts load from `$CODEX_HOME/prompts` (or `~/.codex/prompts`) with optional frontmatter description/argument hints.

## Tauri IPC Surface

Frontend calls live in `src/services/tauri.ts` and map to commands in `src-tauri/src/lib.rs`. Core commands include:

- Workspace lifecycle: `list_workspaces`, `add_workspace`, `add_worktree`, `remove_workspace`, `remove_worktree`, `connect_workspace`, `update_workspace_settings`.
- Threads: `start_thread`, `list_threads`, `resume_thread`, `archive_thread`, `send_user_message`, `turn_interrupt`, `respond_to_server_request`.
- Reviews + models: `start_review`, `model_list`, `account_rate_limits`, `skills_list`.
- Git + files: `get_git_status`, `get_git_diffs`, `get_git_log`, `get_git_remote`, `list_git_branches`, `checkout_git_branch`, `create_git_branch`, `list_workspace_files`.
