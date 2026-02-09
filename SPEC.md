# Bulk Add Workspaces — Spec

## Problem

Adding many projects is tedious because the workspace picker only supports selecting a single folder. Drag/drop can add multiple paths, but currently adds are fired without awaiting, which can lead to focus/active-workspace bouncing and inconsistent UX.

## User-facing behavior

### Multi-select picker

- “Add Workspace…” opens a directory picker that supports selecting multiple folders.
- When the picker returns multiple selections:
  - Add all valid folders that are not already present.
  - Activate only the **first newly-added** workspace.
  - If any selections are skipped (duplicate/invalid) or fail to add, show one summary dialog.

### Drag/drop

- Drag/drop of multiple folder paths uses the same bulk-add pipeline as the picker.
- Drop handling should avoid activating each added workspace (activate first only).

## Dedupe rules

- Normalize paths for comparison:
  - trim whitespace
  - replace `\\` with `/`
  - strip trailing `/` (and `\\`)
- A selection is considered “already added” if its normalized path matches an existing workspace’s normalized `path`.

## Error handling

- Bulk add is best-effort:
  - continue adding remaining selections even if one fails
  - failures appear in the summary (and may be visible in Debug panel via existing logging)

## Non-goals (for this PR)

- Progress UI / per-workspace status while adding many workspaces.
- Backend/API changes (the existing `add_workspace` IPC is called N times).
- Automatic grouping / tagging during bulk add.

## Acceptance criteria

- Multi-select folder picker adds multiple workspaces in one operation.
- Only the first newly-added workspace becomes active after a bulk add.
- Existing workspaces are not duplicated.
- Drag/drop uses the same pipeline and does not bounce focus across newly-added workspaces.
- Summary dialog is shown only when something is skipped or fails.

