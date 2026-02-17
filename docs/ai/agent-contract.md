# AI Agent Contract (Canonical)

This is the single source of truth for AI coding agents in this repository.

## Scope

Applies to CodexMonitor primary codebase only.

## Execution Contract

1. Read `AGENTS.md` first, then this file.
2. Keep backend behavior in shared core first: `src-tauri/src/shared/*`.
3. Keep app/daemon parity for cross-runtime backend behavior.
4. Keep frontend Tauri IPC in `src/services/tauri.ts` only.
5. Keep event fanout in `src/services/events.ts` only.

## Change Contract

If you change one of these areas, update docs in the same PR:

| Change area | Required doc updates |
| --- | --- |
| `src/**` or `src-tauri/**` behavior/contract | `docs/codebase-map.md` and relevant domain docs |
| `.github/workflows/**` | `docs/ci-cd/pipeline-reference.md` or `docs/ci-cd/release-runbook.md` |
| `e2e/**` | `docs/testing/e2e-smoke-runbook.md` |
| `src/styles/**` or shared UI shell patterns | `docs/ui-ux/design-system-contract.md` |

## Validation Contract

Minimum validation after changes:

1. `npm run typecheck`
2. Frontend behavior changes: `npm run test`
3. Rust changes: `cd src-tauri && cargo check`
4. E2E changes: `npm run test:e2e:smoke`

## Documentation Freshness

1. No stale instructions that conflict with live behavior.
2. If command surfaces change, docs must be updated in the same PR.
3. If docs cannot be updated immediately, block merge.

