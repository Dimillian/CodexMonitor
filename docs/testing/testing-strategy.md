# Testing Strategy

## Test Layers

1. Unit/integration (Vitest): `npm run test`
2. Coverage gate: `npm run test:coverage:gate`
3. E2E smoke (Playwright): `npm run test:e2e:smoke`
4. Rust checks/tests: `cd src-tauri && cargo check` and CI `cargo test`

## Change-to-Test Rules

1. Frontend behavior/state/hooks/components: run `npm run test`.
2. IPC/service contracts (`src/services/tauri.ts`): run `npm run test` and update related tests.
3. Rust backend logic (`src-tauri/src/**`): run `cargo check`; run targeted tests when available.
4. E2E flow changes (`e2e/**`): run `npm run test:e2e:smoke`.

## CI Quality Gates

1. Lint
2. Typecheck
3. JS tests
4. Coverage gate
5. E2E smoke
6. Security scans
7. Rust tests
8. Tauri debug build

