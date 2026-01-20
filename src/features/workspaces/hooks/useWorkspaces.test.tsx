// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import {
  listWorkspaces,
  renameWorktree,
  renameWorktreeUpstream,
} from "../../../services/tauri";
import { useWorkspaces } from "./useWorkspaces";

vi.mock("../../../services/tauri", () => ({
  listWorkspaces: vi.fn(),
  renameWorktree: vi.fn(),
  renameWorktreeUpstream: vi.fn(),
  addClone: vi.fn(),
  addWorkspace: vi.fn(),
  addWorktree: vi.fn(),
  connectWorkspace: vi.fn(),
  pickWorkspacePath: vi.fn(),
  removeWorkspace: vi.fn(),
  removeWorktree: vi.fn(),
  updateWorkspaceCodexBin: vi.fn(),
  updateWorkspaceSettings: vi.fn(),
}));

const worktree: WorkspaceInfo = {
  id: "wt-1",
  name: "feature/old",
  path: "/tmp/wt-1",
  connected: true,
  kind: "worktree",
  parentId: "parent-1",
  worktree: { branch: "feature/old" },
  settings: { sidebarCollapsed: false },
};

describe("useWorkspaces.renameWorktree", () => {
  it("optimistically updates and reconciles on success", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const renameWorktreeMock = vi.mocked(renameWorktree);
    listWorkspacesMock.mockResolvedValue([worktree]);

    let resolveRename: (value: WorkspaceInfo) => void = () => {};
    const renamePromise = new Promise<WorkspaceInfo>((resolve) => {
      resolveRename = resolve;
    });
    renameWorktreeMock.mockReturnValue(renamePromise);

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    let renameCall: Promise<WorkspaceInfo>;
    act(() => {
      renameCall = result.current.renameWorktree("wt-1", "feature/new");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.workspaces[0].name).toBe("feature/new");
    expect(result.current.workspaces[0].worktree?.branch).toBe("feature/new");

    resolveRename({
      ...worktree,
      name: "feature/new",
      path: "/tmp/wt-1-renamed",
      worktree: { branch: "feature/new" },
    });

    await act(async () => {
      await renameCall;
    });

    expect(result.current.workspaces[0].path).toBe("/tmp/wt-1-renamed");
  });

  it("rolls back optimistic update on failure", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const renameWorktreeMock = vi.mocked(renameWorktree);
    listWorkspacesMock.mockResolvedValue([worktree]);
    let rejectRename: (error: Error) => void = () => {};
    const renamePromise = new Promise<WorkspaceInfo>((_, reject) => {
      rejectRename = reject;
    });
    renameWorktreeMock.mockReturnValue(renamePromise);

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    let renameCall: Promise<WorkspaceInfo>;
    act(() => {
      renameCall = result.current.renameWorktree("wt-1", "feature/new");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.workspaces[0].name).toBe("feature/new");

    rejectRename(new Error("rename failed"));

    await act(async () => {
      try {
        await renameCall;
      } catch {
        // Expected rejection.
      }
    });

    expect(result.current.workspaces[0].name).toBe("feature/old");
    expect(result.current.workspaces[0].worktree?.branch).toBe("feature/old");
  });

  it("exposes upstream rename helper", async () => {
    const listWorkspacesMock = vi.mocked(listWorkspaces);
    const renameWorktreeUpstreamMock = vi.mocked(renameWorktreeUpstream);
    listWorkspacesMock.mockResolvedValue([worktree]);
    renameWorktreeUpstreamMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.renameWorktreeUpstream(
        "wt-1",
        "feature/old",
        "feature/new",
      );
    });

    expect(renameWorktreeUpstreamMock).toHaveBeenCalledWith(
      "wt-1",
      "feature/old",
      "feature/new",
    );
  });
});
