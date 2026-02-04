/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BranchInfo, WorkspaceInfo } from "../../../types";
import { BranchSwitcherPrompt } from "./BranchSwitcherPrompt";

const baseSettings: WorkspaceInfo["settings"] = {
  sidebarCollapsed: false,
};

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  value: vi.fn(),
  writable: true,
});

function createWorkspace(
  overrides: Partial<WorkspaceInfo> & Pick<WorkspaceInfo, "id" | "name" | "path">,
): WorkspaceInfo {
  return {
    id: overrides.id,
    name: overrides.name,
    path: overrides.path,
    connected: overrides.connected ?? true,
    kind: overrides.kind ?? "main",
    parentId: overrides.parentId ?? null,
    worktree: overrides.worktree ?? null,
    settings: overrides.settings ?? baseSettings,
  };
}

const branches: BranchInfo[] = [{ name: "develop", lastCommit: 0 }];

describe("BranchSwitcherPrompt", () => {
  it("prefers worktrees that belong to the active workspace repo", () => {
    const activeMain = createWorkspace({
      id: "main-a",
      name: "Repo A",
      path: "/tmp/repo-a",
      kind: "main",
    });
    const matchingWorktree = createWorkspace({
      id: "wt-a-develop",
      name: "A develop",
      path: "/tmp/repo-a-develop",
      kind: "worktree",
      parentId: "main-a",
      worktree: { branch: "develop" },
    });
    const unrelatedWorktree = createWorkspace({
      id: "wt-b-develop",
      name: "B develop",
      path: "/tmp/repo-b-develop",
      kind: "worktree",
      parentId: "main-b",
      worktree: { branch: "develop" },
    });
    const onSelect = vi.fn();

    render(
      <BranchSwitcherPrompt
        branches={branches}
        workspaces={[activeMain, matchingWorktree, unrelatedWorktree]}
        activeWorkspace={activeMain}
        currentBranch={null}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /develop/i }));

    expect(onSelect).toHaveBeenCalledWith("develop", matchingWorktree);
  });
});
