// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposerQueue } from "./ComposerQueue";

describe("ComposerQueue", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows one-click migration action for legacy queue items", () => {
    const onMigrateLegacyQueue = vi.fn();

    render(
      <ComposerQueue
        queuedMessages={[]}
        legacyQueueMessageCount={2}
        onMigrateLegacyQueue={onMigrateLegacyQueue}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "一键迁移旧队列" }));

    expect(onMigrateLegacyQueue).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when queue is empty and no legacy item exists", () => {
    const { container } = render(
      <ComposerQueue queuedMessages={[]} legacyQueueMessageCount={0} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("supports collapsing and expanding the queue panel", () => {
    render(
      <ComposerQueue
        queuedMessages={[
          { id: "queued-1", text: "queued message 1", createdAt: Date.now(), images: [] },
        ]}
      />,
    );

    expect(screen.getByText("queued message 1")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "收起队列" }));
    expect(screen.queryByText("queued message 1")).toBeNull();
    expect(screen.getByText(/已收起 · 待发送: 1/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "展开队列" }));
    expect(screen.getByText("queued message 1")).not.toBeNull();
  });

  it("shows blocked recovery action and retries all blocked threads", () => {
    const onRetryQueuedThread = vi.fn();

    render(
      <ComposerQueue
        queuedMessages={[
          { id: "queued-1", text: "queued message", createdAt: Date.now(), images: [] },
        ]}
        onRetryQueuedThread={onRetryQueuedThread}
        queueHealthEntries={[
          {
            threadId: "thread-a",
            queueLength: 1,
            inFlight: true,
            blockedReason: "processing",
            lastFailureReason: null,
            workspaceResolved: true,
            workspaceId: "workspace-a",
          },
          {
            threadId: "thread-b",
            queueLength: 2,
            inFlight: false,
            blockedReason: "workspace_unresolved",
            lastFailureReason: null,
            workspaceResolved: false,
            workspaceId: null,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "恢复阻塞" }));

    expect(onRetryQueuedThread).toHaveBeenCalledTimes(2);
    expect(onRetryQueuedThread).toHaveBeenNthCalledWith(1, "thread-a");
    expect(onRetryQueuedThread).toHaveBeenNthCalledWith(2, "thread-b");
  });

  it("allows clicking steer button when steer is enabled", async () => {
    const onSteerQueued = vi.fn().mockResolvedValue(true);

    render(
      <ComposerQueue
        queuedMessages={[
          { id: "queued-1", text: "queued message 1", createdAt: Date.now(), images: [] },
        ]}
        onSteerQueued={onSteerQueued}
        canSteerQueued
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Steer" }));
      await new Promise<void>((resolve) => { queueMicrotask(resolve); });
    });

    expect(onSteerQueued).toHaveBeenCalledTimes(1);
    expect(onSteerQueued).toHaveBeenCalledWith("queued-1");
  });

  it("disables steer button when steer is disabled", () => {
    const onSteerQueued = vi.fn().mockResolvedValue(true);

    render(
      <ComposerQueue
        queuedMessages={[
          { id: "queued-1", text: "queued message 1", createdAt: Date.now(), images: [] },
        ]}
        onSteerQueued={onSteerQueued}
        canSteerQueued={false}
      />,
    );

    const button = screen.getByRole("button", { name: "Steer" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("deletes a queue item from row action", () => {
    const onDeleteQueued = vi.fn();

    render(
      <ComposerQueue
        queuedMessages={[
          { id: "queued-1", text: "queued message 1", createdAt: Date.now(), images: [] },
        ]}
        onDeleteQueued={onDeleteQueued}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "删除队列项" }));

    expect(onDeleteQueued).toHaveBeenCalledTimes(1);
    expect(onDeleteQueued).toHaveBeenCalledWith("queued-1");
  });

  it("renders blocked status label from health entry", () => {
    render(
      <ComposerQueue
        queuedMessages={[
          { id: "queued-1", text: "queued message 1", createdAt: Date.now(), images: [] },
        ]}
        queueHealthEntries={[
          {
            threadId: "thread-1",
            queueLength: 1,
            inFlight: true,
            blockedReason: "processing",
            lastFailureReason: null,
            workspaceResolved: true,
            workspaceId: "workspace-1",
          },
        ]}
      />,
    );

    expect(screen.getByText("线程处理中")).not.toBeNull();
    expect(screen.getByText(/待发送: 1/)).not.toBeNull();
  });
});
