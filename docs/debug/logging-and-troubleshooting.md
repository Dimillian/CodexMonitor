# Logging and Troubleshooting

## Quick Triage Order

1. Reproduce with minimal scope.
2. Check frontend service/event layers:
   - `src/services/tauri.ts`
   - `src/services/events.ts`
3. Check backend adapters:
   - `src-tauri/src/lib.rs`
   - `src-tauri/src/codex/mod.rs`
   - `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
4. Check shared source-of-truth logic in `src-tauri/src/shared/*`.

## Common Validation Commands

```bash
npm run typecheck
npm run test
cd src-tauri && cargo check
```

## Documentation Rule

If logging keys, error mapping, or troubleshooting flow changes, update this document in the same PR.

