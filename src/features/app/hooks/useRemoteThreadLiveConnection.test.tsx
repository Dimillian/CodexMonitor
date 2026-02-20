// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteThreadLiveConnection } from "./useRemoteThreadLiveConnection";

const appServerListeners = new Set<(event: any) => void>();
const subscribeAppServerEventsMock = vi.fn((listener: (event: any) => void) => {
  appServerListeners.add(listener);
  return () => {
    appServerListeners.delete(listener);
  };
});

const threadLiveSubscribeMock = vi.fn().mockResolvedValue(undefined);
const threadLiveUnsubscribeMock = vi.fn().mockResolvedValue(undefined);
const pushErrorToastMock = vi.fn();

vi.mock("@services/events", () => ({
  subscribeAppServerEvents: (listener: (event: any) => void) =>
    subscribeAppServerEventsMock(listener),
}));

vi.mock("@services/tauri", () => ({
  threadLiveSubscribe: (...args: any[]) => threadLiveSubscribeMock(...args),
  threadLiveUnsubscribe: (...args: any[]) => threadLiveUnsubscribeMock(...args),
}));

vi.mock("@services/toasts", () => ({
  pushErrorToast: (...args: any[]) => pushErrorToastMock(...args),
}));

vi.mock("@utils/appServerEvents", () => ({
  getAppServerRawMethod: (event: any) => event.method ?? null,
  getAppServerParams: (event: any) => event.params ?? {},
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    listen: vi.fn().mockResolvedValue(() => {}),
  }),
}));

describe("useRemoteThreadLiveConnection", () => {
  let visibilityState: DocumentVisibilityState;
  let hasFocus: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T00:00:00.000Z"));
    visibilityState = "visible";
    hasFocus = true;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => hasFocus,
    });
    appServerListeners.clear();
    subscribeAppServerEventsMock.mockClear();
    threadLiveSubscribeMock.mockClear();
    threadLiveUnsubscribeMock.mockClear();
    pushErrorToastMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not reconnect during normal idle period without detach signal", async () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadLiveConnection({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-1",
        refreshThread,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(threadLiveSubscribeMock).toHaveBeenCalledTimes(1);
    expect(refreshThread).toHaveBeenCalledTimes(1);

    const heartbeatEvent = {
      workspace_id: "ws-1",
      method: "thread/live_heartbeat",
      params: { threadId: "thread-1" },
    };
    await act(async () => {
      for (const listener of appServerListeners) {
        listener(heartbeatEvent);
      }
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(25_000);
      await Promise.resolve();
    });

    expect(threadLiveSubscribeMock).toHaveBeenCalledTimes(1);
    expect(threadLiveUnsubscribeMock).toHaveBeenCalledTimes(0);
    expect(refreshThread).toHaveBeenCalledTimes(1);
    expect(pushErrorToastMock).not.toHaveBeenCalled();
  });

  it("reconnects when thread live stream detaches while visible", async () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadLiveConnection({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-1",
        refreshThread,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(threadLiveSubscribeMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      for (const listener of appServerListeners) {
        listener({
          workspace_id: "ws-1",
          method: "thread/live_detached",
          params: { threadId: "thread-1" },
        });
      }
      await Promise.resolve();
    });

    expect(threadLiveSubscribeMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(refreshThread.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not reconnect detached stream when window is not focused", async () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadLiveConnection({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-1",
        refreshThread,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(threadLiveSubscribeMock).toHaveBeenCalledTimes(1);

    hasFocus = false;
    await act(async () => {
      for (const listener of appServerListeners) {
        listener({
          workspace_id: "ws-1",
          method: "thread/live_detached",
          params: { threadId: "thread-1" },
        });
      }
      await Promise.resolve();
    });

    expect(threadLiveSubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("promotes polling state to live on thread activity without heartbeat", async () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);
    const workspace = {
      id: "ws-1",
      name: "Workspace",
      path: "/tmp/ws-1",
      connected: true,
      settings: { sidebarCollapsed: false },
    };

    const { result } = renderHook(() =>
      useRemoteThreadLiveConnection({
        backendMode: "remote",
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        refreshThread,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.connectionState).toBe("polling");

    await act(async () => {
      for (const listener of appServerListeners) {
        listener({
          workspace_id: "ws-1",
          method: "item/started",
          params: { threadId: "thread-1" },
        });
      }
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.connectionState).toBe("live");
  });

  it("cleans up stale reconnect subscribe when sequence advances", async () => {
    let resolveFirstSubscribe: (() => void) | null = null;
    const firstSubscribe = new Promise<void>((resolve) => {
      resolveFirstSubscribe = resolve;
    });
    threadLiveSubscribeMock
      .mockImplementationOnce(() => firstSubscribe)
      .mockResolvedValue(undefined);
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRemoteThreadLiveConnection({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: null,
        refreshThread,
      }),
    );

    let firstReconnectPromise: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      firstReconnectPromise = result.current.reconnectLive("ws-1", "thread-1", {
        runResume: false,
      });
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.reconnectLive("ws-1", "thread-2", { runResume: false });
      await Promise.resolve();
    });

    await act(async () => {
      resolveFirstSubscribe?.();
      await firstReconnectPromise;
      await Promise.resolve();
    });

    expect(threadLiveUnsubscribeMock).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("coalesces same-key reconnect while subscribe is in flight", async () => {
    let resolveFirstSubscribe: (() => void) | null = null;
    const firstSubscribe = new Promise<void>((resolve) => {
      resolveFirstSubscribe = resolve;
    });
    threadLiveSubscribeMock
      .mockImplementationOnce(() => firstSubscribe)
      .mockResolvedValue(undefined);
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRemoteThreadLiveConnection({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: null,
        refreshThread,
      }),
    );

    let firstReconnectPromise: Promise<boolean> = Promise.resolve(false);
    let secondReconnectPromise: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      firstReconnectPromise = result.current.reconnectLive("ws-1", "thread-1", {
        runResume: false,
      });
      await Promise.resolve();
    });

    await act(async () => {
      secondReconnectPromise = result.current.reconnectLive("ws-1", "thread-1", {
        runResume: false,
      });
      await Promise.resolve();
    });
    expect(threadLiveSubscribeMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstSubscribe?.();
      await firstReconnectPromise;
      await secondReconnectPromise;
      await Promise.resolve();
    });

    expect(threadLiveUnsubscribeMock).not.toHaveBeenCalled();
  });

  it("cancels in-flight reconnect attempt when window blurs", async () => {
    let resolveFirstSubscribe: (() => void) | null = null;
    const firstSubscribe = new Promise<void>((resolve) => {
      resolveFirstSubscribe = resolve;
    });
    threadLiveSubscribeMock.mockImplementationOnce(() => firstSubscribe);
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRemoteThreadLiveConnection({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: null,
        refreshThread,
      }),
    );

    await act(async () => {
      result.current.reconnectLive("ws-1", "thread-1", { runResume: false });
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await Promise.resolve();
    });

    await act(async () => {
      resolveFirstSubscribe?.();
      await Promise.resolve();
    });

    expect(threadLiveUnsubscribeMock).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("starts a fresh reconnect after blur cancels same-key in-flight attempt", async () => {
    let resolveFirstSubscribe: (() => void) | null = null;
    const firstSubscribe = new Promise<void>((resolve) => {
      resolveFirstSubscribe = resolve;
    });
    threadLiveSubscribeMock
      .mockImplementationOnce(() => firstSubscribe)
      .mockResolvedValue(undefined);
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRemoteThreadLiveConnection({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: null,
        refreshThread,
      }),
    );

    let firstReconnectPromise: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      firstReconnectPromise = result.current.reconnectLive("ws-1", "thread-1", {
        runResume: false,
      });
      await Promise.resolve();
    });
    expect(threadLiveSubscribeMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await Promise.resolve();
    });

    let secondReconnectPromise: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      secondReconnectPromise = result.current.reconnectLive("ws-1", "thread-1", {
        runResume: false,
      });
      await Promise.resolve();
    });
    expect(threadLiveSubscribeMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await expect(secondReconnectPromise).resolves.toBe(true);
    });

    await act(async () => {
      resolveFirstSubscribe?.();
      await expect(firstReconnectPromise).resolves.toBe(false);
      await Promise.resolve();
    });
  });

  it("does not reconnect when workspace object identity changes but key is unchanged", async () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);
    const firstWorkspace = {
      id: "ws-1",
      name: "Workspace",
      path: "/tmp/ws-1",
      connected: true,
      settings: { sidebarCollapsed: false },
    };

    const { rerender } = renderHook(
      ({ workspace }) =>
        useRemoteThreadLiveConnection({
          backendMode: "remote",
          activeWorkspace: workspace,
          activeThreadId: "thread-1",
          refreshThread,
        }),
      {
        initialProps: { workspace: firstWorkspace },
      },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(threadLiveSubscribeMock).toHaveBeenCalledTimes(1);
    expect(refreshThread).toHaveBeenCalledTimes(1);

    const secondWorkspace = {
      id: "ws-1",
      name: "Workspace (renamed)",
      path: "/tmp/ws-1",
      connected: true,
      settings: { sidebarCollapsed: false },
    };

    await act(async () => {
      rerender({ workspace: secondWorkspace });
      await Promise.resolve();
    });

    expect(threadLiveSubscribeMock).toHaveBeenCalledTimes(1);
    expect(threadLiveUnsubscribeMock).toHaveBeenCalledTimes(0);
    expect(refreshThread).toHaveBeenCalledTimes(1);
  });

  it("ignores self-triggered detached event during dedupe reconnect", async () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);
    const workspace = {
      id: "ws-1",
      name: "Workspace",
      path: "/tmp/ws-1",
      connected: true,
      settings: { sidebarCollapsed: false },
    };

    const { result } = renderHook(() =>
      useRemoteThreadLiveConnection({
        backendMode: "remote",
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        refreshThread,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(threadLiveSubscribeMock).toHaveBeenCalledTimes(1);
    expect(refreshThread).toHaveBeenCalledTimes(1);

    threadLiveUnsubscribeMock.mockImplementationOnce(async (workspaceId, threadId) => {
      for (const listener of appServerListeners) {
        listener({
          workspace_id: workspaceId,
          method: "thread/live_detached",
          params: { threadId },
        });
      }
    });

    await act(async () => {
      await result.current.reconnectLive("ws-1", "thread-1", { runResume: false });
      await Promise.resolve();
    });

    expect(threadLiveUnsubscribeMock).toHaveBeenCalledTimes(1);
    expect(threadLiveSubscribeMock).toHaveBeenCalledTimes(2);
    expect(refreshThread).toHaveBeenCalledTimes(1);
  });
});
