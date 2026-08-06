# CodexMonitor Localization

Live-state guide for the app's localization (i18n) implementation and workflow.

## Architecture

- **Stack**: `i18next` 24.x + `react-i18next` 15.x, automatic language detection with manual override.
- **Namespaces**: 21 — `common`, `sidebar`, `home`, `header`, `settings`, `threads`, `about`, `errors`, `composer`, `git`, `workspaces`, `layout`, `app`, `plan`, `prompts`, `terminal`, `update`, `mobile`, `debug`, `files`, `messages`.
- **Locales**: `en` and `zh-CN`, fully isomorphic (every key exists in both).
- **Files**: `src/i18n/locales/$LANG/$NAMESPACE.json`.
- **Language switching**: auto-detect on startup; user can override in **Settings → Display & Sound → Language**. The choice is persisted in `AppSettings` and applied via `i18n.changeLanguage()`.

## Plural rules

i18next v24 runs the v4 plural rules by default (no `compatibilityJSON`). Any key using `{{count}}` must ship explicit `_one` and `_other` variants:

- English differs in form: `countMatches: "{{count}} match"`, `countMatches_one: "{{count}} match"`, `countMatches_other: "{{count}} matches"`.
- zh-CN uses identical values for `_one` and `_other` (single/plural not distinguished in Chinese).
- Legacy `_plural`-suffixed keys are v3-rule dead code and must not be added. Existing ones have been migrated to `_one`/`_other`.

## Extraction workflow

- Command: `npm run extract:i18n` — note the bin name is `i18next`, **not** `i18next-parser`.
- Config: `i18next-parser.config.cjs`:
  - `sort: false` (preserve hand-maintained key order)
  - `pluralSeparator: false` (no legacy `_plural` keys)
  - `keepRemoved: true` (keys removed from code are not auto-deleted)
  - `namespaceSeparator: ":"`, `locales: ["en", "zh-CN"]`, `output: "src/i18n/locales/$LOCALE/$NAMESPACE.json"`
  - input `src/**/*.{ts,tsx}`, excluding `*.test.*` / `*.spec.*`

### After every extraction run

1. **Delete false positives**: the parser misreads the local variables `optionKeyLabel` / `metaKeyLabel` in `src/features/settings/hooks/useSettingsViewOrchestration.ts` as i18n keys and regenerates them as empty keys in the `settings` namespace. Remove them from **both** `en/settings.json` and `zh-CN/settings.json`.
2. **Verify parity**: `npm run test -- src/i18n` — 31 tests (21 namespace parity checks + 10 behavior tests). This fails if en/zh drift.
3. **Review the diff**: a normal extraction is idempotent after the initial normalization; unexpected large diffs mean something else changed.

## File format conventions

- Locale files are hand-maintained JSON: 2-space indent, BOM-less UTF-8.
- Do **not** write these files with PowerShell `Set-Content -Encoding UTF8` (PowerShell 5.1 writes a BOM, which breaks parser round-trips). Use UTF-8 without BOM (node `fs.writeFileSync(..., "utf8")` or the edit tool).
- The parser output style differs from the hand-maintained style; after the initial normalization the extraction is idempotent — do not mix styles by hand.

## Module-scope translation ban

Constants or module top-level code must **not** call `i18n.t()`: the value is evaluated once at module load and frozen in the current language, so switching languages re-renders consumers without updating these labels. Keep translation keys in constants and render through `t()` from `useTranslation` inside components (see the `labelKey`/`noteKey` pattern in `src/features/settings/components/settingsViewConstants.ts`).

## Known limitations

- **Rust side**: native tray/menu text is generated at startup from the current language; `handle_menu_event` has no language-switch event, so changing the language requires an app restart to take effect.
- `i18next-parser@9.0.2` is deprecated upstream in favor of `i18next-cli`; it still works and a migration is planned.

## Verification

- `npm run test -- src/i18n` — 31 tests (parity + behavior).
- `npm run test` — full suite.
- `npm run typecheck`.
