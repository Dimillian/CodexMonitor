# E2E Smoke Runbook

## Purpose

Validate critical user path with a fast Playwright smoke test.

## Commands

```bash
npm run test:e2e:install
npm run test:e2e:smoke
```

## Location

- Test file: `e2e/smoke.spec.ts`

## Failure Handling

1. Re-run locally with Playwright trace/report.
2. Verify environment setup from `README.md` requirements.
3. Check recent UI shell changes and startup sequence changes.
4. Keep smoke test stable and focused on critical path only.

