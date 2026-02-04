// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useSystemNotificationThreadLinks } from "./useSystemNotificationThreadLinks";

function makeWorkspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    id: "ws-1",
    name: "Workspace",
    path: "/tmp/workspace",
    connected: true,
    settings: { sidebarCollapsed: false },
    ...overrides,
  };
}

describe("useSystemNotificationThreadLinks", () => {
  it("navigates to the thread when the app regains focus", async () => {
    const workspace = makeWorkspace({ connected: true });
    const workspacesById = new Map([[workspace.id, workspace]]);

    const refreshWorkspaces = vi.fn(async () => [workspace]);
    const connectWorkspace = vi.fn(async () => {});
    const setActiveTab = vi.fn();
    const setCenterMode = vi.fn();
    const setSelectedDiffPath = vi.fn();
    const setActiveWorkspaceId = vi.fn();
    const setActiveThreadId = vi.fn();

    const { result } = renderHook(() =>
      useSystemNotificationThreadLinks({
        hasLoadedWorkspaces: true,
        workspacesById,
        refreshWorkspaces,
        connectWorkspace,
        setActiveTab,
        setCenterMode,
        setSelectedDiffPath,
        setActiveWorkspaceId,
        setActiveThreadId,
      }),
    );

    act(() => {
      result.current.recordPendingThreadLink("ws-1", "t-1");
    });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(setCenterMode).toHaveBeenCalledWith("chat");
    expect(setSelectedDiffPath).toHaveBeenCalledWith(null);
    expect(setActiveTab).toHaveBeenCalledWith("codex");
    expect(setActiveWorkspaceId).toHaveBeenCalledWith("ws-1");
    expect(setActiveThreadId).toHaveBeenCalledWith("t-1", "ws-1");
    expect(connectWorkspace).not.toHaveBeenCalled();
    expect(refreshWorkspaces).not.toHaveBeenCalled();
  });

  it("connects the workspace before selecting the thread when needed", async () => {
    const workspace = makeWorkspace({ connected: false });
    const workspacesById = new Map([[workspace.id, workspace]]);

    const refreshWorkspaces = vi.fn(async () => [workspace]);
    const connectWorkspace = vi.fn(async () => {});
    const setActiveTab = vi.fn();
    const setCenterMode = vi.fn();
    const setSelectedDiffPath = vi.fn();
    const setActiveWorkspaceId = vi.fn();
    const setActiveThreadId = vi.fn();

    const { result } = renderHook(() =>
      useSystemNotificationThreadLinks({
        hasLoadedWorkspaces: true,
        workspacesById,
        refreshWorkspaces,
        connectWorkspace,
        setActiveTab,
        setCenterMode,
        setSelectedDiffPath,
        setActiveWorkspaceId,
        setActiveThreadId,
      }),
    );

    act(() => {
      result.current.recordPendingThreadLink("ws-1", "t-1");
    });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(connectWorkspace).toHaveBeenCalledTimes(1);
    expect(setActiveThreadId).toHaveBeenCalledWith("t-1", "ws-1");
  });
});
