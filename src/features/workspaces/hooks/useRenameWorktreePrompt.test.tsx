// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useRenameWorktreePrompt } from "./useRenameWorktreePrompt";

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

describe("useRenameWorktreePrompt", () => {
  it("opens prompt and shows upstream confirmation after rename", async () => {
    const renameWorktree = vi.fn().mockResolvedValue({
      ...worktree,
      name: "feature/new",
      worktree: { branch: "feature/new" },
    });
    const renameWorktreeUpstream = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRenameWorktreePrompt({
        workspaces: [worktree],
        activeWorkspaceId: worktree.id,
        renameWorktree,
        renameWorktreeUpstream,
      }),
    );

    act(() => {
      result.current.openRenamePrompt(worktree.id);
      result.current.handleRenameChange("feature/new");
    });

    await act(async () => {
      await result.current.handleRenameConfirm();
    });

    expect(renameWorktree).toHaveBeenCalledWith(worktree.id, "feature/new");
    expect(result.current.upstreamPrompt).toEqual(
      expect.objectContaining({
        workspaceId: worktree.id,
        oldBranch: "feature/old",
        newBranch: "feature/new",
      }),
    );

    await act(async () => {
      await result.current.confirmUpstream();
    });

    expect(renameWorktreeUpstream).toHaveBeenCalledWith(
      worktree.id,
      "feature/old",
      "feature/new",
    );
    expect(result.current.upstreamPrompt).toBeNull();
    expect(result.current.notice).toBe("Upstream branch updated.");
  });

  it("surfaces rename errors", async () => {
    const renameWorktree = vi
      .fn()
      .mockRejectedValue(new Error("rename failed"));
    const renameWorktreeUpstream = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRenameWorktreePrompt({
        workspaces: [worktree],
        activeWorkspaceId: worktree.id,
        renameWorktree,
        renameWorktreeUpstream,
      }),
    );

    act(() => {
      result.current.openRenamePrompt(worktree.id);
      result.current.handleRenameChange("feature/new");
    });

    await act(async () => {
      await result.current.handleRenameConfirm();
    });

    expect(result.current.renamePrompt?.error).toBe("rename failed");
  });
});
