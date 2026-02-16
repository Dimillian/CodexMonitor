// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useQueuedSend } from "./useQueuedSend";

const QUEUED_MESSAGES_STORAGE_KEY = "codexmonitor.queuedMessagesByThread";

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const makeOptions = (
  overrides: Partial<Parameters<typeof useQueuedSend>[0]> = {},
) => ({
  activeThreadId: "thread-1",
  activeTurnId: null,
  isProcessing: false,
  isReviewing: false,
  steerEnabled: false,
  appsEnabled: true,
  activeWorkspace: workspace,
  connectWorkspace: vi.fn().mockResolvedValue(undefined),
  startThreadForWorkspace: vi.fn().mockResolvedValue("thread-1"),
  sendUserMessage: vi.fn().mockResolvedValue(undefined),
  sendUserMessageToThread: vi.fn().mockResolvedValue(undefined),
  startFork: vi.fn().mockResolvedValue(undefined),
  startReview: vi.fn().mockResolvedValue(undefined),
  startResume: vi.fn().mockResolvedValue(undefined),
  startCompact: vi.fn().mockResolvedValue(undefined),
  startApps: vi.fn().mockResolvedValue(undefined),
  startMcp: vi.fn().mockResolvedValue(undefined),
  startStatus: vi.fn().mockResolvedValue(undefined),
  clearActiveImages: vi.fn(),
  ...overrides,
});

async function flushAsyncTicks(ticks = 1): Promise<void> {
  for (let index = 0; index < ticks; index += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  }
}

describe("useQueuedSend", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("ignores images for queued review messages and blocks while reviewing", async () => {
    const options = makeOptions();
    const { result, rerender } = renderHook(
      (props) => useQueuedSend(props),
      { initialProps: options },
    );

    await act(async () => {
      await result.current.queueMessage("/review check this", ["img-1"]);
      await result.current.queueMessage("After review");
    });

    await flushAsyncTicks();

    expect(options.startReview).toHaveBeenCalledTimes(1);
    expect(options.startReview).toHaveBeenCalledWith("/review check this");
    expect(options.sendUserMessage).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ ...options, isReviewing: true });
    });
    await flushAsyncTicks();

    expect(options.sendUserMessage).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ ...options, isReviewing: false });
    });
    await flushAsyncTicks();

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("After review", []);
  });

  it("starts a new thread for /new and sends the remaining text there", async () => {
    const startThreadForWorkspace = vi.fn().mockResolvedValue("thread-2");
    const sendUserMessageToThread = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startThreadForWorkspace, sendUserMessageToThread });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/new hello there", ["img-1"]);
    });

    expect(startThreadForWorkspace).toHaveBeenCalledWith("workspace-1");
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      workspace,
      "thread-2",
      "hello there",
      [],
    );
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("starts a new thread for bare /new without sending a message", async () => {
    const startThreadForWorkspace = vi.fn().mockResolvedValue("thread-3");
    const sendUserMessageToThread = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startThreadForWorkspace, sendUserMessageToThread });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/new");
    });

    expect(startThreadForWorkspace).toHaveBeenCalledWith("workspace-1");
    expect(sendUserMessageToThread).not.toHaveBeenCalled();
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("routes /status to the local status handler", async () => {
    const startStatus = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startStatus });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/status now", ["img-1"]);
    });

    expect(startStatus).toHaveBeenCalledWith("/status now");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(options.startReview).not.toHaveBeenCalled();
  });

  it("routes /mcp to the MCP handler", async () => {
    const startMcp = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startMcp });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/mcp now", ["img-1"]);
    });

    expect(startMcp).toHaveBeenCalledWith("/mcp now");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(options.startReview).not.toHaveBeenCalled();
  });

  it("routes /apps to the apps handler", async () => {
    const startApps = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startApps });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/apps now", ["img-1"]);
    });

    expect(startApps).toHaveBeenCalledWith("/apps now");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(options.startReview).not.toHaveBeenCalled();
  });

  it("treats /apps as plain text when apps feature is disabled", async () => {
    const startApps = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startApps, appsEnabled: false });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/apps now", ["img-1"]);
    });

    expect(startApps).not.toHaveBeenCalled();
    expect(options.sendUserMessage).toHaveBeenCalledWith("/apps now", ["img-1"]);
  });

  it("routes /resume to the resume handler", async () => {
    const startResume = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startResume });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/resume now", ["img-1"]);
    });

    expect(startResume).toHaveBeenCalledWith("/resume now");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(options.startReview).not.toHaveBeenCalled();
  });

  it("routes /compact to the compact handler", async () => {
    const startCompact = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startCompact });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/compact now", ["img-1"]);
    });

    expect(startCompact).toHaveBeenCalledWith("/compact now");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(options.startReview).not.toHaveBeenCalled();
  });

  it("routes /fork to the fork handler", async () => {
    const startFork = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startFork });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/fork branch here", ["img-1"]);
    });

    expect(startFork).toHaveBeenCalledWith("/fork branch here");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(options.startReview).not.toHaveBeenCalled();
  });

  it("does not send when reviewing even if steer is enabled", async () => {
    const options = makeOptions({ isReviewing: true, steerEnabled: true });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("Blocked");
    });

    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(result.current.activeQueue).toHaveLength(0);
  });

  it("restores queued messages from local storage", async () => {
    const persisted = {
      "thread-1": [
        {
          id: "persisted-1",
          text: "Recovered",
          createdAt: 123,
          images: ["img-a"],
        },
      ],
      "thread-2": [
        {
          id: "persisted-2",
          text: "Other thread",
          createdAt: 456,
        },
      ],
    };
    window.localStorage.setItem(
      QUEUED_MESSAGES_STORAGE_KEY,
      JSON.stringify(persisted),
    );

    const options = makeOptions({ isProcessing: true });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    expect(result.current.activeQueue).toHaveLength(1);
    expect(result.current.activeQueue[0]).toMatchObject({
      id: "persisted-1",
      text: "Recovered",
      createdAt: 123,
      images: ["img-a"],
    });
  });

  it("auto-migrates legacy queued messages with missing workspaceId", async () => {
    window.localStorage.setItem(
      QUEUED_MESSAGES_STORAGE_KEY,
      JSON.stringify({
        "thread-1": [
          {
            id: "legacy-1",
            text: "Legacy queue",
            createdAt: 100,
          },
        ],
      }),
    );

    const options = makeOptions({
      activeThreadId: "thread-2",
      activeWorkspace: {
        ...workspace,
        id: "workspace-2",
      },
      threadStatusById: {
        "thread-1": { isProcessing: true, isReviewing: false },
        "thread-2": { isProcessing: false, isReviewing: false },
      },
      threadWorkspaceById: {
        "thread-1": "workspace-1",
        "thread-2": "workspace-2",
      },
      workspacesById: new Map([
        ["workspace-1", workspace],
        ["workspace-2", { ...workspace, id: "workspace-2" }],
      ]),
    });

    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await flushAsyncTicks();

    expect(result.current.legacyQueueMessageCount).toBe(0);

    const stored = JSON.parse(
      window.localStorage.getItem(QUEUED_MESSAGES_STORAGE_KEY) ?? "{}",
    ) as Record<string, Array<{ workspaceId?: string }>>;

    expect(stored["thread-1"]?.[0]?.workspaceId).toBe("workspace-1");
  });

  it("keeps queued messages after remount", async () => {
    const options = makeOptions({ isProcessing: true });
    const { result, unmount } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("Persist me", ["img-1"]);
    });
    await flushAsyncTicks();

    unmount();

    const remountedOptions = makeOptions({ isProcessing: true });
    const { result: remounted } = renderHook((props) => useQueuedSend(props), {
      initialProps: remountedOptions,
    });

    expect(remounted.current.activeQueue).toHaveLength(1);
    expect(remounted.current.activeQueue[0]).toMatchObject({
      text: "Persist me",
      images: ["img-1"],
    });
  });

  it("preserves images for queued messages", async () => {
    const options = makeOptions();
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("Images", ["img-1", "img-2"]);
    });

    await flushAsyncTicks();

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("Images", [
      "img-1",
      "img-2",
    ]);
  });

  it("marks processing stale entries in queue health", async () => {
    const processingStartedAt = Date.now() - 120_000;
    const options = makeOptions({
      activeThreadId: "thread-1",
      activeWorkspace: workspace,
      isProcessing: true,
      threadStatusById: {
        "thread-1": {
          isProcessing: true,
          isReviewing: false,
          processingStartedAt,
        },
      },
      threadWorkspaceById: {},
      workspacesById: new Map(),
    });

    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("for stale");
    });
    await flushAsyncTicks();

    const staleEntry = result.current.queueHealthEntries.find((entry) => entry.threadId === "thread-1");
    expect(staleEntry?.blockedReason).toBe("processing");
    expect(staleEntry?.isStale).toBe(true);
    expect((staleEntry?.blockedForMs ?? 0)).toBeGreaterThanOrEqual(90_000);
  });

  it("does not auto-dispatch active-thread queue while processing is stale", async () => {
    const onRecoverStaleThread = vi.fn();
    const options = makeOptions({
      isProcessing: false,
      onRecoverStaleThread,
      threadStatusById: {
        "thread-1": {
          isProcessing: false,
          isReviewing: false,
          processingStartedAt: null,
        },
      },
    });

    const { result, rerender } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("first");
      await result.current.queueMessage("second");
    });

    await flushAsyncTicks();

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenNthCalledWith(1, "first", []);

    await act(async () => {
      rerender({
        ...options,
        isProcessing: true,
        threadStatusById: {
          "thread-1": {
            isProcessing: true,
            isReviewing: false,
            processingStartedAt: Date.now() - 120_000,
          },
        },
      });
    });

    await flushAsyncTicks(2);

    expect(onRecoverStaleThread).not.toHaveBeenCalled();
    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(result.current.activeQueue.map((item) => item.text)).toEqual(["second"]);
  });

  it("flushes active-thread queue only after processing ends", async () => {
    const options = makeOptions({
      isProcessing: false,
      threadStatusById: {
        "thread-1": {
          isProcessing: false,
          isReviewing: false,
          processingStartedAt: null,
        },
      },
    });

    const { result, rerender } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("first");
      await result.current.queueMessage("second");
    });

    await flushAsyncTicks();

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenNthCalledWith(1, "first", []);

    await act(async () => {
      rerender({
        ...options,
        isProcessing: true,
        threadStatusById: {
          "thread-1": {
            isProcessing: true,
            isReviewing: false,
            processingStartedAt: Date.now() - 120_000,
          },
        },
      });
    });

    await flushAsyncTicks(2);

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(result.current.activeQueue.map((item) => item.text)).toEqual(["second"]);

    await act(async () => {
      rerender({
        ...options,
        isProcessing: false,
        threadStatusById: {
          "thread-1": {
            isProcessing: false,
            isReviewing: false,
            processingStartedAt: null,
          },
        },
      });
    });

    await flushAsyncTicks(2);

    expect(options.sendUserMessage).toHaveBeenCalledTimes(2);
    expect(options.sendUserMessage).toHaveBeenNthCalledWith(2, "second", []);
  });

  it("records lastFailureAt when dispatch fails", async () => {
    const options = makeOptions({
      sendUserMessage: vi.fn().mockRejectedValue(new Error("dispatch failed")),
    });

    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("will fail");
    });

    await flushAsyncTicks(2);

    expect(options.sendUserMessage).toHaveBeenCalled();

    const failedEntry = result.current.queueHealthEntries.find((entry) => entry.threadId === "thread-1");
    expect(failedEntry?.lastFailureAt).toEqual(expect.any(Number));
  });

  it("supports retrying a specific queued thread", async () => {
    const onRecoverStaleThread = vi.fn();
    const options = makeOptions({
      activeThreadId: "thread-1",
      activeWorkspace: workspace,
      isProcessing: false,
      onRecoverStaleThread,
    });

    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("retry me");
    });

    await flushAsyncTicks();

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retryThreadQueue("thread-1");
    });

    await flushAsyncTicks();

    expect(options.sendUserMessage).toHaveBeenCalledTimes(2);
    expect(onRecoverStaleThread).toHaveBeenCalledWith("thread-1");
  });

  it("supports clearing a specific queued thread", async () => {
    const onRecoverStaleThread = vi.fn();
    const options = makeOptions({
      activeWorkspace: null,
      isProcessing: true,
      onRecoverStaleThread,
      threadStatusById: {
        "thread-1": {
          isProcessing: true,
          isReviewing: false,
          processingStartedAt: Date.now() - 120_000,
        },
      },
    });
    const { result, rerender } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("keep");
      await result.current.queueMessage("remove");
    });

    expect(result.current.activeQueue).toHaveLength(2);

    act(() => {
      result.current.clearThreadQueue("thread-1");
    });

    expect(result.current.activeQueue).toHaveLength(0);

    await act(async () => {
      rerender({
        ...options,
        activeThreadId: "thread-2",
        activeWorkspace: { ...workspace, id: "workspace-2" },
        isProcessing: false,
      });
    });

    expect(
      result.current.queueHealthEntries.find((entry) => entry.threadId === "thread-1"),
    ).toBeUndefined();
    expect(onRecoverStaleThread).toHaveBeenCalledWith("thread-1");
  });

  it("hides stale status-only non-active threads from queue diagnostics", () => {
    const options = makeOptions({
      activeThreadId: "thread-1",
      isProcessing: false,
      threadStatusById: {
        "thread-2": {
          isProcessing: true,
          isReviewing: false,
          processingStartedAt: Date.now() - 180_000,
        },
      },
    });

    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    expect(
      result.current.queueHealthEntries.find((entry) => entry.threadId === "thread-2"),
    ).toBeUndefined();
  });
});
