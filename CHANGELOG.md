# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Changed
- Composer drag-and-drop now inserts dropped non-image file/folder paths into the draft text while still attaching dropped images to message context.
- Composer now surfaces queue vs steer behavior while an agent is processing: send button shows `Steer`/`Queue` only for explicit `Send`/`Queue` modes, and steer mode includes an inline `Tab`-to-queue hint.
- Codex parity guardrails now explicitly allow `src/styles/composer.css` so fork-specific composer UX clarity updates do not fail upstream style parity checks.
- Cursor CLI output format default is now `stream-json` (backend + settings fallback defaults) instead of `text` for new/legacy settings without an explicit Cursor format.
- Release `latest.json` generation now points updater asset URLs at `N3RDMJ/Agentmonitor` instead of `Dimillian/CodexMonitor`.
- Codex parity guardrails now explicitly allow fork-specific style divergences in `src/styles/sidebar.css` and `src/styles/mobile-setup-wizard.css`, preventing unrelated release PRs from failing parity CI.
- Added a non-terminal agent profile switch flow in Settings: users can select a workspace profile and apply it directly from the UI, with automatic `CLAUDE.md` targeting for Claude Code and `AGENTS.md` targeting for other CLIs.
- Home dashboard title now uses `Agent Monitor` branding instead of `Codex Monitor`.
- Home usage dashboard now supports a CLI filter (`All CLIs`, `Codex`, `Claude Code`, `Gemini CLI`, `Cursor CLI`) and refreshes metrics for the selected CLI scope.
- Local usage backend snapshot command now accepts an optional CLI filter and classifies usage by model family so dashboard metrics can be scoped to a selected CLI.
- Renamed remaining app metadata and release surfaces from `gemini-monitor`/`GeminiMonitor` to `agent-monitor`/`Agent Monitor` (npm package, Cargo package/lib, updater endpoint, docs, and DMG workflow artifact/app naming).
- Restored upstream CodexMonitor layout primitives and shell surfaces (`Sidebar`, `Home`, design-system modal/panel/popover/toast primitives, DS token imports) to recover visual/interaction parity for Codex paths.
- Restored upstream modular settings architecture (`SettingsNav` + section components) and re-applied active-CLI backend mapping through `cliBackend` utilities so Codex UI remains upstream-parity while Claude/Gemini/Cursor settings persist correctly.
- Reintroduced upstream Orbit/remote backend settings/invoke surfaces and default app-setting fields (`remoteBackendProvider`, Orbit URLs/runner/auth fields, Tailscale wrappers) to avoid feature regressions during parity restoration.
- Normalized settings tests to upstream Codex display copy (`Show remaining Codex limits`) and resolved the remaining hook dependency lint warning in `SettingsView`.
- Refreshed `README.md` screenshots with current captures from the running app shell and CLI Backend settings screen.
- Synced the app visual style layer with upstream CodexMonitor for transparency/glass and panel appearance parity (macOS glass-first behavior with existing platform-specific window config).
- Updated user-facing naming across app UI and docs to use `Agent` terminology instead of `Codex` where possible.
- Updated website/docs links and branding copy to point to the current `N3RDMJ/Agentmonitor` repository.
- Kept internal command/protocol identifiers stable (`codex_*`, `"codex"` tab key, and related IPC names) to avoid backend/frontend compatibility regressions during the transition.
- Settings now persist the default executable path/args to the active CLI backend fields (`gemini*`, `cursor*`, `claude*`, or `codex*`) instead of always writing `codex*`.
- Workspace session and clone defaults now resolve from the active CLI backend binary instead of being hardcoded to Codex.
- `codex_doctor` now resolves fallback binary/args from the active CLI backend so Claude/Cursor/Gemini doctor checks use the selected tool defaults.
- Workspace-level binary overrides are now stored per CLI backend (`codexBin`, `geminiBin`, `cursorBin`, `claudeBin`) and session spawn resolves the override for the active CLI instead of a single shared `codex_bin`.
- Restored Rust build health for full `cargo check` by fixing crate entry references and aligning the legacy daemon bin with the maintained daemon implementation.
- Added neutral workspace CLI override command surface (`update_workspace_cli_bin`) while keeping `update_workspace_codex_bin` as a compatibility alias.
- Doctor responses now include neutral CLI metadata (`cliType`, `cliBin`) while preserving existing `codexBin` fields for compatibility, and app-server failure details now reference the active/resolved CLI command.
- Switching Active CLI in settings now refreshes workspace binary override drafts to the selected CLI’s stored value (so Claude/Codex overrides don’t leak into each other in the input draft).
- Added neutral frontend doctor wrapper (`runAgentDoctor`) and migrated settings hook usage to it, while keeping `runCodexDoctor` as a compatibility alias.
- Removed remaining `cargo check` unused-variable warnings from Tauri run/window event closures.
- Renamed settings doctor prop/type surfaces to neutral agent naming (`onRunAgentDoctor`, `AgentDoctorResult`) while preserving `CodexDoctorResult` as a compatibility alias.
- Workspace home/args overrides are now CLI-specific (`codex*`, `gemini*`, `cursor*`, `claude*`) for active-CLI session resolution, with legacy fallback to `codexHome/codexArgs` for backward compatibility.
- Added first-class Playwright project wiring (`playwright.config.ts`, `npm run e2e`) for browser-based frontend smoke validation.
- Added a Codex upstream parity CI guardrail (`npm run check:codex-parity`) to fail PRs when tracked Codex visual paths diverge from upstream.
- Restored the shared Codex Rust core (`src-tauri/src/codex/*` and `src-tauri/src/shared/codex_core.rs`) to upstream parity and reintroduced `codex_aux_core` wiring needed by upstream Codex command flows.
- Extracted Settings CLI backend mapping logic into `src/features/settings/utils/cliBackend.ts` so multi-model behavior is isolated from the Settings view component for parity-oriented refactors.

### Added
- Added backend `agent_profiles_list` and `agent_profile_apply` command surfaces (app + daemon + shared core) to discover `profiles/*` entries and apply profile files with symlink-first auto fallback to copy mode.
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
- Added Codex-focused Playwright golden coverage for default Codex CLI persistence and workspace Codex override persistence.
- Added focused unit tests for settings CLI backend mapping utilities in `src/features/settings/utils/cliBackend.test.ts`.
