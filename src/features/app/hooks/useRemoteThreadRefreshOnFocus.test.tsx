/* @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REMOTE_THREAD_POLL_INTERVAL_MS,
  useRemoteThreadRefreshOnFocus,
} from "./useRemoteThreadRefreshOnFocus";

const { listenMock } = vi.hoisted(() => ({
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    listen: listenMock,
  }),
}));

describe("useRemoteThreadRefreshOnFocus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listenMock.mockResolvedValue(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls on interval for remote active thread", async () => {
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadRefreshOnFocus({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-1",
          name: "Workspace 1",
          path: "/tmp/ws-1",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-1",
        refreshThread,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(REMOTE_THREAD_POLL_INTERVAL_MS + 1);
      await new Promise<void>((resolve) => { queueMicrotask(resolve); });
    });

    expect(refreshThread).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("reconnects workspace before refresh when disconnected", async () => {
    const reconnectWorkspace = vi.fn().mockResolvedValue(undefined);
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRemoteThreadRefreshOnFocus({
        backendMode: "remote",
        activeWorkspace: {
          id: "ws-2",
          name: "Workspace 2",
          path: "/tmp/ws-2",
          connected: false,
          settings: { sidebarCollapsed: false },
        },
        activeThreadId: "thread-2",
        refreshThread,
        reconnectWorkspace,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(REMOTE_THREAD_POLL_INTERVAL_MS + 1);
      await new Promise<void>((resolve) => { queueMicrotask(resolve); });
    });

    expect(reconnectWorkspace).toHaveBeenCalled();
    expect(refreshThread).toHaveBeenCalledWith("ws-2", "thread-2");
  });
});
