// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useApps } from "./useApps";
import { getAppsList } from "../../../services/tauri";
import { subscribeAppServerEvents } from "../../../services/events";
import type { AppServerEvent, WorkspaceInfo } from "../../../types";

vi.mock("../../../services/tauri", () => ({
  getAppsList: vi.fn(),
}));

vi.mock("../../../services/events", () => ({
  subscribeAppServerEvents: vi.fn(),
}));

const getAppsListMock = vi.mocked(getAppsList);
const subscribeAppServerEventsMock = vi.mocked(subscribeAppServerEvents);

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

describe("useApps", () => {
  let appServerListener: ((event: AppServerEvent) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    appServerListener = null;
    subscribeAppServerEventsMock.mockImplementation((listener) => {
      appServerListener = listener;
      return () => {};
    });
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
      expect(getAppsListMock).toHaveBeenNthCalledWith(
        1,
        "workspace-1",
        null,
        100,
        null,
      );
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
      expect(getAppsListMock).toHaveBeenNthCalledWith(
        2,
        "workspace-2",
        null,
        100,
        null,
      );
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

  it("re-fetches when active thread changes for the same workspace", async () => {
    getAppsListMock
      .mockResolvedValueOnce({
        data: [{ id: "app-a", name: "App A", isAccessible: true }],
      })
      .mockResolvedValueOnce({
        data: [{ id: "app-b", name: "App B", isAccessible: true }],
      });

    const { result, rerender } = renderHook(
      ({ activeThreadId }) =>
        useApps({
          activeWorkspace: workspace,
          activeThreadId,
          enabled: true,
        }),
      { initialProps: { activeThreadId: "thread-1" } },
    );

    await waitFor(() => {
      expect(getAppsListMock).toHaveBeenCalledWith(
        "workspace-1",
        null,
        100,
        "thread-1",
      );
      expect(result.current.apps).toEqual([
        expect.objectContaining({ id: "app-a", name: "App A" }),
      ]);
    });

    rerender({ activeThreadId: "thread-2" });

    await waitFor(() => {
      expect(getAppsListMock).toHaveBeenCalledWith(
        "workspace-1",
        null,
        100,
        "thread-2",
      );
      expect(result.current.apps).toEqual([
        expect.objectContaining({ id: "app-b", name: "App B" }),
      ]);
    });
  });

  it("clears stale apps immediately when switching to a thread without cached apps", async () => {
    let resolveSecond: ((value: unknown) => void) | null = null;
    const second = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    getAppsListMock
      .mockResolvedValueOnce({
        data: [{ id: "thread-1-app", name: "Thread 1 App", isAccessible: true }],
      })
      .mockImplementationOnce(() => second as Promise<any>);

    const { result, rerender } = renderHook(
      ({ activeThreadId }) =>
        useApps({
          activeWorkspace: workspace,
          activeThreadId,
          enabled: true,
        }),
      { initialProps: { activeThreadId: "thread-1" } },
    );

    await waitFor(() => {
      expect(result.current.apps).toEqual([
        expect.objectContaining({ id: "thread-1-app", name: "Thread 1 App" }),
      ]);
    });

    rerender({ activeThreadId: "thread-2" });

    expect(result.current.apps).toEqual([]);

    await act(async () => {
      resolveSecond?.({
        data: [{ id: "thread-2-app", name: "Thread 2 App", isAccessible: true }],
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.apps).toEqual([
        expect.objectContaining({ id: "thread-2-app", name: "Thread 2 App" }),
      ]);
    });
  });

  it("applies app/list/updated notifications immediately", async () => {
    getAppsListMock.mockResolvedValueOnce({
      data: [{ id: "initial", name: "Initial", isAccessible: false }],
    });

    const { result } = renderHook(() =>
      useApps({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.apps).toEqual([
        expect.objectContaining({ id: "initial", name: "Initial" }),
      ]);
    });

    act(() => {
      appServerListener?.({
        workspace_id: "workspace-1",
        message: {
          method: "app/list/updated",
          params: {
            threadId: "thread-1",
            data: [
              { id: "live", name: "Live App", isAccessible: true },
              { id: "hidden", name: "Hidden App", isAccessible: false },
            ],
          },
        },
      });
    });

    expect(result.current.apps).toEqual([
      expect.objectContaining({ id: "live", name: "Live App", isAccessible: true }),
      expect.objectContaining({ id: "hidden", name: "Hidden App", isAccessible: false }),
    ]);
  });

  it("ignores app/list/updated notifications for non-active threads", async () => {
    getAppsListMock.mockResolvedValueOnce({
      data: [{ id: "thread-2-app", name: "Thread 2 App", isAccessible: true }],
    });

    const { result } = renderHook(() =>
      useApps({
        activeWorkspace: workspace,
        activeThreadId: "thread-2",
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.apps).toEqual([
        expect.objectContaining({ id: "thread-2-app", name: "Thread 2 App" }),
      ]);
    });

    act(() => {
      appServerListener?.({
        workspace_id: "workspace-1",
        message: {
          method: "app/list/updated",
          params: {
            threadId: "thread-1",
            data: [{ id: "wrong-thread", name: "Wrong Thread App", isAccessible: true }],
          },
        },
      });
    });

    expect(result.current.apps).toEqual([
      expect.objectContaining({ id: "thread-2-app", name: "Thread 2 App" }),
    ]);
  });
});
