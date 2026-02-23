// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useGitRootSelection } from "./useGitRootSelection";

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "repo",
  path: "/srv/repo",
  connected: true,
  codex_bin: null,
  kind: "main",
  parentId: null,
  worktree: null,
  settings: {
    sidebarCollapsed: false,
    groupId: null,
    gitRoot: null,
  },
};

describe("useGitRootSelection", () => {
  it("uses injected directory picker and stores path relative to workspace root", async () => {
    const updateWorkspaceSettings = vi.fn(async () => undefined);
    const clearGitRootCandidates = vi.fn();
    const refreshGitStatus = vi.fn();
    const pickDirectoryPath = vi.fn(async () => "/srv/repo/packages/app");

    const { result } = renderHook(() =>
      useGitRootSelection({
        activeWorkspace: workspace,
        updateWorkspaceSettings,
        clearGitRootCandidates,
        refreshGitStatus,
        pickDirectoryPath,
      }),
    );

    await act(async () => {
      await result.current.handlePickGitRoot();
    });

    expect(pickDirectoryPath).toHaveBeenCalledTimes(1);
    expect(updateWorkspaceSettings).toHaveBeenCalledWith("ws-1", {
      gitRoot: "packages/app",
    });
  });
});
