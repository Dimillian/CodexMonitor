# How-To: Add Backend Command with App/Daemon Parity

## Steps

1. Implement domain behavior in `src-tauri/src/shared/*`.
2. Wire app command in `src-tauri/src/lib.rs` and adapter module.
3. Update frontend IPC in `src/services/tauri.ts`.
4. Update daemon RPC in `src-tauri/src/bin/codex_monitor_daemon/rpc.rs` and relevant `rpc/*`.
5. Update `docs/codebase-map.md` if navigation/contracts changed.
6. Run validation:

```bash
npm run typecheck
npm run test
cd src-tauri && cargo check
```

