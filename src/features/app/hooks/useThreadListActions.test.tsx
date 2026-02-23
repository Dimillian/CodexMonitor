// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceInfo } from "../../../types";
import { useThreadListActions } from "./useThreadListActions";

function workspace(id: string, connected: boolean): WorkspaceInfo {
  return {
    id,
    name: id,
    path: `/tmp/${id}`,
    connected,
    settings: { sidebarCollapsed: false },
  };
}

describe("useThreadListActions", () => {
  it("refreshes workspaces before reloading connected workspace threads", async () => {
    const stale = [workspace("stale", true)];
    const fresh = [workspace("one", true), workspace("two", false), workspace("three", true)];
    const refreshWorkspaces = vi.fn(async () => fresh);
    const listThreadsForWorkspace = vi.fn(async () => {});
    const resetWorkspaceThreads = vi.fn();

    const { result } = renderHook(() =>
      useThreadListActions({
        threadListSortKey: "updated_at",
        setThreadListSortKey: vi.fn(),
        workspaces: stale,
        refreshWorkspaces,
        listThreadsForWorkspace,
        resetWorkspaceThreads,
      }),
    );

    await act(async () => {
      await result.current.handleRefreshAllWorkspaceThreads();
    });

    expect(refreshWorkspaces).toHaveBeenCalledTimes(1);
    expect(resetWorkspaceThreads).toHaveBeenCalledTimes(2);
    expect(resetWorkspaceThreads).toHaveBeenNthCalledWith(1, "one");
    expect(resetWorkspaceThreads).toHaveBeenNthCalledWith(2, "three");
    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(2);
    expect(listThreadsForWorkspace).toHaveBeenNthCalledWith(1, fresh[0]);
    expect(listThreadsForWorkspace).toHaveBeenNthCalledWith(2, fresh[2]);
  });

  it("falls back to current workspaces when refresh fails", async () => {
    const current = [workspace("one", true), workspace("two", false)];
    const refreshWorkspaces = vi.fn(async () => undefined);
    const listThreadsForWorkspace = vi.fn(async () => {});
    const resetWorkspaceThreads = vi.fn();

    const { result } = renderHook(() =>
      useThreadListActions({
        threadListSortKey: "updated_at",
        setThreadListSortKey: vi.fn(),
        workspaces: current,
        refreshWorkspaces,
        listThreadsForWorkspace,
        resetWorkspaceThreads,
      }),
    );

    await act(async () => {
      await result.current.handleRefreshAllWorkspaceThreads();
    });

    expect(refreshWorkspaces).toHaveBeenCalledTimes(1);
    expect(resetWorkspaceThreads).toHaveBeenCalledTimes(1);
    expect(resetWorkspaceThreads).toHaveBeenCalledWith("one");
    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(1);
    expect(listThreadsForWorkspace).toHaveBeenCalledWith(current[0]);
  });
});
