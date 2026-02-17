# Tauri Backend Module Guide

Primary backend stack: Rust + Tauri.

## Boundaries

1. Put shared logic in `src/shared/*` first.
2. Keep app and daemon as thin adapters.
3. Keep JSON-RPC/IPC contract parity across app and daemon surfaces.

## Local Validation

```bash
cd src-tauri && cargo check
```

## Related Docs

1. `AGENTS.md`
2. `docs/codebase-map.md`
3. `docs/debug/logging-and-troubleshooting.md`

