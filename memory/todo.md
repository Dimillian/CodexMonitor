# TODO

## Open
- [ ] 2026-02-07: Ship mobile remote-mode foundation: Cloudflare bridge (Worker + Durable Object + auth), daemon/local command parity for remote routing, and iOS-safe backend gating/stubs.

## Done
- [x] 2026-02-07: Restored Sentry frontend reporting removed in `83a37da` (`@sentry/react`, `Sentry.init`, captureException callsites, and metrics instrumentation).
- [x] Complete phase-2 design-system migration cleanup for targeted families (modals, toasts, panel shells, diff theme defaults).
- [x] Add lint/codemod automation for DS primitive adoption (`modal-shell`, `panel-shell`, `toast-shell`) as defined in `docs/design-system-migration-plan.md`.
- [x] Run manual visual parity QA checklist for migrated modal/toast/panel/diff families and delete remaining unreferenced legacy selectors.
