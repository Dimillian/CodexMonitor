# Gitignore Policy

`.gitignore` should exclude only reproducible/generated artifacts and local machine state.

## Current Categories

1. Logs and debug outputs
2. Dependency/build outputs (`node_modules`, `dist`, release artifacts)
3. Local env/private runtime files (`*.local`, `.testflight.local.env`)
4. Runtime cache and local Codex memory artifacts

## Rules

1. Do not ignore canonical source or documentation files.
2. If adding a new ignore entry, document why in this file.
3. Prefer keeping generated files out of repository history.

