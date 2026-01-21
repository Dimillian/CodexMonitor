// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useQueuedSend } from "./useQueuedSend";

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
  isProcessing: false,
  isReviewing: false,
  steerEnabled: false,
  activeWorkspace: workspace,
  connectWorkspace: vi.fn().mockResolvedValue(undefined),
  sendUserMessage: vi.fn().mockResolvedValue(undefined),
  startReview: vi.fn().mockResolvedValue(undefined),
  clearActiveImages: vi.fn(),
  ...overrides,
});

describe("useQueuedSend", () => {
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

  it("queues send while processing when steer is disabled", async () => {
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

  it("sends immediately while processing when steer is enabled", async () => {
    const options = makeOptions({ isProcessing: true, steerEnabled: true });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("Steer");
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("Steer", []);
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

  it("queues messages per thread and only flushes the active thread", async () => {
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

    await act(async () => {
      rerender({ ...options, activeThreadId: "thread-1", isProcessing: false });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("Thread-1", []);
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
});
