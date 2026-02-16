/* @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServerEvent } from "../../../types";
import { useRemoteThreadLiveConnection } from "./useRemoteThreadLiveConnection";

const {
  listenMock,
  subscribeAppServerEventsMock,
  threadLiveSubscribeMock,
  threadLiveUnsubscribeMock,
} = vi.hoisted(() => ({
  listenMock: vi.fn(),
  subscribeAppServerEventsMock: vi.fn(),
  threadLiveSubscribeMock: vi.fn(),
  threadLiveUnsubscribeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    listen: listenMock,
  }),
}));

vi.mock("../../../services/events", () => ({
  subscribeAppServerEvents: subscribeAppServerEventsMock,
}));

vi.mock("../../../services/tauri", () => ({
  threadLiveSubscribe: threadLiveSubscribeMock,
  threadLiveUnsubscribe: threadLiveUnsubscribeMock,
}));

describe("useRemoteThreadLiveConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listenMock.mockResolvedValue(() => {});
    subscribeAppServerEventsMock.mockReturnValue(() => {});
    threadLiveSubscribeMock.mockResolvedValue(undefined);
    threadLiveUnsubscribeMock.mockResolvedValue(undefined);
  });

  it("subscribes active remote thread and unsubscribes on blur", async () => {
    subscribeAppServerEventsMock.mockImplementation((_handler: (event: AppServerEvent) => void) => {
      return () => {};
    });
    const refreshThread = vi.fn().mockResolvedValue(undefined);

    const { result, unmount } = renderHook(() =>
      useRemoteThreadLiveConnection({
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
      await new Promise<void>((resolve) => { queueMicrotask(resolve); });
    });

    expect(refreshThread).toHaveBeenCalledWith("ws-1", "thread-1");
    expect(threadLiveSubscribeMock).toHaveBeenCalledWith("ws-1", "thread-1");
    expect(result.current.connectionState).toBe("polling");

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await new Promise<void>((resolve) => { queueMicrotask(resolve); });
    });

    expect(threadLiveUnsubscribeMock).toHaveBeenCalledWith("ws-1", "thread-1");
    unmount();
  });
});
