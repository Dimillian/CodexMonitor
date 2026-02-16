// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteThreadRefreshOnFocus } from "./useRemoteThreadRefreshOnFocus";

const windowListeners = new Map<string, Set<() => void>>();
const listenMock = vi.fn<
  (eventName: string, handler: () => void) => Promise<() => void>
>();

function registerWindowListener(eventName: string, handler: () => void) {
  const handlers = windowListeners.get(eventName) ?? new Set<() => void>();
  handlers.add(handler);
  windowListeners.set(eventName, handlers);
  return () => {
    handlers.delete(handler);
  };
}

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    listen: listenMock,
  }),
}));

describe("useRemoteThreadRefreshOnFocus", () => {
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    vi.useFakeTimers();
    windowListeners.clear();
    listenMock.mockReset();
    listenMock.mockImplementation(async (eventName: string, handler: () => void) =>
      registerWindowListener(eventName, handler),
    );
    visibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes the active remote thread on focus with debounce", () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadRefreshOnFocus({
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

    act(() => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(499);
    });
    expect(refreshThread).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(refreshThread).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("refreshes even when workspace is marked disconnected", () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadRefreshOnFocus({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: false,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-1",
        refreshThread,
      }),
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(500);
    });

    expect(refreshThread).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("attempts reconnect before refresh when workspace is disconnected", async () => {
    const reconnectWorkspace = vi.fn().mockResolvedValue(undefined);
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadRefreshOnFocus({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: false,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-1",
        reconnectWorkspace,
        refreshThread,
      }),
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(reconnectWorkspace).toHaveBeenCalledTimes(1);
    expect(reconnectWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ws-1" }),
    );
    expect(refreshThread).toHaveBeenCalledTimes(1);
    expect(reconnectWorkspace.mock.invocationCallOrder[0]).toBeLessThan(
      refreshThread.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("does not drop a pending focus refresh when callback identity changes", async () => {
    const firstRefreshThread = vi.fn().mockResolvedValue(undefined);
    const secondRefreshThread = vi.fn().mockResolvedValue(undefined);

    const { rerender } = renderHook(
      (props: { refreshThread: typeof firstRefreshThread }) =>
        useRemoteThreadRefreshOnFocus({
          backendMode: "remote",
          activeWorkspace: {
            id: "ws-1",
            name: "Workspace",
            path: "/tmp/ws-1",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
          activeThreadId: "thread-1",
          refreshThread: props.refreshThread,
        }),
      {
        initialProps: { refreshThread: firstRefreshThread },
      },
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(250);
    });

    rerender({ refreshThread: secondRefreshThread });

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(firstRefreshThread).not.toHaveBeenCalled();
    expect(secondRefreshThread).toHaveBeenCalledTimes(1);
    expect(secondRefreshThread).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("refreshes when tauri focus event fires", async () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadRefreshOnFocus({
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

    act(() => {
      for (const handler of windowListeners.get("tauri://focus") ?? []) {
        handler();
      }
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(refreshThread).toHaveBeenCalledTimes(1);
    expect(refreshThread).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("cleans up late tauri listener registrations after unmount", async () => {
    let resolveFocus: (unlisten: () => void) => void = () => {};
    let resolveBlur: (unlisten: () => void) => void = () => {};
    const focusRegistration = new Promise<() => void>((resolve) => {
      resolveFocus = resolve;
    });
    const blurRegistration = new Promise<() => void>((resolve) => {
      resolveBlur = resolve;
    });
    listenMock.mockImplementation((eventName: string) => {
      if (eventName === "tauri://focus") {
        return focusRegistration;
      }
      if (eventName === "tauri://blur") {
        return blurRegistration;
      }
      return Promise.resolve(() => {});
    });

    const unlistenFocus = vi.fn();
    const unlistenBlur = vi.fn();
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    const { unmount } = renderHook(() =>
      useRemoteThreadRefreshOnFocus({
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

    unmount();
    resolveFocus(unlistenFocus);
    resolveBlur(unlistenBlur);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(unlistenFocus).toHaveBeenCalledTimes(1);
    expect(unlistenBlur).toHaveBeenCalledTimes(1);
  });

  it("does not poll while processing and refreshes when visibility returns", async () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadRefreshOnFocus({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-1",
        activeThreadIsProcessing: true,
        refreshThread,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });
    expect(refreshThread).toHaveBeenCalledTimes(0);

    await act(async () => {
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });
    expect(refreshThread).toHaveBeenCalledTimes(0);

    await act(async () => {
      visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(refreshThread).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });
    expect(refreshThread).toHaveBeenCalledTimes(1);
  });

  it("keeps a low-frequency poll for active remote threads when not processing", async () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadRefreshOnFocus({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace",
          path: "/tmp/ws-1",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-1",
        activeThreadIsProcessing: false,
        refreshThread,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(11_999);
      await Promise.resolve();
    });
    expect(refreshThread).toHaveBeenCalledTimes(0);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(refreshThread).toHaveBeenCalledTimes(1);
  });
});
