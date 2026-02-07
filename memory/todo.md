# TODO

## Open
- [ ] 2026-02-07: Implement Orbit-only mobile remote foundation: Orbit transport in `remote_backend`, runner Orbit mode, hosted/self-host settings + pairing UX, and iOS keychain-backed auth storage.
- [ ] 2026-02-07: Harden Orbit WS transport with explicit reconnect/backoff + replay/resync handling for mobile reconnect flows.
- [ ] 2026-02-07: Complete Orbit production readiness gaps after baseline wiring: secure secret storage (Keychain/keyring), LaunchAgent/background runner management, pairing QR/code UX, and app-side Orbit reconnect/resync handling.

## Done
- [x] 2026-02-07: Restored Sentry frontend reporting removed in `83a37da` (`@sentry/react`, `Sentry.init`, captureException callsites, and metrics instrumentation).
- [x] Complete phase-2 design-system migration cleanup for targeted families (modals, toasts, panel shells, diff theme defaults).
- [x] Add lint/codemod automation for DS primitive adoption (`modal-shell`, `panel-shell`, `toast-shell`) as defined in `docs/design-system-migration-plan.md`.
- [x] Run manual visual parity QA checklist for migrated modal/toast/panel/diff families and delete remaining unreferenced legacy selectors.
- [x] 2026-02-07: Replace daemon `local_usage_snapshot` temporary zeroed snapshot implementation with shared real session-log scanner parity.
- [x] 2026-02-07: Extract newly mirrored daemon git/github/prompts/codex utility logic into shared core modules to eliminate remaining app/daemon duplication.
- [x] 2026-02-07: Replace daemon `local_usage_snapshot` temporary implementation by sharing real local usage scanner logic in `shared/local_usage_core.rs`.
- [x] 2026-02-07: Eliminate app/daemon duplication for git/github/prompt/codex utility behavior via shared cores (`git_ui_core`, `prompts_core`, `codex_aux_core`).
- [x] 2026-02-07: Move remaining duplicated workspace-action logic (`add_clone`, `apply_worktree_changes`, `open_workspace_in`, `get_open_app_icon`) into shared core helpers.
- [x] 2026-02-07: Implement Cloudflare WebSocket transport internals behind `remoteBackendProvider=cloudflare` (connect/read/write/pending-response flow) while preserving TCP behavior and callsites.
- [x] 2026-02-07: Migrate remote provider naming/settings from Cloudflare-specific keys to Orbit (`orbit` provider + `orbit*` settings).
- [x] 2026-02-07: Remove unreleased Cloudflare backward-compat aliases and backport tests to keep Orbit implementation canonical-only.
