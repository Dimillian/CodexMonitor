# Contributing

## Development Setup

```bash
npm install
npm run doctor:strict
npm run tauri:dev
```

## Required Validation

1. `npm run typecheck`
2. `npm run test`
3. Rust changes: `cd src-tauri && cargo check`

## Documentation Policy

When changing behavior, update related docs in the same PR.  
See `docs/ai/agent-contract.md` and `docs/repo-documentation-gap-remediation.md`.

## Pull Request Checklist

1. Scope is focused and minimal.
2. Tests/checks for touched area pass.
3. Related docs are updated.
4. No unrelated refactors.

