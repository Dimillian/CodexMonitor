```
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
```

## CodexMonitor Project Overview

CodexMonitor is a Tauri app for orchestrating multiple Codex agents across local workspaces. It provides a sidebar to manage projects, a home screen for quick actions, and a conversation view backed by the Codex app-server protocol.

## Key Commands

### Development
- `npm install` - Install dependencies
- `npm run tauri:dev` - Run in development mode (with strict checks)
- `npm run tauri:dev:win` - Run in development mode on Windows
- `npm run dev` - Run Vite dev server (frontend only)

### Build
- `npm run tauri:build` - Build production Tauri bundle
- `npm run tauri:build:win` - Build Windows production bundle
- `npm run build:appimage` - Build AppImage bundle
- `npm run build` - Build frontend only

### Testing & Validation
- `npm run test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run typecheck` - Run TypeScript type checking
- `npm run lint` - Run ESLint
- `npm run lint:ds` - Run ESLint on design system files
- `npm run doctor:strict` - Run strict system checks
- `npm run doctor:win` - Run Windows system checks

### Code Modifications
- `npm run codemod:ds` - Run design system codemods
- `npm run codemod:ds:dry` - Dry run design system codemods
- `npm run sync:material-icons` - Sync material icons

### iOS Development (WIP)
- `./scripts/build_run_ios.sh` - Run on iOS Simulator
- `./scripts/build_run_ios_device.sh --list-devices` - List connected iOS devices
- `./scripts/build_run_ios_device.sh --device "<device name>" --team <TEAM_ID>` - Run on USB device
- `./scripts/release_testflight_ios.sh` - Release to TestFlight

## Project Structure

### Frontend (React + TypeScript + Vite)
- `/src/App.tsx` - Composition root with main app logic
- `/src/features/` - Feature-sliced UI components and hooks
- `/src/services/` - Tauri IPC wrappers and event hub
- `/src/utils/` - Pure helper functions
- `/src/styles/` - CSS files (organized by feature/design system)
- `/src/types.ts` - Shared UI types
- `/src/test/` - Test setup and utilities
- `/src/hooks/` - Custom React hooks
- `/src/i18n/` - Internationalization files
- `/src/assets/` - Static assets (images, sounds)

### Backend (Rust + Tauri)
- `/src-tauri/src/lib.rs` - Tauri command registry
- `/src-tauri/src/shared/` - Shared core domain logic (app + daemon)
- `/src-tauri/src/backend/` - Backend-specific implementations
- `/src-tauri/src/codex/` - Codex app-server integration
- `/src-tauri/src/workspaces/` - Workspace management
- `/src-tauri/src/files/` - File operations
- `/src-tauri/src/dictation/` - Dictation/Whisper integration
- `/src-tauri/src/git/` - Git operations
- `/src-tauri/src/orbit/` - Orbit remote backend integration
- `/src-tauri/src/tailscale/` - Tailscale integration
- `/src-tauri/src/remote_backend/` - Remote backend functionality
- `/src-tauri/src/terminal/` - Terminal emulation
- `/src-tauri/src/settings/` - Settings management
- `/src-tauri/src/bin/codex_monitor_daemon.rs` - Daemon entrypoint

### Design System
- `/src/features/design-system/components/` - Modal, Toast, Panel, Popover primitives
- `/src/styles/ds-*.css` - Design system tokens and styles
- `/scripts/codemods/` - Codemods for design system migration

### Scripts & Configuration
- `/scripts/` - Build, release, and utility scripts
- `/public/` - Static public assets
- `/docs/` - Documentation files
- `/memory/` - Project memory files (for AI context)

## Architecture Principles

### Frontend Guidelines
- **Components**: Presentational only, no Tauri IPC
- **Hooks**: Own state, side effects, and event wiring
- **Services**: All Tauri IPC goes through `/src/services/tauri.ts`
- **Event Hub**: `/src/services/events.ts` manages shared event subscriptions
- **Styles**: Use design system tokens (`--ds-*` prefix) and primitives first
- **Feature Slicing**: Organized by feature area (app, messages, threads, git, etc.)

### Backend Guidelines
- **Shared Logic**: All core domain logic lives in `/src-tauri/src/shared/`
- **App/Daemon**: Thin adapters around shared cores
- **Tauri Commands**: Defined in `/src-tauri/src/lib.rs`, mirrored in frontend services
- **Daemon**: `/src-tauri/src/bin/codex_monitor_daemon.rs` provides JSON-RPC interface
- **Modular Structure**: Backend organized into functional modules (git, workspaces, codex, etc.)

### Key Architectural Patterns
1. **Feature Slicing**: Frontend organized by feature area
2. **Shared Core**: Backend logic shared between app and daemon
3. **Event-Driven**: Tauri events → React subscriptions via event hub
4. **Design System**: Tokenized styling with shared primitives
5. **Hooks Architecture**: Custom React hooks manage complex state and side effects

## Common Workflows

### Adding a New Tauri Event
1. Emit event in `src-tauri/src/lib.rs`
2. Add hub/subscribe helper in `src/services/events.ts`
3. Subscribe using `useTauriEvent` hook
4. Update `src/services/events.test.ts`

### Adding a New Backend Command
1. Implement core logic in `src-tauri/src/shared/`
2. Add Tauri command in `src-tauri/src/lib.rs`
3. Mirror in `src/services/tauri.ts`
4. Add daemon JSON-RPC handler in `src-tauri/src/bin/codex_monitor_daemon.rs`

### UI Development
- Use design system primitives first
- Add feature-specific styles in `/src/styles/`
- Run `npm run lint:ds` to validate design system usage
- Use codemods for design system migrations

### Testing
- Tests are located in `src/**/*.test.ts` and `src/**/*.test.tsx`
- Uses Vitest + React Testing Library
- Run specific test file: `npx vitest run src/path/to/file.test.tsx`
- Run tests in watch mode: `npm run test:watch`

## Requirements

- Node.js + npm
- Rust toolchain (stable)
- CMake (for native dependencies)
- LLVM/Clang (Windows only, for bindgen)
- Codex CLI (available in PATH)
- Git CLI
- GitHub CLI (`gh`) for Issues panel (optional)
- Xcode + Command Line Tools (for iOS development)

## Notes

- Workspaces persist to `workspaces.json` in app data directory
- Settings persist to `settings.json` in app data directory
- UI state (panel sizes, etc.) stored in localStorage
- Custom prompts loaded from `$CODEX_HOME/prompts`
- GitHub integration requires authenticated `gh` CLI
- iOS support is currently in progress (WIP)
- Remote backend mode supports connecting to Codex on another machine
