# UI/UX Audit Report (2026-02-15, Live)

Scope: `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor-uiux-audit`

Rules:
- `/Users/yuyifeng/.codex/rules/ui-ux-generation.md`
- `/Users/yuyifeng/.codex/rules/tauri-desktop-style.md`

## Findings Count
- hardcoded colors: 154 (`hardcoded-colors.txt`)
- hardcoded colors (non-theme files): 0 (`hardcoded-colors-non-theme.txt`)
- hardcoded colors (theme unique values): 154 (`hardcoded-colors-theme-unique-values.txt`)
- non-scale spacing values: 0 (`non-scale-spacing.txt`)
- non-semantic interactions round2: 0 (`non-semantic-interactions-round2.txt`)
- `outline: none` usages: 0 (`outline-none.txt`)
- inline style usages: 0 (`inline-styles.txt`)
- `!important` usages: 0 (`important-usage.txt`)
- `<button>` containing `<div>`: 0 (`button-div-inside-button.txt`)
- font-size below 14px: 0 (`font-size-below-14px.txt`)
- line-height below 1.5: 0 (`line-height-below-1.5.txt`)
- motion files without reduced-motion guard: 0 (`motion-files-without-reduced-motion-guard.txt`)
- motion > 500ms: 0 (`motion-too-slow-over-500ms.txt`)
- layout-affecting animation: 0 (`layout-affecting-animation.txt`)
- `<img>` missing `srcSet/loading/width/height/sizes`: 0 (`img-missing-attrs.txt`)
- image best-practices coverage candidates: 92 (`image-best-practices-coverage.txt`)
- `srcSet` implementations with `2x` density entries: 20 (`image-srcset-2x-implementation.txt`)
- real static multi-resolution asset pairs: 2 (`AboutView` app icon + OpenApp optimized icon assets)

## Runtime Accessibility Gates
- Lighthouse (2026-02-15 04:12 PST): accessibility score = 1.00 (`lighthouse-home.json`)
- Lighthouse `color-contrast`: pass (`score=1`)
- Lighthouse `select-name`: pass (`score=1`)
- axe CLI:
  - latest successful artifact: `axe-home.json` (`timestamp=2026-02-15T11:57:24.084Z`)
  - rerun at 2026-02-15 04:15 PST timed out with `AXE_TIMEOUT` (timeout-guarded execution)

## Quality Gates
- `npm run lint -- src`: pass (2026-02-15 12:35 PST)
- `npm run typecheck`: pass (2026-02-15 12:35 PST)
- `npm run test -- --run`: pass, 560/560 (2026-02-15 12:35 PST)
- `npm run build`: pass (2026-02-15 12:35 PST)

## Artifacts
- `hardcoded-colors.txt`
- `hardcoded-colors-non-theme.txt`
- `hardcoded-colors-theme-unique-values.txt`
- `hardcoded-colors-theme-unique-count.txt`
- `non-scale-spacing.txt`
- `non-semantic-interactions-round2.txt`
- `outline-none.txt`
- `inline-styles.txt`
- `important-usage.txt`
- `button-div-inside-button.txt`
- `font-size-below-14px.txt`
- `line-height-below-1.5.txt`
- `motion-files-without-reduced-motion-guard.txt`
- `motion-too-slow-over-500ms.txt`
- `layout-affecting-animation.txt`
- `img-missing-attrs.txt`
- `image-best-practices-coverage.txt`
- `image-srcset-2x-implementation.txt`
- `image-srcset-2x-coverage.txt`
