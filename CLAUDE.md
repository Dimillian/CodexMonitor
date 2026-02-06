# GeminiMonitor — Claude Code Instructions

Tauri desktop app (React + Vite frontend, Rust backend) for chatting with AI agents across local workspaces.

See @AGENTS.md for full architecture guide.

## Commands

```bash
npm run lint          # ESLint (TS/TSX)
npm run test          # Vitest (unit tests, excludes e2e)
npm run typecheck     # tsc --noEmit
npm run build         # tsc + vite build (frontend only)
npm run tauri:dev     # Full app dev (requires native deps)
npm run tauri:build   # Full app build (requires native deps)
cargo check           # Rust backend (run from src-tauri/)
cargo test            # Rust tests (run from src-tauri/)
```

## Validation Checklist

After any change, run the relevant subset:

1. `npm run lint` — always
2. `npm run typecheck` — always for TS changes
3. `npm run test` — when touching threads, settings, updater, shared utils, services, or hooks
4. `cargo check` in `src-tauri/` — when touching Rust backend code

## Code Style

- TypeScript strict mode is on (`noUnusedLocals`, `noUnusedParameters`)
- Prefix unused params with `_` (enforced by eslint)
- React 19 JSX transform — no `import React` needed
- ES modules only (`"type": "module"` in package.json)
- 2-space indentation

## Architecture Rules

- **Frontend**: components are presentational only (no Tauri IPC). All IPC goes through `src/services/tauri.ts`
- **Backend**: shared domain logic lives in `src-tauri/src/shared/`. App and daemon are thin adapters
- **Events**: use `createEventHub` pattern in `src/services/events.ts`, subscribe via `useTauriEvent`
- **No duplication**: if logic is needed by both app and daemon, it belongs in `src-tauri/src/shared/`

## Testing

- Framework: Vitest with jsdom setup (`src/test/vitest.setup.ts`)
- Tests colocated next to source files as `*.test.ts` / `*.test.tsx`
- E2e tests in `src/test/e2e/` are excluded from `npm run test`
- Tauri APIs are mocked — see existing test files for patterns

## Commit Messages

Follow conventional commits: `feat:`, `fix:`, `perf:`, `chore:`, `refactor:`, `test:`, `docs:`
The release workflow parses these prefixes for changelog generation.
