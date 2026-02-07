# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Changed
- Synced the app visual style layer with upstream CodexMonitor for transparency/glass and panel appearance parity (macOS glass-first behavior with existing platform-specific window config).
- Updated user-facing naming across app UI and docs to use `Agent` terminology instead of `Codex` where possible.
- Updated website/docs links and branding copy to point to the current `N3RDMJ/Agentmonitor` repository.
- Kept internal command/protocol identifiers stable (`codex_*`, `"codex"` tab key, and related IPC names) to avoid backend/frontend compatibility regressions during the transition.
- Settings now persist the default executable path/args to the active CLI backend fields (`gemini*`, `cursor*`, `claude*`, or `codex*`) instead of always writing `codex*`.
- Workspace session and clone defaults now resolve from the active CLI backend binary instead of being hardcoded to Codex.
- `codex_doctor` now resolves fallback binary/args from the active CLI backend so Claude/Cursor/Gemini doctor checks use the selected tool defaults.
- Workspace-level binary overrides are now stored per CLI backend (`codexBin`, `geminiBin`, `cursorBin`, `claudeBin`) and session spawn resolves the override for the active CLI instead of a single shared `codex_bin`.
- Restored Rust build health for full `cargo check` by fixing crate entry references (`gemini_monitor_lib`) and aligning the legacy `gemini_monitor_daemon` bin with the maintained daemon implementation.
- Added neutral workspace CLI override command surface (`update_workspace_cli_bin`) while keeping `update_workspace_codex_bin` as a compatibility alias.
- Doctor responses now include neutral CLI metadata (`cliType`, `cliBin`) while preserving existing `codexBin` fields for compatibility, and app-server failure details now reference the active/resolved CLI command.
- Switching Active CLI in settings now refreshes workspace binary override drafts to the selected CLI’s stored value (so Claude/Codex overrides don’t leak into each other in the input draft).
- Added neutral frontend doctor wrapper (`runAgentDoctor`) and migrated settings hook usage to it, while keeping `runCodexDoctor` as a compatibility alias.
- Removed remaining `cargo check` unused-variable warnings from Tauri run/window event closures.
- Renamed settings doctor prop/type surfaces to neutral agent naming (`onRunAgentDoctor`, `AgentDoctorResult`) while preserving `CodexDoctorResult` as a compatibility alias.
- Workspace home/args overrides are now CLI-specific (`codex*`, `gemini*`, `cursor*`, `claude*`) for active-CLI session resolution, with legacy fallback to `codexHome/codexArgs` for backward compatibility.
- Added first-class Playwright project wiring (`playwright.config.ts`, `npm run e2e`) for browser-based frontend smoke validation.

### Added
- Added this root-level changelog to track ongoing work in canonical form.
- Added backend tests for active-CLI argument and binary resolution, plus frontend coverage for Claude Code CLI settings persistence.
- Added backend coverage for active-CLI doctor default resolution and frontend coverage for Claude-mode doctor invocation.
- Added backend tests for workspace active-CLI binary resolution and frontend coverage for Claude workspace binary override display/update paths.
- Added frontend service/hook tests for the `update_workspace_cli_bin` command and backward-compatible alias behavior.
- Added backend tests for CLI-specific doctor failure detail formatting and frontend regression coverage for Active CLI switching of workspace override drafts.
- Added frontend service tests for `runAgentDoctor` and compatibility coverage for `runCodexDoctor` alias behavior.
- Added backend coverage for active-CLI workspace args/home resolution and workspace settings serde for new CLI-specific home/args fields.
- Added frontend settings coverage for Claude-specific workspace args/home override updates.
- Added Playwright smoke coverage for opening Settings and verifying the CLI Backend section with a minimal Tauri runtime mock.
- Added Playwright Claude-focused coverage for persisting default CLI path/args and workspace Claude binary/home/args overrides.
