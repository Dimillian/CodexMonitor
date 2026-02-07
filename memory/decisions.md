# Decisions

## Entry Template

## YYYY-MM-DD HH:mm
Context: <task or feature>
Type: decision | mistake | preference | todo
Event: <what happened>
Action: <what changed / fix applied>
Rule: <one-line future behavior>

## 2026-02-07 08:36
Context: Design-system migration phase 1 (modals/toasts/panels/diff)
Type: decision
Event: Added additive design-system primitives (`ModalShell`, `ToastViewport`/`ToastCard`, `PanelFrame`/`PanelHeader`) and DS token alias styles with backward-compatible legacy class usage.
Action: Migrated target families to use primitives without removing existing class hooks; extracted diff unsafe CSS theme values into a DS module.
Rule: For modal/toast/panel shell changes, use DS primitives first and keep legacy classes as compatibility aliases until phase-2 cleanup is complete.

## 2026-02-07 08:51
Context: Design-system migration phase 2 cleanup (modals/toasts/panels/diff)
Type: decision
Event: Removed targeted legacy shell class wiring and consolidated duplicated shell chrome into DS styles (`ds-modal`, `ds-toast`, `ds-panel`) while keeping feature classes for content/layout only.
Action: Prompt modals now use `ModalShell` without per-modal backdrop/card selectors, toasts share DS card chrome/animation/tokens, panel shell layout moved into `PanelFrame` styles, and diff theme defaults are sourced from DS tokens with theme-specific overrides in `ds-diff.css`.
Rule: New or refactored modal/toast/panel code must extend DS primitives/tokens first and only keep feature selectors for non-shared behavior.

## 2026-02-07 09:48
Context: Design-system migration hardening (toast semantics + modal shell consistency)
Type: decision
Event: Decoupled DS toast styling from feature class names and migrated settings modal to `ModalShell`.
Action: Added `ToastTitle`/`ToastBody` primitives with DS-owned classes, tightened toast role typing to `AriaRole`, updated migrated toasts to use semantic primitives, and switched `SettingsView` to `ModalShell` via `cardClassName`.
Rule: DS primitives must own shared semantic classes and shell composition; feature components should only add feature-local classes/behavior.

## 2026-02-07 10:48
Context: Accessibility hardening for DS modal/panel primitives
Type: decision
Event: Added explicit tab semantics/keyboard navigation to `PanelTabs` and exposed modal labelling props on `ModalShell`.
Action: `PanelTabs` now uses `role="tab"` + `aria-selected` + roving `tabIndex` with arrow/home/end navigation; `ModalShell` now accepts `ariaLabel`/`ariaLabelledBy`/`ariaDescribedBy` and consumers pass labels (including `SettingsView` via `ariaLabelledBy`).
Rule: New modal consumers must provide an accessible label via `ModalShell`, and tablist UIs should use proper tab semantics instead of `aria-current`.

## 2026-02-07 10:58
Context: Design-system migration phase 2 completion for toasts
Type: decision
Event: Added shared toast sub-primitives for repeated header/action/error patterns and migrated approval/error/update toast families to use them.
Action: Introduced `ToastHeader`, `ToastActions`, and `ToastError` in DS primitives, moved shared styles into `ds-toast.css`, and reduced feature toast CSS to family-specific positioning/content rules.
Rule: Toast family updates must use DS toast sub-primitives for shared structure/patterns and keep feature styles focused on family-specific behavior only.

## 2026-02-07 11:11
Context: Design-system migration phase 3 guardrails
Type: decision
Event: Implemented lint guardrails and codemod automation for modal/toast/panel/diff DS adoption.
Action: Added targeted `no-restricted-syntax` checks in `.eslintrc.cjs`, created codemods (`modal-shell`, `panel-shell`, `toast-shell`) with dry-run/allowlist support, and wired package scripts (`codemod:ds:dry`, `codemod:ds`, `lint:ds`).
Rule: DS migration follow-ups should first run `npm run codemod:ds:dry` and keep DS guardrail lint rules green before merging UI shell changes.

## 2026-02-07 11:15
Context: Design-system migration phase 3 legacy selector cleanup
Type: decision
Event: Manual QA sign-off was completed and the remaining unreferenced legacy selectors were removed.
Action: Deleted dead selectors from `src/styles/diff.css` (`git-panel-title`, `git-panel-title-button`, `git-panel-switch-icon`, `git-panel-icon`, `git-pr-branches`) and revalidated with lint/typecheck/tests.
Rule: After DS migration QA sign-off, remove only selectors with verified zero callsites and rerun full validation.

## 2026-02-07 11:26
Context: AGENTS.md design-system guidance refresh
Type: decision
Event: Updated AGENTS design-system guidance to match the final implementation state after Phase 3.
Action: Documented toast/panel sub-primitives, Phase 3 guardrail/codemod workflow, and current migration status in `AGENTS.md`.
Rule: Keep `AGENTS.md` DS guidance aligned with the latest enforced primitives/scripts and migration state after each DS phase change.

## 2026-02-07 11:22
Context: PanelTabs keyboard navigation reliability
Type: decision
Event: Arrow/Home/End keyboard navigation in `PanelTabs` could stall because selection changed without moving focus.
Action: Navigation now derives from the active tab index and programmatically focuses the newly selected tab; added `PanelTabs.test.tsx` coverage for focus + selection progression.
Rule: Tab keyboard navigation must always move both selection state and DOM focus together.

## 2026-02-07 11:27
Context: AGENTS canonical style
Type: preference
Event: User requested removing phase-progress wording from `AGENTS.md` so it stays canonical and current-state only.
Action: Removed phase-specific wording from the design-system enforcement section title.
Rule: Keep `AGENTS.md` free of phase labels/progress framing; document canonical behavior and workflow only.

## 2026-02-07 11:37
Context: Design-system popover standardization
Type: preference
Event: User requested all app popovers use one consistent pattern with iconized precomputed menu entries and Escape/outside-click dismissal behavior.
Action: Added DS popover primitives/styles and migrated popover/dropdown callsites (branch/worktree menus, sidebar add/sort/account menus, launch script, open-app menus, workspace-home run mode/models, composer suggestions, file preview) to use shared shell semantics and dismiss behavior.
Rule: New popover/dropdown UI should use DS popover primitives, include leading icons for precomputed action lists, and close on Escape/outside click unless explicitly exempted.

## 2026-02-07 11:40
Context: AGENTS canonical DS documentation update
Type: decision
Event: Canonical design-system guidance needed to include popover primitives and style sources after popover migration.
Action: Updated `AGENTS.md` design-system section to list `PopoverPrimitives.tsx`, `PopoverSurface`/`PopoverMenuItem`, and `ds-popover.css` plus popover-specific do/don't guidance.
Rule: Keep AGENTS design-system inventory aligned with currently implemented DS primitives and styles, without claiming guardrails that are not implemented.

## 2026-02-07 11:42
Context: Popover design-system regression guardrails
Type: decision
Event: Added lint enforcement to prevent regressions back to raw popover shell/menu-row markup in migrated files.
Action: Added `.eslintrc.cjs` popover override covering migrated popover components, requiring `PopoverSurface`/`PopoverMenuItem` patterns and keeping DS token color-literal restrictions in scope.
Rule: Popover changes in guarded files must keep DS primitive markup and pass lint before merge.

## 2026-02-07 12:03
Context: Frontend telemetry regression restoration
Type: preference
Event: User requested full restoration of Sentry reporting removed in `83a37da`.
Action: Reintroduced `@sentry/react`, restored `Sentry.init` in `src/main.tsx`, and re-enabled removed capture/metrics callsites in app/workspace/thread/file-link flows.
Rule: Keep Sentry telemetry enabled unless the user explicitly asks to deprecate or replace it with another telemetry provider.

## 2026-02-07 12:17
Context: Duplicate telemetry prevention for New Agent creation
Type: decision
Event: New Agent creation could be triggered twice for `Cmd+N` because both a web keydown hook and native menu accelerator path were active.
Action: Removed `useNewAgentShortcut` from `useWorkspaceActions` so New Agent creation flows through a single menu/command path (`useAppMenuEvents` + configured menu accelerators), and added focused Composer tests to assert one send call for Enter and send-button triggers.
Rule: For accelerator-backed actions, keep a single trigger path to avoid double action execution and duplicate telemetry.

## 2026-02-07 12:27
Context: Windows updater 404 from release metadata
Type: decision
Event: Published `latest.json` referenced asset names that did not match uploaded release asset filenames, causing updater download 404s.
Action: Updated `.github/workflows/release.yml` to normalize artifact filenames before publish, URL-encode generated `latest.json` URLs, and validate that every `latest.json` URL maps to an actual artifact before creating the release.
Rule: Generate `latest.json` URLs from normalized artifact filenames and fail the release job if any referenced asset is missing.

## 2026-02-07 13:26
Context: Mobile remote architecture direction
Type: preference
Event: User chose Cloudflare as the bridge for mobile-to-desktop remote backend connectivity and questioned duplicating backend logic in-app.
Action: Adopted plan direction toward a Cloudflare bridge layer (realtime transport + durable queue/snapshots) while keeping daemon/core logic as the execution authority on desktop.
Rule: Mobile remote mode should connect through a Cloudflare bridge to the desktop daemon, not a duplicated backend implementation on-device.

## 2026-02-07 13:26
Context: Remote-mode implementation strategy
Type: decision
Event: Command/event parity analysis showed major mismatch between local Tauri commands and daemon RPC coverage.
Action: Established parity-first roadmap: complete daemon RPC surface and remote adapter routing before shipping mobile remote mode.
Rule: Remote/mobile rollouts must gate on command/event parity with local mode for user-facing features.

## 2026-02-07 13:31
Context: Mobile bridge implementation direction
Type: preference
Event: User explicitly requested to ignore PR #31 and CloudKit for mobile architecture planning.
Action: Canonical mobile plan now targets Cloudflare bridge only, with no dependency on CloudKit or PR #31 implementation details.
Rule: Do not propose CloudKit/PR31-based mobile backend patterns unless user re-requests them.
