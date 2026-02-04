// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useWorktreePrompt } from "./useWorktreePrompt";

const parentWorkspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Parent",
  path: "/tmp/ws-1",
  connected: true,
  kind: "main",
  settings: { sidebarCollapsed: false },
};

describe("useWorktreePrompt", () => {
  it("derives branch from name until branch is manually edited", () => {
    const addWorktreeAgent = vi.fn().mockResolvedValue(null);
    const updateWorkspaceSettings = vi.fn().mockResolvedValue(parentWorkspace);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        updateWorkspaceSettings,
        connectWorkspace,
        onSelectWorkspace,
      }),
    );

    act(() => {
      result.current.openPrompt(parentWorkspace);
    });

    act(() => {
      result.current.updateName("My New Feature!");
    });

    expect(result.current.worktreePrompt?.branch).toBe("codex/my-new-feature");

    act(() => {
      result.current.updateBranch("custom/branch-name");
    });

    act(() => {
      result.current.updateName("Another Idea");
    });

    expect(result.current.worktreePrompt?.branch).toBe("custom/branch-name");
    expect(addWorktreeAgent).not.toHaveBeenCalled();
  });

  it("does not override branch when name is cleared", () => {
    const addWorktreeAgent = vi.fn().mockResolvedValue(null);
    const updateWorkspaceSettings = vi.fn().mockResolvedValue(parentWorkspace);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const onSelectWorkspace = vi.fn();

    const { result } = renderHook(() =>
      useWorktreePrompt({
        addWorktreeAgent,
        updateWorkspaceSettings,
        connectWorkspace,
        onSelectWorkspace,
      }),
    );

    act(() => {
      result.current.openPrompt(parentWorkspace);
    });

    const originalBranch = result.current.worktreePrompt?.branch;

    act(() => {
      result.current.updateName("  ");
    });

    expect(result.current.worktreePrompt?.branch).toBe(originalBranch);
    expect(addWorktreeAgent).not.toHaveBeenCalled();
  });
});
