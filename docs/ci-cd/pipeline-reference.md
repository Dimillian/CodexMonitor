# CI Pipeline Reference

Primary workflow: `.github/workflows/ci.yml`

## Stages

1. `lint`
2. `typecheck`
3. `test-js`
4. `coverage-js`
5. `e2e-smoke`
6. `security-scans`
7. `test-tauri`
8. `build-tauri`

## Contract

1. `build-tauri` depends on all prior quality/security/test jobs.
2. CI failures block merge to `main`.
3. Workflow edits must update this file in the same PR.

## Doc Drift Gate

CI runs a doc drift check script to ensure documentation changes accompany critical code/workflow changes.

