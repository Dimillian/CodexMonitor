# Mistakes

## Entry Template

## YYYY-MM-DD HH:mm
Context: <task or feature>
Type: mistake
Event: <what happened>
Action: <what changed / fix applied>
Rule: <one-line future behavior>
Root cause: <why it happened>
Fix applied: <what was changed>
Prevention rule: <how to avoid recurrence>

## 2026-02-07 10:51
Context: Settings modal migration to `ModalShell`
Type: mistake
Event: Settings window stopped centering after switching to DS modal shell.
Action: Removed `position` and `z-index` from `.settings-window` to let `.ds-modal-card` own centering.
Rule: Avoid redefining primitive-owned positioning styles in migrated feature shell classes.
Root cause: `.settings-window { position: relative; }` overrode `.ds-modal-card` absolute centering because `settings.css` loads after `ds-modal.css`.
Fix applied: Removed `position` and `z-index` from `.settings-window` so DS card positioning controls centering.
Prevention rule: When migrating existing shell classes onto DS primitives, avoid redeclaring layout-positioning properties (`position/top/left/transform`) already owned by the primitive.

## 2026-02-07 16:58
Context: Codex utility dedup refactor (`src-tauri/src/codex/mod.rs`)
Type: mistake
Event: A bulk file rewrite command truncated `codex/mod.rs` during refactor, temporarily dropping unrelated command handlers.
Action: Restored file from `HEAD` immediately and reapplied refactor using targeted replacements/patches only.
Rule: For large Rust modules, avoid full-file/head-tail rewrites unless line boundaries are verified; prefer function-scoped `apply_patch` edits.
Root cause: Used brittle line-count/head-tail rewrite workflow while file contents were changing.
Fix applied: Recovered from git snapshot and switched to explicit function-level patching.
Prevention rule: Use patch hunks anchored on function signatures for high-churn files and verify file length/function inventory after each structural edit.

## 2026-02-07 18:52
Context: Orbit sign-in Settings test stability
Type: mistake
Event: Initial Orbit sign-in test used fake timers with async polling and left the suite vulnerable to timer-state bleed/timeouts.
Action: Reworked the test to use an injected Orbit client prop with deterministic mocked responses and real timer waits.
Rule: For UI flows with delayed async polling, prefer dependency injection + deterministic mocks over fake timer orchestration unless timer control is strictly required.
Root cause: The test depended on module-level service references and fake timer scheduling that conflicted with React async update timing.
Fix applied: Added `orbitServiceClient` prop to `SettingsView`, switched test to pass explicit mock client, and removed fake timer manipulation.
Prevention rule: Keep side-effect service dependencies injectable for settings workflows so tests can validate behavior without global spies/timer hacks.

## 2026-02-07 19:08
Context: Orbit runner startup + settings token sync
Type: mistake
Event: Orbit runner startup resolved the wrong daemon binary name and Orbit auth actions updated backend token state without syncing `appSettings`, allowing stale token overwrite on later settings saves.
Action: Updated runner binary resolution to prioritize `codex_monitor_daemon` naming and added explicit token sync (`onUpdateAppSettings`) after Orbit sign-in authorization and sign-out.
Rule: For process launches and out-of-band settings mutations, keep UI state synchronized with backend writes and verify binary naming against packaged targets.
Root cause: Assumed hyphenated daemon executable naming and relied on draft-only token updates after backend-side token mutation.
Fix applied: Added candidate lookup for underscored daemon binary (with compatibility fallback) and implemented `syncRemoteBackendToken` in `SettingsView` plus regression tests.
Prevention rule: Validate executable names against real build outputs and treat auth token changes as persisted settings updates, not UI-only draft changes.

## 2026-02-07 19:21
Context: Orbit token sync follow-up regression
Type: mistake
Event: Token sync fix used stale `appSettings` snapshot during async sign-in polling, and URL token guard matched substring `token=` instead of exact query key.
Action: Switched token sync merge source to a live settings ref and changed URL query-key detection to exact parameter-name matching with fragment-safe append behavior.
Rule: Async settings writes must merge against latest state references, and query-parameter guards must match exact keys.
Root cause: Closure-captured props were reused after user edits, and string containment check was too loose for query parsing.
Fix applied: Added `latestSettingsRef`-based merge in `SettingsView`, plus exact query key parsing in `append_query` and expanded Orbit URL unit tests.
Prevention rule: For async UI flows, avoid merging with captured props; for URL query logic, parse keys explicitly instead of substring scans.

## 2026-02-07 19:39
Context: Orbit auth hardening follow-up (backend + shared URL/error helpers)
Type: mistake
Event: Orbit error-body truncation could panic on UTF-8 boundaries, websocket token query values were appended without URL encoding, and Orbit token persistence in app/daemon poll paths could overwrite newer settings snapshots.
Action: Made error excerpt truncation UTF-8-boundary safe, percent-encoded appended query components, and introduced shared `update_remote_backend_token_core` to persist token updates from latest settings state in both app and daemon.
Rule: For shared auth/network helpers, avoid raw byte string slicing and raw query interpolation, and persist token mutations through latest-state merge helpers rather than stale snapshots.
Root cause: Manual string slicing/interpolation shortcuts and copy-pasted token persistence logic between adapters.
Fix applied: Updated `shared/orbit_core.rs` and `shared/settings_core.rs`, then rewired `orbit/mod.rs` and daemon Orbit handlers to call the shared token updater.
Prevention rule: Keep app/daemon settings mutation logic centralized in shared core APIs and require edge-case tests for UTF-8 and reserved query characters.

## 2026-02-07 19:50
Context: Remote backend provider switch behavior
Type: mistake
Event: Switching remote provider in settings updated persisted config but left the in-memory remote transport cache active, so traffic continued over the old transport until restart/disconnect.
Action: Added transport-change detection in app settings update flow and clear `state.remote_backend` when transport-affecting fields change.
Rule: Any settings update that changes remote transport config must invalidate the cached remote backend client immediately.
Root cause: Remote client cache lifecycle was only tied to disconnect/errors, not to transport settings mutations.
Fix applied: Updated `src-tauri/src/settings/mod.rs` to compare previous vs updated transport settings and reset cached remote backend when they differ; added predicate unit tests.
Prevention rule: Treat transport-config settings as cache keys and invalidate on change at the backend boundary, not only from UI handlers.
