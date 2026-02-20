// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useWorkspaceRestore } from "./useWorkspaceRestore";

const workspace: WorkspaceInfo = {
  id: "ws-restore",
  name: "Restore Workspace",
  path: "/tmp/restore",
  connected: false,
  kind: "main",
  parentId: null,
  worktree: null,
  settings: { sidebarCollapsed: false },
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useWorkspaceRestore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries restore after a transient failure", async () => {
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const listThreadsForWorkspace = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary RPC error"))
      .mockResolvedValueOnce(undefined);

    const { rerender } = renderHook(
      (props: {
        hasLoaded: boolean;
        workspaces: WorkspaceInfo[];
        connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
        listThreadsForWorkspace: (
          workspace: WorkspaceInfo,
          options?: { preserveState?: boolean },
        ) => Promise<void>;
      }) => useWorkspaceRestore(props),
      {
        initialProps: {
          hasLoaded: true,
          workspaces: [workspace],
          connectWorkspace,
          listThreadsForWorkspace,
        },
      },
    );

    await act(async () => {
      await flush();
    });

    expect(connectWorkspace).toHaveBeenCalledTimes(1);
    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(1);

    rerender({
      hasLoaded: true,
      workspaces: [workspace],
      connectWorkspace,
      listThreadsForWorkspace,
    });

    await act(async () => {
      await flush();
    });

    expect(connectWorkspace).toHaveBeenCalledTimes(2);
    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(2);
  });

  it("does not retry after a successful restore", async () => {
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);

    const { rerender } = renderHook(
      () =>
        useWorkspaceRestore({
          hasLoaded: true,
          workspaces: [workspace],
          connectWorkspace,
          listThreadsForWorkspace,
        }),
      {
        initialProps: undefined,
      },
    );

    await act(async () => {
      await flush();
    });

    rerender();
    await act(async () => {
      await flush();
    });

    expect(connectWorkspace).toHaveBeenCalledTimes(1);
    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(1);
  });
});
