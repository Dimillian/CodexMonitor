# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CodexMonitor is a macOS/Linux Tauri desktop app that orchestrates multiple AI agents (Codex and Claude) across local workspaces. The frontend is React 19 + TypeScript + Vite; the backend is Rust (Tauri 2) that spawns agent processes per workspace and streams JSON-RPC events.

## Commands

```bash
# Development
npm install              # Install dependencies
npm run tauri:dev        # Start dev app (runs doctor + Tauri)
npm run dev              # Vite dev server only (localhost:1420)

# Validation (run before committing)
npm run lint             # ESLint check
npm run typecheck        # TypeScript check (no emit)

# Build
npm run tauri:build      # Production bundle (DMG on macOS)
npm run build:appimage   # Linux AppImage

# Troubleshooting
npm run doctor           # Validate environment (CMake, etc.)
npm run doctor:strict    # Fail on missing dependencies

# Claude Bridge (src-nodejs/)
cd src-nodejs
npm install              # Install bridge dependencies
npm run build            # Compile TypeScript to dist/
npm run typecheck        # TypeScript check (no emit)
npm run dev              # Run bridge with tsx (development)
npm run start            # Run compiled bridge
```

## Architecture

**Frontend (`src/`):**
- Feature-sliced architecture in `src/features/` - each feature has `components/`, `hooks/`, and optionally `utils/`
- Components are presentational only (props in, UI out) - no Tauri IPC calls
- Hooks own state, effects, and event wiring
- All Tauri IPC goes through `src/services/tauri.ts`
- Shared types in `src/types.ts`
- CSS organized by area in `src/styles/`

**Backend (`src-tauri/`):**
- `lib.rs` - Tauri commands and app-server client
- `git.rs` - Git operations via libgit2 + `gh` CLI for GitHub issues
- `codex.rs` - Codex app-server JSON-RPC protocol
- `settings.rs` - App settings persistence
- `dictation.rs` - Whisper speech-to-text
- `backend/provider.rs` - AgentProvider trait for multi-backend support
- `backend/codex_provider.rs` - Codex provider implementation

**Claude Bridge (`src-nodejs/`):**
- Node.js bridge translating Claude Agent SDK to Codex-compatible JSON-RPC
- `src/index.ts` - Main entry point, registers JSON-RPC handlers
- `src/rpc.ts` - JSON-RPC stdio server implementation
- `src/claude-session.ts` - Claude SDK session management and event translation
- `src/types.ts` - TypeScript type definitions

**Provider Abstraction:**
- `AgentProvider` trait in Rust enables multiple backends (Codex, Claude)
- `ProviderType` enum in workspace settings selects which backend to use
- Both providers implement same JSON-RPC protocol for frontend compatibility

**App-Server Protocol:**
- Backend spawns `codex app-server` or `claude-bridge` per workspace
- JSON-RPC 2.0 over stdio with `initialize`/`initialized` handshake
- Never send requests before initialization completes

## Key Files

- `src/App.tsx` - Composition root; keep orchestration here
- `src/features/app/hooks/useAppServerEvents.ts` - App-server event handling
- `src/features/threads/hooks/useThreads.ts` - Thread lifecycle
- `src/features/git/hooks/useGitStatus.ts` - Git polling and refresh
- `src/utils/threadItems.ts` - Thread item normalization
- `src-tauri/src/backend/provider.rs` - AgentProvider trait definition
- `src-tauri/src/backend/codex_provider.rs` - Codex provider implementation
- `src-tauri/src/types.rs` - ProviderType enum and workspace settings
- `src-nodejs/src/index.ts` - Claude bridge entry point

## Detailed Guidelines

See **AGENTS.md** for comprehensive architecture guidelines, common change patterns, and the app-server protocol flow.
