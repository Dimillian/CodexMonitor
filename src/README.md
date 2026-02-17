# Frontend Module Guide

Primary frontend stack: React + Vite.

## Boundaries

1. Keep `src/App.tsx` as composition root.
2. Keep Tauri calls in `src/services/tauri.ts`.
3. Keep event fanout in `src/services/events.ts`.

## Local Validation

```bash
npm run typecheck
npm run test
```

## Related Docs

1. `AGENTS.md`
2. `docs/codebase-map.md`
3. `docs/ui-ux/design-system-contract.md`

