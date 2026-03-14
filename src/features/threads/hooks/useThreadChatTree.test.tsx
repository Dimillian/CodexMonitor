// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useThreadChatTree } from "./useThreadChatTree";

const threadChatTreeReadMock = vi.fn();
const threadChatTreeSetCurrentMock = vi.fn();

vi.mock("@services/tauri", () => ({
  threadChatTreeRead: (...args: unknown[]) => threadChatTreeReadMock(...args),
  threadChatTreeSetCurrent: (...args: unknown[]) => threadChatTreeSetCurrentMock(...args),
}));

describe("useThreadChatTree", () => {
  beforeEach(() => {
    threadChatTreeReadMock.mockReset();
    threadChatTreeSetCurrentMock.mockReset();
  });

  it("loads the active thread tree when the active thread changes", async () => {
    threadChatTreeReadMock.mockResolvedValue({
      result: {
        chatTree: {
          currentNodeId: "node-a",
          nodes: [{ nodeId: "node-a", parentNodeId: null, summary: "A", turnId: "turn-a", order: 0 }],
        },
      },
    });

    const { result } = renderHook(() =>
      useThreadChatTree({
        activeWorkspaceId: "ws-1",
        activeThreadId: "thread-1",
        hasLocalSnapshot: true,
        isProcessing: false,
        isResumeLoading: false,
        refreshThread: vi.fn(),
      }),
    );

    await waitFor(() =>
      expect(result.current.activeTree?.currentNodeId).toBe("node-a"),
    );
    expect(threadChatTreeReadMock).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("reloads the active tree after resume finishes", async () => {
    threadChatTreeReadMock
      .mockResolvedValueOnce({
        result: {
          chatTree: { currentNodeId: "node-a", nodes: [] },
        },
      })
      .mockResolvedValueOnce({
        result: {
          chatTree: { currentNodeId: "node-b", nodes: [] },
        },
      });

    const { result, rerender } = renderHook(
      (props: {
        isResumeLoading: boolean;
      }) =>
        useThreadChatTree({
          activeWorkspaceId: "ws-1",
          activeThreadId: "thread-1",
          hasLocalSnapshot: true,
          isProcessing: false,
          isResumeLoading: props.isResumeLoading,
          refreshThread: vi.fn(),
        }),
      {
        initialProps: { isResumeLoading: true },
      },
    );

    rerender({ isResumeLoading: false });

    await waitFor(() => expect(threadChatTreeReadMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.activeTree?.currentNodeId).toBe("node-b"),
    );
  });

  it("switches nodes by setting current and then refreshing the thread", async () => {
    const refreshThread = vi.fn().mockResolvedValue("thread-1");
    threadChatTreeReadMock
      .mockResolvedValueOnce({
        result: {
          chatTree: {
            currentNodeId: "node-a",
            nodes: [
              { nodeId: "node-a", parentNodeId: null, summary: "A", turnId: "turn-a", order: 0 },
              { nodeId: "node-b", parentNodeId: "node-a", summary: "B", turnId: "turn-b", order: 1 },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          chatTree: {
            currentNodeId: "node-b",
            nodes: [
              { nodeId: "node-a", parentNodeId: null, summary: "A", turnId: "turn-a", order: 0 },
              { nodeId: "node-b", parentNodeId: "node-a", summary: "B", turnId: "turn-b", order: 1 },
            ],
          },
        },
      });
    threadChatTreeSetCurrentMock.mockResolvedValue({
      result: { threadId: "thread-1", currentNodeId: "node-b" },
    });

    const { result } = renderHook(() =>
      useThreadChatTree({
        activeWorkspaceId: "ws-1",
        activeThreadId: "thread-1",
        hasLocalSnapshot: true,
        isProcessing: false,
        isResumeLoading: false,
        refreshThread,
      }),
    );

    await waitFor(() =>
      expect(result.current.activeTree?.currentNodeId).toBe("node-a"),
    );

    await act(async () => {
      await result.current.setCurrentNode("node-b");
    });

    expect(threadChatTreeSetCurrentMock).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "node-b",
    );
    expect(refreshThread).toHaveBeenCalledWith("ws-1", "thread-1");
    expect(result.current.activeTree?.currentNodeId).toBe("node-b");
  });

  it("blocks node switching while the active thread is processing", async () => {
    threadChatTreeReadMock.mockResolvedValue({
      result: {
        chatTree: {
          currentNodeId: "node-a",
          nodes: [{ nodeId: "node-a", parentNodeId: null, summary: "A", turnId: "turn-a", order: 0 }],
        },
      },
    });

    const refreshThread = vi.fn();
    const { result } = renderHook(() =>
      useThreadChatTree({
        activeWorkspaceId: "ws-1",
        activeThreadId: "thread-1",
        hasLocalSnapshot: true,
        isProcessing: true,
        isResumeLoading: false,
        refreshThread,
      }),
    );

    await waitFor(() => expect(threadChatTreeReadMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.setCurrentNode("node-b");
    });

    expect(threadChatTreeSetCurrentMock).not.toHaveBeenCalled();
    expect(refreshThread).not.toHaveBeenCalled();
  });

  it("blocks node switching while the active thread is refreshing", async () => {
    threadChatTreeReadMock.mockResolvedValue({
      result: {
        chatTree: {
          currentNodeId: "node-a",
          nodes: [{ nodeId: "node-a", parentNodeId: null, summary: "A", turnId: "turn-a", order: 0 }],
        },
      },
    });

    const refreshThread = vi.fn();
    const { result } = renderHook(() =>
      useThreadChatTree({
        activeWorkspaceId: "ws-1",
        activeThreadId: "thread-1",
        hasLocalSnapshot: true,
        isProcessing: false,
        isResumeLoading: true,
        refreshThread,
      }),
    );

    await waitFor(() => expect(threadChatTreeReadMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.setCurrentNode("node-b");
    });

    expect(threadChatTreeSetCurrentMock).not.toHaveBeenCalled();
    expect(refreshThread).not.toHaveBeenCalled();
  });

  it("waits for resume to finish before loading when there is no local snapshot", async () => {
    threadChatTreeReadMock.mockResolvedValue({
      result: {
        chatTree: {
          currentNodeId: "node-a",
          nodes: [],
        },
      },
    });

    const { rerender } = renderHook(
      (props: { isResumeLoading: boolean }) =>
        useThreadChatTree({
          activeWorkspaceId: "ws-1",
          activeThreadId: "thread-1",
          hasLocalSnapshot: false,
          isProcessing: false,
          isResumeLoading: props.isResumeLoading,
          refreshThread: vi.fn(),
        }),
      {
        initialProps: { isResumeLoading: false },
      },
    );

    expect(threadChatTreeReadMock).not.toHaveBeenCalled();

    rerender({ isResumeLoading: true });
    expect(threadChatTreeReadMock).not.toHaveBeenCalled();

    rerender({ isResumeLoading: false });

    await waitFor(() => expect(threadChatTreeReadMock).toHaveBeenCalledTimes(1));
  });

  it("clears a stale error when switching to a different thread", async () => {
    threadChatTreeReadMock.mockRejectedValueOnce(new Error("boom"));

    const { result, rerender } = renderHook(
      (props: { activeThreadId: string; hasLocalSnapshot: boolean }) =>
        useThreadChatTree({
          activeWorkspaceId: "ws-1",
          activeThreadId: props.activeThreadId,
          hasLocalSnapshot: props.hasLocalSnapshot,
          isProcessing: false,
          isResumeLoading: false,
          refreshThread: vi.fn(),
        }),
      {
        initialProps: {
          activeThreadId: "thread-1",
          hasLocalSnapshot: true,
        },
      },
    );

    await waitFor(() => expect(result.current.error).toBe("boom"));

    rerender({
      activeThreadId: "thread-2",
      hasLocalSnapshot: false,
    });

    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it("clears prior errors after a silent recovery reload succeeds", async () => {
    threadChatTreeReadMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        result: {
          chatTree: {
            currentNodeId: "node-a",
            nodes: [],
          },
        },
      });

    const { result, rerender } = renderHook(
      (props: { isResumeLoading: boolean }) =>
        useThreadChatTree({
          activeWorkspaceId: "ws-1",
          activeThreadId: "thread-1",
          hasLocalSnapshot: true,
          isProcessing: false,
          isResumeLoading: props.isResumeLoading,
          refreshThread: vi.fn(),
        }),
      {
        initialProps: { isResumeLoading: false },
      },
    );

    await waitFor(() => expect(result.current.error).toBe("boom"));

    rerender({ isResumeLoading: true });
    rerender({ isResumeLoading: false });

    await waitFor(() => expect(result.current.error).toBeNull());
    await waitFor(() =>
      expect(result.current.activeTree?.currentNodeId).toBe("node-a"),
    );
  });

  it("clears loading state after a visible load is superseded by a silent reload", async () => {
    const visibleLoadController: { resolve: ((value: unknown) => void) | null } = {
      resolve: null,
    };
    const visibleLoadPromise = new Promise((resolve) => {
      visibleLoadController.resolve = resolve;
    });

    threadChatTreeReadMock
      .mockImplementationOnce(() => visibleLoadPromise)
      .mockResolvedValueOnce({
        result: {
          chatTree: {
            currentNodeId: "node-b",
            nodes: [],
          },
        },
      });

    const { result, rerender } = renderHook(
      (props: { isResumeLoading: boolean }) =>
        useThreadChatTree({
          activeWorkspaceId: "ws-1",
          activeThreadId: "thread-1",
          hasLocalSnapshot: true,
          isProcessing: false,
          isResumeLoading: props.isResumeLoading,
          refreshThread: vi.fn(),
        }),
      {
        initialProps: { isResumeLoading: false },
      },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(true));

    rerender({ isResumeLoading: true });
    rerender({ isResumeLoading: false });

    await waitFor(() => expect(threadChatTreeReadMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.activeTree?.currentNodeId).toBe("node-b"),
    );

    if (visibleLoadController.resolve) {
      visibleLoadController.resolve({
        result: {
          chatTree: {
            currentNodeId: "node-a",
            nodes: [],
          },
        },
      });
    }

    await act(async () => {
      await visibleLoadPromise;
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("ignores stale branch-switch errors after the active thread changes", async () => {
    const switchController: { reject: ((reason?: unknown) => void) | null } = {
      reject: null,
    };
    const switchPromise = new Promise<never>((_, reject) => {
      switchController.reject = reject;
    });

    threadChatTreeReadMock
      .mockResolvedValueOnce({
        result: {
          chatTree: {
            currentNodeId: "node-a",
            nodes: [
              { nodeId: "node-a", parentNodeId: null, summary: "A", turnId: "turn-a", order: 0 },
              { nodeId: "node-b", parentNodeId: "node-a", summary: "B", turnId: "turn-b", order: 1 },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          chatTree: {
            currentNodeId: "node-c",
            nodes: [{ nodeId: "node-c", parentNodeId: null, summary: "C", turnId: "turn-c", order: 0 }],
          },
        },
      });
    threadChatTreeSetCurrentMock.mockImplementationOnce(() => switchPromise);

    const { result, rerender } = renderHook(
      (props: { activeThreadId: string }) =>
        useThreadChatTree({
          activeWorkspaceId: "ws-1",
          activeThreadId: props.activeThreadId,
          hasLocalSnapshot: true,
          isProcessing: false,
          isResumeLoading: false,
          refreshThread: vi.fn(),
        }),
      {
        initialProps: { activeThreadId: "thread-1" },
      },
    );

    await waitFor(() =>
      expect(result.current.activeTree?.currentNodeId).toBe("node-a"),
    );

    let switchResultPromise: Promise<boolean> | null = null;
    await act(async () => {
      switchResultPromise = result.current.setCurrentNode("node-b");
    });

    expect(result.current.switchingNodeId).toBe("node-b");

    rerender({ activeThreadId: "thread-2" });

    await waitFor(() =>
      expect(result.current.activeTree?.currentNodeId).toBe("node-c"),
    );

    if (switchController.reject) {
      switchController.reject(new Error("boom"));
    }

    await act(async () => {
      await switchResultPromise;
    });

    expect(result.current.error).toBeNull();
    expect(result.current.switchingNodeId).toBeNull();
  });
});
