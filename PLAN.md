# Windows Support Execution Plan

Source of truth for requirements: `SPEC.md`.
This plan is **live** and tracks what has landed and what remains for the Windows milestone (auto-updater + dictation).

## Workstream

### 1) Docs

- [x] Add `SPEC.md` (Windows scope, updater + dictation required).
- [x] Keep `PLAN.md` current as work lands.

### 2) Git safety + PR

- [x] Push `feature/windows-support` to a fork remote and set upstream to avoid accidental `main` pushes.
- [x] Open a draft PR early so CI runs on every push.

### 3) Windows UX + path correctness

- [x] Make “Reveal in Finder” platform-aware (Explorer on Windows).
- [x] Fix path joining in the frontend so Windows absolute/relative paths behave.
- [x] Make backend `open_workspace_in` work cross-platform (macOS/Windows/Linux).
- [x] Make default “Open in” targets sensible on Windows (Explorer + command-based editors).

### 4) Dictation on Windows (required)

- [x] Enable Whisper dictation on Windows (`whisper-rs` + `cpal`) by removing the Windows stub.
- [x] Update Windows build checks (`doctor:win`) to require LLVM/Clang + CMake.
- [x] Fix `doctor:win` dependency detection on Unix (no shell builtins).

### 5) CI (required)

- [x] Add a Windows CI job that runs a Tauri debug build with `src-tauri/tauri.windows.conf.json`.

### 6) Release + updater (required)

- [x] Enable Windows updater artifacts in `src-tauri/tauri.windows.conf.json`.
- [x] Add a Windows release build job to `.github/workflows/release.yml`.
- [x] Extend `latest.json` generation to include Windows URL + signature.

## Validation (run after each step)

- `npm run lint`
- `npm run test`
- `npm run typecheck`
- Rust checks are executed in CI for macOS + Windows jobs added by this plan.

## Manual checklist (Windows)

- [ ] `npm run tauri:build:win` succeeds on Windows 10/11.
- [ ] App launches and can open workspaces.
- [ ] “Reveal in Explorer” opens the right folder.
- [ ] Auto-updater finds and applies the latest release.
- [ ] Dictation works end-to-end (download → hold-to-talk → transcript).
