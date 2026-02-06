// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useApps } from "./useApps";
import { getAppsList } from "../../../services/tauri";
import type { WorkspaceInfo } from "../../../types";

vi.mock("../../../services/tauri", () => ({
  getAppsList: vi.fn(),
}));

const getAppsListMock = vi.mocked(getAppsList);

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

describe("useApps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-fetches for a new workspace after switching while previous request is in-flight", async () => {
    let resolveFirst: ((value: unknown) => void) | null = null;
    let resolveSecond: ((value: unknown) => void) | null = null;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    getAppsListMock
      .mockImplementationOnce(() => first as Promise<any>)
      .mockImplementationOnce(() => second as Promise<any>);

    const { result, rerender } = renderHook(
      ({ activeWorkspace }) =>
        useApps({
          activeWorkspace,
          enabled: true,
        }),
      { initialProps: { activeWorkspace: workspace } },
    );

    await waitFor(() => {
      expect(getAppsListMock).toHaveBeenCalledTimes(1);
      expect(getAppsListMock).toHaveBeenNthCalledWith(1, "workspace-1", null, 100);
    });

    const workspaceTwo: WorkspaceInfo = {
      ...workspace,
      id: "workspace-2",
      name: "Workspace 2",
    };
    rerender({ activeWorkspace: workspaceTwo });

    await act(async () => {
      resolveFirst?.({
        data: [{ id: "old", name: "Old App", isAccessible: true }],
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getAppsListMock).toHaveBeenCalledTimes(2);
      expect(getAppsListMock).toHaveBeenNthCalledWith(2, "workspace-2", null, 100);
      expect(result.current.apps).toEqual([]);
    });

    await act(async () => {
      resolveSecond?.({
        data: [{ id: "new", name: "New App", isAccessible: true }],
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.apps).toEqual([
        expect.objectContaining({ id: "new", name: "New App" }),
      ]);
    });
  });

  it("retries automatically after a transient fetch error", async () => {
    vi.useFakeTimers();
    getAppsListMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        data: [{ id: "ok", name: "Recovered App", isAccessible: true }],
      });

    const { result } = renderHook(() =>
      useApps({
        activeWorkspace: workspace,
        enabled: true,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(getAppsListMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
    });

    expect(getAppsListMock).toHaveBeenCalledTimes(2);
    expect(result.current.apps).toEqual([
      expect.objectContaining({ id: "ok", name: "Recovered App" }),
    ]);
  });
});
