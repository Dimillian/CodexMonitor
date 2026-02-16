// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ThreadState } from "./useThreadsReducer";
import { useThreadStaleGuard } from "./useThreadStaleGuard";

type ThreadStatusById = ThreadState["threadStatusById"];

function buildProcessingStatus(startedAt: number): ThreadStatusById {
  return {
    "thread-1": {
      isProcessing: true,
      hasUnread: false,
      isReviewing: false,
      processingStartedAt: startedAt,
      lastDurationMs: null,
      lastActivityAt: startedAt,
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  };
}

describe("useThreadStaleGuard", () => {
  it("does not auto-reset while processing is below 3 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-16T00:00:00.000Z"));

    const markProcessing = vi.fn();
    const markReviewing = vi.fn();
    const setActiveTurnId = vi.fn();
    const pushThreadErrorMessage = vi.fn();

    const startedAt = Date.now() - (2 * 60_000);
    renderHook(() =>
      useThreadStaleGuard({
        activeWorkspaceId: "ws-1",
        activeThreadId: "thread-1",
        threadStatusById: buildProcessingStatus(startedAt),
        markProcessing,
        markReviewing,
        setActiveTurnId,
        pushThreadErrorMessage,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(markProcessing).not.toHaveBeenCalled();
    expect(markReviewing).not.toHaveBeenCalled();
    expect(setActiveTurnId).not.toHaveBeenCalled();
    expect(pushThreadErrorMessage).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("auto-recovers after processing exceeds 3 minutes with 90s silence", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-16T00:00:00.000Z"));

    const markProcessing = vi.fn();
    const markReviewing = vi.fn();
    const setActiveTurnId = vi.fn();
    const pushThreadErrorMessage = vi.fn();

    const startedAt = Date.now() - (3 * 60_000) - 1;
    renderHook(() =>
      useThreadStaleGuard({
        activeWorkspaceId: "ws-1",
        activeThreadId: "thread-1",
        threadStatusById: buildProcessingStatus(startedAt),
        markProcessing,
        markReviewing,
        setActiveTurnId,
        pushThreadErrorMessage,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(markReviewing).toHaveBeenCalledWith("thread-1", false);
    expect(setActiveTurnId).toHaveBeenCalledWith("thread-1", null);
    expect(pushThreadErrorMessage).toHaveBeenCalledWith(
      "thread-1",
      expect.stringContaining("长时间无事件"),
    );

    vi.useRealTimers();
  });

  it("does not auto-reset when recent alive events are within 90 seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-16T00:00:00.000Z"));

    const markProcessing = vi.fn();
    const markReviewing = vi.fn();
    const setActiveTurnId = vi.fn();
    const pushThreadErrorMessage = vi.fn();

    const startedAt = Date.now() - (10 * 60_000);
    const { result } = renderHook(() =>
      useThreadStaleGuard({
        activeWorkspaceId: "ws-1",
        activeThreadId: "thread-1",
        threadStatusById: buildProcessingStatus(startedAt),
        markProcessing,
        markReviewing,
        setActiveTurnId,
        pushThreadErrorMessage,
      }),
    );

    act(() => {
      result.current.recordAlive("ws-1");
      vi.advanceTimersByTime(60_000);
    });

    expect(markProcessing).not.toHaveBeenCalled();
    expect(markReviewing).not.toHaveBeenCalled();
    expect(setActiveTurnId).not.toHaveBeenCalled();
    expect(pushThreadErrorMessage).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("resets active processing thread on explicit disconnect", () => {
    const markProcessing = vi.fn();
    const markReviewing = vi.fn();
    const setActiveTurnId = vi.fn();
    const pushThreadErrorMessage = vi.fn();

    const startedAt = Date.now() - 5_000;
    const { result } = renderHook(() =>
      useThreadStaleGuard({
        activeWorkspaceId: "ws-1",
        activeThreadId: "thread-1",
        threadStatusById: buildProcessingStatus(startedAt),
        markProcessing,
        markReviewing,
        setActiveTurnId,
        pushThreadErrorMessage,
      }),
    );

    act(() => {
      result.current.handleDisconnected("ws-1");
    });

    expect(markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(markReviewing).toHaveBeenCalledWith("thread-1", false);
    expect(setActiveTurnId).toHaveBeenCalledWith("thread-1", null);
    expect(pushThreadErrorMessage).toHaveBeenCalledWith(
      "thread-1",
      "Agent 连接已断开，请重试。",
    );
  });
});
