# Bulk Add Workspaces — Implementation Plan

- Issue: Dimillian/CodexMonitor#383
- Branch: `feat/383-bulk-add-workspaces`

## Decisions

- Activation after bulk add: activate the **first newly-added** workspace only.
- Summary: show a summary dialog **only when** something is skipped or fails.

## Goal

Add multi-select / bulk add of workspaces so users can add many projects in one operation (and make drag/drop use the same pipeline without focus bouncing).

## Milestones

### 1) Issue + branch

- [x] Create upstream issue (#383)
- [x] Create feature branch

### 2) Multi-select picker wrapper

- [ ] Add `pickWorkspacePaths()` (multi-select directory picker) in `src/services/tauri.ts`
- [ ] Add unit tests for the new wrapper

### 3) Bulk add pipeline (shared by picker + drag/drop)

- [ ] Implement a bulk add function in `src/features/workspaces/hooks/useWorkspaces.ts`
  - [ ] Normalize + dedupe selected paths
  - [ ] Skip existing workspace paths
  - [ ] Skip invalid/non-directories
  - [ ] Add sequentially via existing `add_workspace` IPC
  - [ ] Activate only the first successful add
  - [ ] Aggregate and show summary only when skipped/failed
- [ ] Add tests for bulk add behavior

### 4) Wire UI + polish

- [ ] Update `addWorkspace()` to use multi-select picker
- [ ] Route drag/drop additions through the bulk add pipeline (avoid focus bounce)
- [ ] Update any UI copy if needed (optional: “Add Workspaces…”)

### 5) Validate

- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run typecheck`
- [ ] If Rust touched: `cd src-tauri && cargo test`

## Notes

- `PLAN.md` and `SPEC.md` are tracking docs for this branch and must not be present in the final PR diff.

