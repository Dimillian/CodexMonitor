# CodexMonitor

![CodexMonitor](screenshot.png)

CodexMonitor is a macOS Tauri app for orchestrating multiple Codex agents across local workspaces. It provides a sidebar to manage projects, a home screen for quick actions, and a conversation view backed by the Codex app-server protocol.

## Features

- Add and persist workspaces with a home dashboard of recent agent activity.
- Spawn one `codex app-server` per workspace, stream JSON-RPC events, and resume threads on selection.
- Start agent threads, send messages, render reasoning/tool/diff items, and handle approvals.
- Worktree agents per workspace (create/delete git worktrees under `.codex-worktrees`) with quick worktree info.
- Git panel with diff stats, file diffs, commit log, and GitHub Issues (via `gh`); open commits on GitHub when a remote is detected.
- Branch list with checkout and create flows.
- Model picker, reasoning effort selector, access mode (read-only/current/full-access), and context usage ring.
- Skills menu and composer autocomplete for `$skill`, `/prompts:...`, `/review ...`, and `@file` tokens.
- Plan panel for per-turn planning updates plus turn interrupt controls.
- Review runs against uncommitted changes, base branch, commits, or custom instructions.
- Debug panel for warning/error events with clipboard export.
- Sidebar usage + credits meter for account rate limits.
- Composer queueing plus image attachments (picker, drag/drop, paste) with per-thread drafts.
- Resizable sidebar/right/plan/debug panels with persisted sizes.
- Responsive layouts for desktop/tablet/phone with tabbed navigation.
- In-app updater with toast-driven download/install.
- macOS overlay title bar with vibrancy effects and optional reduced transparency.

## Requirements

- Node.js + npm
- Rust toolchain (stable)
- CMake (required to build native Whisper bindings)
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
