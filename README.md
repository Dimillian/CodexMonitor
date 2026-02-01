# GeminiMonitor

![GeminiMonitor](screenshot.png)

GeminiMonitor is a desktop app for chatting with Google's Gemini AI across your local project workspaces. It provides a sidebar to manage projects, a home screen for quick actions, and a conversation view powered by the Gemini CLI.

## Installation

### From Releases

Download the latest release from the [GitHub Releases](https://github.com/Dimillian/GeminiMonitor/releases) page:

- **macOS**: Download the `.dmg` file, open it, and drag to Applications
- **Linux**: Download the `.AppImage` file, make it executable, and run it

### From Source

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for detailed build instructions.

Quick start:
```bash
npm install
npm run tauri:dev    # Development
npm run tauri:build  # Production (creates .app and .dmg)
```

## Features

### Workspaces & Threads

- Add and persist workspaces, group/sort them, and jump into recent agent activity from the home dashboard.
- Each workspace gets its own Gemini session with conversation history.
- Thread management: pin/rename/archive/copy, per-thread drafts, and stop/interrupt in-flight turns.

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

### For Users (Pre-built Release)

- **Gemini CLI** installed and available as `gemini` in your PATH
  - Install from [Google AI Studio](https://aistudio.google.com/) or follow the [Gemini CLI documentation](https://ai.google.dev/gemini-api/docs/)
- Git CLI (optional, for Git panel features)
- GitHub CLI (`gh`) for the Issues panel (optional)

If the `gemini` binary is not in `PATH`, you can configure a custom path in the app settings.

### For Developers (Building from Source)

- Node.js + npm
- Rust toolchain (stable)
- CMake (required for native dependencies; Whisper/dictation uses it on non-Windows)
- Git CLI
- GitHub CLI (`gh`) for the Issues panel (optional)

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

### Automated Builds (GitHub Actions)

The repository includes workflows for automated builds:

- **Build DMG**: Builds unsigned or signed DMG files on demand
- **Release**: Full release workflow with code signing and notarization

See [docs/RELEASE.md](docs/RELEASE.md) for setting up code signing and notarization.

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
  src/lib.rs        Tauri backend + Gemini CLI integration
  tauri.conf.json   window configuration
```

## Notes

- Workspaces persist to `workspaces.json` under the app data directory.
- App settings persist to `settings.json` under the app data directory (Gemini path, default access mode, UI scale).
- On launch and on window focus, the app reconnects and refreshes thread lists for each workspace.
- The app spawns the Gemini CLI for each conversation turn; see `src-tauri/src/backend/gemini_session.rs`.
- UI state (panel sizes, reduced transparency toggle, recent thread activity) is stored in `localStorage`.

## Tauri IPC Surface

Frontend calls live in `src/services/tauri.ts` and map to commands in `src-tauri/src/lib.rs`. Core commands include:

- Workspace lifecycle: `list_workspaces`, `add_workspace`, `add_worktree`, `remove_workspace`, `remove_worktree`, `connect_workspace`, `update_workspace_settings`.
- Threads: `start_thread`, `list_threads`, `resume_thread`, `archive_thread`, `send_user_message`, `turn_interrupt`, `respond_to_server_request`.
- Reviews + models: `start_review`, `model_list`, `account_rate_limits`, `skills_list`.
- Git + files: `get_git_status`, `get_git_diffs`, `get_git_log`, `get_git_remote`, `list_git_branches`, `checkout_git_branch`, `create_git_branch`, `list_workspace_files`.
