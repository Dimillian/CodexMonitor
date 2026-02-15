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

describe("useQueuedSend", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("sends queued messages one at a time after processing completes", async () => {
    const options = makeOptions();
    const { result, rerender } = renderHook(
      (props) => useQueuedSend(props),
      { initialProps: options },
    );

    await act(async () => {
      await result.current.queueMessage("First");
      await result.current.queueMessage("Second");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("First", []);

    await act(async () => {
      rerender({ ...options, isProcessing: true });
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      rerender({ ...options, isProcessing: false });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(2);
    expect(options.sendUserMessage).toHaveBeenLastCalledWith("Second", []);
  });

  it("waits for processing to start before sending the next queued message", async () => {
    const options = makeOptions();
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("Alpha");
      await result.current.queueMessage("Beta");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("Alpha", []);
  });

  it("queues send while processing", async () => {
    const options = makeOptions({ isProcessing: true, steerEnabled: false });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("Queued");
    });

    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(result.current.activeQueue).toHaveLength(1);
    expect(result.current.activeQueue[0]?.text).toBe("Queued");
  });

  it("queues message for a non-active thread and dispatches via thread sender", async () => {
    const workspaceTwo: WorkspaceInfo = {
      ...workspace,
      id: "workspace-2",
      name: "Another",
      path: "/tmp/another",
    };
    const options = makeOptions({
      activeThreadId: "thread-1",
      activeWorkspace: workspace,
      threadStatusById: {
        "thread-1": { isProcessing: false, isReviewing: false },
        "thread-2": { isProcessing: false, isReviewing: false },
      },
      threadWorkspaceById: {
        "thread-1": "workspace-1",
        "thread-2": "workspace-2",
      },
      workspacesById: new Map([
        ["workspace-1", workspace],
        ["workspace-2", workspaceTwo],
      ]),
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessageForThread("thread-2", "continue background");
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(options.sendUserMessageToThread).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessageToThread).toHaveBeenCalledWith(
      workspaceTwo,
      "thread-2",
      "continue background",
      [],
    );
    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(options.clearActiveImages).not.toHaveBeenCalled();
  });

  it("ignores queueMessageForThread when thread workspace is unresolved", async () => {
    const options = makeOptions({
      activeThreadId: "thread-1",
      activeWorkspace: workspace,
      threadWorkspaceById: {
        "thread-1": "workspace-1",
      },
      workspacesById: new Map([["workspace-1", workspace]]),
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessageForThread("thread-2", "missing mapping");
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(options.sendUserMessageToThread).not.toHaveBeenCalled();
    expect(result.current.queuedByThread["thread-2"] ?? []).toEqual([]);
  });

  it("does not flush active queue while active turn id exists", async () => {
    const options = makeOptions({
      activeTurnId: "turn-1",
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
      await result.current.queueMessage("wait-for-turn-end");
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(result.current.activeQueue.map((item) => item.text)).toEqual(["wait-for-turn-end"]);

    await act(async () => {
      rerender({
        ...options,
        activeTurnId: null,
        threadStatusById: {
          "thread-1": {
            isProcessing: false,
            isReviewing: false,
            processingStartedAt: null,
          },
        },
      });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("wait-for-turn-end", []);
  });

  it("queues while processing when steer is enabled", async () => {
    const options = makeOptions({ isProcessing: true, steerEnabled: true });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("Steer");
    });

    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(result.current.activeQueue).toHaveLength(1);
    expect(result.current.activeQueue[0]?.text).toBe("Steer");
  });

  it("allows steering queued message while processing when turn id is unavailable", async () => {
    const options = makeOptions({
      isProcessing: true,
      steerEnabled: true,
      activeTurnId: null,
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("Wait for turn");
    });

    const queued = result.current.activeQueue[0];
    expect(queued?.text).toBe("Wait for turn");

    await act(async () => {
      const ok = await result.current.steerQueuedMessage("thread-1", queued?.id ?? "");
      expect(ok).toBe(true);
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("Wait for turn", [], {
      forceSteer: true,
    });
    expect(result.current.activeQueue).toHaveLength(0);
  });

  it("allows steering queued message when idle", async () => {
    const options = makeOptions({
      isProcessing: false,
      steerEnabled: true,
      activeTurnId: null,
      activeWorkspace: null,
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("steer while idle");
    });

    const queued = result.current.activeQueue[0];
    expect(queued?.text).toBe("steer while idle");

    await act(async () => {
      const ok = await result.current.steerQueuedMessage("thread-1", queued?.id ?? "");
      expect(ok).toBe(true);
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("steer while idle", [], {
      forceSteer: true,
    });
    expect(result.current.activeQueue).toHaveLength(0);
  });

  it("does not steer queued message when steer mode is disabled", async () => {
    const options = makeOptions({
      isProcessing: false,
      steerEnabled: false,
      activeTurnId: null,
      activeWorkspace: null,
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("steer with toggle off");
    });

    const queued = result.current.activeQueue[0];
    expect(queued?.text).toBe("steer with toggle off");

    await act(async () => {
      const ok = await result.current.steerQueuedMessage("thread-1", queued?.id ?? "");
      expect(ok).toBe(false);
    });

    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(result.current.activeQueue).toHaveLength(1);
  });

  it("queues while processing when steer is enabled and turn id exists", async () => {
    const options = makeOptions({
      isProcessing: true,
      steerEnabled: true,
      activeTurnId: "turn-1",
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("Steer direct send");
    });

    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(result.current.activeQueue).toHaveLength(1);
    expect(result.current.activeQueue[0]?.text).toBe("Steer direct send");
  });

  it("queues when active turn id exists and steer is enabled even if processing is false", async () => {
    const options = makeOptions({
      isProcessing: false,
      steerEnabled: true,
      activeTurnId: "turn-1",
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("Steer with turn id only");
    });

    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(result.current.activeQueue).toHaveLength(1);
    expect(result.current.activeQueue[0]?.text).toBe("Steer with turn id only");
  });

  it("allows steering queued message when active turn id exists and processing is false", async () => {
    const options = makeOptions({
      isProcessing: false,
      steerEnabled: true,
      activeTurnId: "turn-1",
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("queued via steer button");
    });

    const queued = result.current.activeQueue[0];
    expect(queued?.text).toBe("queued via steer button");

    await act(async () => {
      const ok = await result.current.steerQueuedMessage("thread-1", queued?.id ?? "");
      expect(ok).toBe(true);
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("queued via steer button", [], {
      forceSteer: true,
    });
    expect(result.current.activeQueue).toHaveLength(0);
  });

  it("retries queued send after failure", async () => {
    const options = makeOptions({
      sendUserMessage: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce(undefined),
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("Retry");
    });

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(2);
    expect(options.sendUserMessage).toHaveBeenLastCalledWith("Retry", []);
  });

  it("queues messages per thread and only flushes the active thread without workspace mapping", async () => {
    const options = makeOptions({ isProcessing: true });
    const { result, rerender } = renderHook(
      (props) => useQueuedSend(props),
      { initialProps: options },
    );

    await act(async () => {
      await result.current.queueMessage("Thread-1");
    });

    await act(async () => {
      rerender({ ...options, activeThreadId: "thread-2", isProcessing: false });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(result.current.queueHealthEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          threadId: "thread-1",
          queueLength: 1,
          inFlight: false,
          blockedReason: "workspace_unresolved",
          lastFailureReason: null,
        }),
      ]),
    );

    await act(async () => {
      rerender({ ...options, activeThreadId: "thread-1", isProcessing: false });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("Thread-1", []);
  });

  it("drains queued thread after global processing clears", async () => {
    const workspaceTwo: WorkspaceInfo = {
      ...workspace,
      id: "workspace-2",
      name: "Another",
      path: "/tmp/another",
    };
    const options = makeOptions({
      activeThreadId: "thread-1",
      activeWorkspace: workspace,
      isProcessing: true,
      threadStatusById: {
        "thread-1": { isProcessing: false, isReviewing: false },
        "thread-2": { isProcessing: false, isReviewing: false },
      },
      threadWorkspaceById: {
        "thread-1": "workspace-1",
        "thread-2": "workspace-2",
      },
      workspacesById: new Map([
        ["workspace-1", workspace],
        ["workspace-2", workspaceTwo],
      ]),
    });
    const { result, rerender } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("wait until global processing ends");
    });

    await act(async () => {
      rerender({
        ...options,
        activeThreadId: "thread-2",
        activeTurnId: "turn-2",
        activeWorkspace: workspaceTwo,
        isProcessing: true,
        isReviewing: false,
      });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(options.sendUserMessageToThread).not.toHaveBeenCalled();
    expect(result.current.queuedByThread["thread-1"]?.map((item) => item.text)).toEqual([
      "wait until global processing ends",
    ]);
    expect(
      result.current.queueHealthEntries.find((entry) => entry.threadId === "thread-1")
        ?.queueLength,
    ).toBe(1);

    await act(async () => {
      rerender({
        ...options,
        activeThreadId: "thread-2",
        activeTurnId: null,
        activeWorkspace: workspaceTwo,
        isProcessing: false,
        isReviewing: false,
      });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(options.sendUserMessageToThread).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessageToThread).toHaveBeenCalledWith(
      workspace,
      "thread-1",
      "wait until global processing ends",
      [],
    );
    expect(result.current.queuedByThread["thread-1"] ?? []).toEqual([]);
    expect(
      result.current.queueHealthEntries.find((entry) => entry.threadId === "thread-1")
        ?.blockedReason,
    ).toBe("awaiting_turn_start_event");
  });

  it("drains active-thread queue even when another thread is globally processing", async () => {
    const workspaceTwo: WorkspaceInfo = {
      ...workspace,
      id: "workspace-2",
      name: "Another",
      path: "/tmp/another",
    };
    const options = makeOptions({
      activeThreadId: "thread-1",
      activeWorkspace: workspace,
      activeTurnId: null,
      isProcessing: false,
      threadStatusById: {
        "thread-1": { isProcessing: false, isReviewing: false },
        "thread-2": {
          isProcessing: true,
          isReviewing: false,
          processingStartedAt: Date.now(),
        },
      },
      threadWorkspaceById: {
        "thread-1": "workspace-1",
        "thread-2": "workspace-2",
      },
      workspacesById: new Map([
        ["workspace-1", workspace],
        ["workspace-2", workspaceTwo],
      ]),
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("active thread should still drain");
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("active thread should still drain", []);
  });

  it("dispatches non-active queued message when workspace mapping is available", async () => {
    const workspaceTwo: WorkspaceInfo = {
      ...workspace,
      id: "workspace-2",
      name: "Another",
      path: "/tmp/another",
    };
    const options = makeOptions({
      activeThreadId: "thread-1",
      activeWorkspace: workspace,
      isProcessing: true,
      threadStatusById: {
        "thread-1": { isProcessing: false, isReviewing: false },
        "thread-2": { isProcessing: false, isReviewing: false },
      },
      threadWorkspaceById: {
        "thread-1": "workspace-1",
        "thread-2": "workspace-2",
      },
      workspacesById: new Map([
        ["workspace-1", workspace],
        ["workspace-2", workspaceTwo],
      ]),
    });
    const { result, rerender } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("Thread-1 background drain");
    });

    await act(async () => {
      rerender({
        ...options,
        activeThreadId: "thread-2",
        activeTurnId: null,
        activeWorkspace: workspaceTwo,
        isProcessing: false,
        isReviewing: false,
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessageToThread).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessageToThread).toHaveBeenCalledWith(
      workspace,
      "thread-1",
      "Thread-1 background drain",
      [],
    );
    expect(result.current.queuedByThread["thread-1"] ?? []).toEqual([]);
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("waits for global processing before dispatching non-active queued thread", async () => {
    const workspaceTwo: WorkspaceInfo = {
      ...workspace,
      id: "workspace-2",
      name: "Another",
      path: "/tmp/another",
    };

    const options = makeOptions({
      activeThreadId: "thread-2",
      activeWorkspace: workspaceTwo,
      isProcessing: true,
      threadStatusById: {
        "thread-1": {
          isProcessing: true,
          isReviewing: false,
          processingStartedAt: Date.now(),
        },
        "thread-2": {
          isProcessing: false,
          isReviewing: false,
          processingStartedAt: null,
        },
      },
      threadWorkspaceById: {
        "thread-1": "workspace-1",
        "thread-2": "workspace-2",
      },
      workspacesById: new Map([
        ["workspace-1", workspace],
        ["workspace-2", workspaceTwo],
      ]),
    });

    const { result, rerender } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("thread-2 waits for global processing");
    });

    await act(async () => {
      rerender({
        ...options,
        activeThreadId: "thread-1",
        activeWorkspace: workspace,
        isProcessing: true,
        threadStatusById: {
          "thread-1": {
            isProcessing: true,
            isReviewing: false,
            processingStartedAt: Date.now(),
          },
          "thread-2": {
            isProcessing: false,
            isReviewing: false,
            processingStartedAt: null,
          },
        },
      });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(options.sendUserMessageToThread).not.toHaveBeenCalled();
    expect(
      result.current.queueHealthEntries.find((entry) => entry.threadId === "thread-2")
        ?.blockedReason,
    ).toBe("global_processing");

    await act(async () => {
      rerender({
        ...options,
        activeThreadId: "thread-1",
        activeWorkspace: workspace,
        isProcessing: false,
        threadStatusById: {
          "thread-1": {
            isProcessing: false,
            isReviewing: false,
            processingStartedAt: null,
          },
          "thread-2": {
            isProcessing: false,
            isReviewing: false,
            processingStartedAt: null,
          },
        },
      });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(options.sendUserMessageToThread).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessageToThread).toHaveBeenCalledWith(
      workspaceTwo,
      "thread-2",
      "thread-2 waits for global processing",
      [],
    );
    expect(result.current.queuedByThread["thread-2"] ?? []).toEqual([]);
  });

  it("dispatches non-active queued thread using queued workspace id fallback", async () => {
    const workspaceTwo: WorkspaceInfo = {
      ...workspace,
      id: "workspace-2",
      name: "Another",
      path: "/tmp/another",
    };
    const options = makeOptions({
      activeThreadId: "thread-1",
      activeWorkspace: workspace,
      isProcessing: true,
      threadStatusById: {
        "thread-1": { isProcessing: false, isReviewing: false },
        "thread-2": { isProcessing: false, isReviewing: false },
      },
      threadWorkspaceById: {
        "thread-2": "workspace-2",
      },
      workspacesById: new Map([
        ["workspace-1", workspace],
        ["workspace-2", workspaceTwo],
      ]),
    });
    const { result, rerender } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("Thread-1 queued while active");
    });

    await act(async () => {
      rerender({
        ...options,
        activeThreadId: "thread-2",
        activeTurnId: null,
        activeWorkspace: workspaceTwo,
        isProcessing: false,
        isReviewing: false,
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessageToThread).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessageToThread).toHaveBeenCalledWith(
      workspace,
      "thread-1",
      "Thread-1 queued while active",
      [],
    );
    expect(result.current.queuedByThread["thread-1"] ?? []).toEqual([]);
  });

  it("keeps background queue serial when switching threads", async () => {
    const workspaceTwo: WorkspaceInfo = {
      ...workspace,
      id: "workspace-2",
      name: "Another",
      path: "/tmp/another",
    };
    const options = makeOptions({
      activeThreadId: "thread-1",
      activeWorkspace: workspace,
      isProcessing: true,
      threadStatusById: {
        "thread-1": { isProcessing: false, isReviewing: false },
        "thread-2": { isProcessing: false, isReviewing: false },
      },
      threadWorkspaceById: {
        "thread-1": "workspace-1",
        "thread-2": "workspace-2",
      },
      workspacesById: new Map([
        ["workspace-1", workspace],
        ["workspace-2", workspaceTwo],
      ]),
    });
    const { result, rerender } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("Background first");
      await result.current.queueMessage("Background second");
    });

    await act(async () => {
      rerender({
        ...options,
        activeThreadId: "thread-2",
        activeTurnId: null,
        activeWorkspace: workspaceTwo,
        isProcessing: false,
        isReviewing: false,
      });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(options.sendUserMessageToThread).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessageToThread).toHaveBeenNthCalledWith(
      1,
      workspace,
      "thread-1",
      "Background first",
      [],
    );
    expect(result.current.queuedByThread["thread-1"]?.map((item) => item.text)).toEqual([
      "Background second",
    ]);
    expect(
      result.current.queueHealthEntries.find((entry) => entry.threadId === "thread-1")
        ?.blockedReason,
    ).toBe("awaiting_turn_start_event");
  });

  it("connects workspace before sending when disconnected", async () => {
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({
      activeWorkspace: { ...workspace, connected: false },
      connectWorkspace,
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("Connect");
    });

    expect(connectWorkspace).toHaveBeenCalledWith({
      ...workspace,
      connected: false,
    });
    expect(options.sendUserMessage).toHaveBeenCalledWith("Connect", []);
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

    await act(async () => {
      await Promise.resolve();
    });

    expect(options.startReview).toHaveBeenCalledTimes(1);
    expect(options.startReview).toHaveBeenCalledWith("/review check this");
    expect(options.sendUserMessage).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ ...options, isReviewing: true });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ ...options, isReviewing: false });
    });
    await act(async () => {
      await Promise.resolve();
    });

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

    await act(async () => {
      await Promise.resolve();
    });

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
    await act(async () => {
      await Promise.resolve();
    });

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

    await act(async () => {
      await Promise.resolve();
    });

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
      await Promise.resolve();
    });

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

    await act(async () => {
      await Promise.resolve();
    });

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

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

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

    await act(async () => {
      await Promise.resolve();
    });

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

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

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

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

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

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

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

    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retryThreadQueue("thread-1");
    });

    await act(async () => {
      await Promise.resolve();
    });

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
