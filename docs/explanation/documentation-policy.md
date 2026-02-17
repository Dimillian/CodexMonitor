# Documentation Policy

## Definition of Done (Docs)

A change is not done unless required documentation is updated in the same PR.

## Required Update Matrix

| Changed area | Required docs |
| --- | --- |
| `src/**`, `src-tauri/**` behavior/contracts | `docs/codebase-map.md` and relevant domain docs |
| `.github/workflows/**` | `docs/ci-cd/*` |
| `e2e/**` | `docs/testing/*` |
| shared UI behavior (`src/styles/**`, shared UI components) | `docs/ui-ux/*` |

## Freshness SLO

1. Core operational docs (`AGENTS.md`, `docs/ai/agent-contract.md`, `docs/codebase-map.md`) should be touched whenever related contracts change.
2. Governance docs should not drift from CI/workflow reality.

## Merge Gate

CI must pass:

1. `doc-drift` job
2. docs integrity checks
3. code quality/test gates

