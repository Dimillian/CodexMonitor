# GEMINI.md - CodexMonitor

## Project Overview

This is a cross-platform desktop application named "Codex Monitor", built using the Tauri framework. The application serves as a graphical user interface for orchestrating and managing multiple Codex agents across various local project workspaces.

- **Core Technologies**: The project utilizes a modern technology stack:
    - **Frontend**: Built with React and TypeScript, bundled with Vite.
    - **Backend**: Powered by Rust, managing the application's core logic and system interactions.
    - **Testing**: Unit and component tests are run with Vitest and React Testing Library.
    - **Code Style**: ESLint is configured to enforce consistent coding conventions.

- **Architecture**: The application follows a clear architectural separation:
    - The `src` directory contains all frontend code, structured using a feature-sliced approach (e.g., `src/features/git`, `src/features/files`).
    - The `src-tauri` directory holds the Rust backend, including the Tauri setup and native functionalities.
    - Communication between the frontend and backend is handled via Tauri's Inter-Process Communication (IPC), with frontend service wrappers located in `src/services/tauri.ts`.

## Building and Running

The project's `package.json` file defines the primary scripts for development and production workflows.

- **Run in Development Mode**: To start the application with hot-reloading for the frontend:
  ```bash
  npm run tauri:dev
  ```

- **Build for Production**: To create a distributable, production-ready application bundle:
  ```bash
  npm run tauri:build
  ```
  For Windows-specific builds, use `npm run tauri:build:win`.

- **Running Tests**: To execute the test suite:
  ```bash
  npm run test
  ```

- **Linting & Type Checking**: To ensure code quality and type safety:
  ```bash
  # Run ESLint
  npm run lint

  # Run TypeScript checker
  npm run typecheck
  ```

## Development Conventions

- **Feature-Sliced Design**: The UI is organized by features (e.g., git, files, prompts), making the codebase modular and easier to navigate.
- **Styling**: CSS is used for styling and is organized by component/feature in the `src/styles` directory.
- **Dependency Check**: A "doctor" script (`npm run doctor` or `npm run doctor:win`) is available to help diagnose issues with the development environment and dependencies.
- **Committing**: (Assumed) Before committing, it's advisable to run `npm run lint` and `npm run test` to ensure code quality and prevent regressions.
